// POST /api/import-data
// One-shot: runs the SQL dump from local Docker DB against the
// production Neon DB. Idempotent — uses ON CONFLICT (id) DO NOTHING
// where the SQL has plain INSERTs.
//
// Pass the SQL via:
//   - body.sql: raw SQL string (POST JSON), OR
//   - body.url:  URL to fetch the SQL from (POST JSON)
//
// The dump file is small (95 lines for 7 auctions), so body.sql is fine.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  // Vercel may not auto-parse JSON in some configs; read body manually.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }
  body = body || {};

  let sql = body.sql;
  if (!sql && body.url) {
    const r = await fetch(body.url);
    if (!r.ok) return res.status(502).json({ error: 'Failed to fetch url', status: r.status });
    sql = await r.text();
  }
  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'Provide body.sql or body.url' });
  }

  // Strip pg_dump preamble (SET statements, role comments) — they
  // often fail in managed Postgres (Neon) and we don't need them.
  // Keep only actual SQL statements.
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s =>
      s.length > 0 &&
      !s.startsWith('--') &&
      !/^SET\b/i.test(s) &&
      !/^SELECT\s+pg_catalog/i.test(s) &&
      !/^\\\\restrict/i.test(s) &&
      !/^\\\\unrestrict/i.test(s)
    );

  const results = { total: statements.length, applied: 0, skipped: 0, errors: [] };

  for (const stmt of statements) {
    // Wrap INSERTs in ON CONFLICT (id) DO NOTHING for idempotency.
    // Other statements (rare) just run as-is.
    let s = stmt.trim();
    if (/^INSERT\s+INTO\s+/i.test(s) && /\(id,/.test(s) && !/ON CONFLICT/i.test(s)) {
      s = s.replace(/;\s*$/, '') + ' ON CONFLICT (id) DO NOTHING;';
    }
    try {
      await prisma.$executeRawUnsafe(s);
      results.applied++;
    } catch (e) {
      if (/duplicate key|already exists|violates unique/i.test(e.message)) {
        results.skipped++;
      } else {
        results.errors.push({ sql: s.slice(0, 100) + '...', error: e.message });
      }
    }
  }

  return res.status(200).json({
    success: results.errors.length === 0,
    ...results,
  });
}
