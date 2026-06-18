#!/usr/bin/env node
// migrate-images.js — uploads all local /backend/uploads/* files to imgBB,
// then updates the local Postgres auction rows to point to the new URLs.
//
// Run ONCE before exporting the SQL dump. After this, every image referenced
// in the DB is an imgBB URL, so the Vercel-hosted frontend can render them
// without needing /uploads/* served anywhere.
//
// Usage:
//   cd backend && node scripts/migrate-images.js
// Env required: IMGBB_API_KEY (read from backend/.env)

import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');
const IMGBB_KEY = process.env.IMGBB_API_KEY;

if (!IMGBB_KEY) {
  console.error('❌ IMGBB_API_KEY not set in .env');
  process.exit(1);
}

const prisma = new PrismaClient();

async function walk(dir, base = dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(p, base)));
    } else if (/\.(jpe?g|png|webp|heic)$/i.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

async function uploadOne(filePath) {
  const buf = await readFile(filePath);
  const base64 = buf.toString('base64');
  const formData = new URLSearchParams();
  formData.set('image', base64);
  const name = basename(filePath).replace(/\.[^.]+$/, '');
  formData.set('name', name);

  const url = `https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`imgBB ${r.status}: ${text.slice(0, 200)}`);
  }
  const json = await r.json();
  if (!json.success) throw new Error(`imgBB error: ${JSON.stringify(json.error)}`);
  return json.data.url;
}

async function main() {
  console.log('📂 Scanning', UPLOADS_DIR);
  const files = await walk(UPLOADS_DIR);
  console.log(`   Found ${files.length} image files`);

  // Build map: local filename → imgBB URL
  const urlMap = new Map();
  for (const f of files) {
    const name = basename(f);
    process.stdout.write(`   ↑ ${name} … `);
    try {
      const url = await uploadOne(f);
      urlMap.set(name, url);
      console.log('✅', url.slice(0, 60) + '…');
    } catch (e) {
      console.log('❌', e.message);
    }
  }

  console.log(`\n🔄 Updating auction rows that reference local images…`);
  const auctions = await prisma.auction.findMany({
    where: { images: { isEmpty: false } },
    select: { id: true, title: true, images: true },
  });

  let updatedCount = 0;
  let unchangedCount = 0;
  for (const a of auctions) {
    const newImages = a.images.map((img) => {
      // Try matching by trailing basename or by exact filename
      const seg = img.split('?')[0].split('/').pop();
      if (urlMap.has(seg)) return urlMap.get(seg);
      // If still localhost/file path, just keep it (will be replaced by manual edit)
      if (img.startsWith('http://localhost') || img.startsWith('http://127.0.0.1')) {
        // Extract basename, try once more
        return img;
      }
      return img;
    });
    const changed = newImages.some((img, i) => img !== a.images[i]);
    if (changed) {
      await prisma.auction.update({
        where: { id: a.id },
        data: { images: newImages },
      });
      console.log(`   ✓ ${a.title.slice(0, 50)} → ${newImages.length} images`);
      updatedCount++;
    } else {
      unchangedCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Images uploaded:    ${urlMap.size}/${files.length}`);
  console.log(`   Auctions updated:   ${updatedCount}`);
  console.log(`   Auctions unchanged: ${unchangedCount}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('💥', e);
  process.exit(1);
});