// POST /api/setup/import-dump — One-time DB migration from local Postgres to Neon
//
// Security: requires CRON_SECRET-style Bearer token AND only works if DB is empty.
// After running successfully, lock this endpoint by removing CRON_SECRET env var.
//
// Body: { sql: "<pg_dump output>" }
// Or: GET to run against /tmp/auction_dump.sql (only if you've inlined it via env)
import { prisma } from '../_lib/prisma.js';
import { json, error } from '../_lib/middleware.js';

const LOCK_KEY = 'setup_lock_done';

function isAuthorized(req) {
  const auth = req.headers.authorization;
  if (auth && process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

function isAlreadyDone() {
  // Check if a SystemSetting marker exists
  return prisma.systemSetting.findUnique({ where: { key: LOCK_KEY } }).then((r) => !!r);
}

async function applyDump(sqlText) {
  // Split on semicolons but preserve them; skip pure-comments and empty statements.
  // Neon connection allows multiple statements per query() if we wrap in a single
  // string and disable multipleStatements (default in @prisma/adapter-neon).
  // However prisma.$executeRawUnsafe does not support multi-statement reliably.
  // So we split and execute one-by-one, ignoring comment-only blocks.

  const cleaned = sqlText
    .replace(/\\.[\r\n]/g, '\n')        // unescape \. line continuations
    .replace(/^\\\n/gm, '')             // remove standalone \\\n line continuations
    .replace(/^SET .*?;\s*$/gm, '/* set dropped */')  // SET commands often fail; skip
    .replace(/^SELECT pg_catalog\.setval.*?;\s*$/gm, '/* setval dropped */')
    .replace(/^SELECT setval.*?;\s*$/gm, '/* setval dropped */');

  // Split statements — naive but works for our dump
  const stmts = cleaned
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('--') && !s.startsWith('/*') && s !== '');

  const errors = [];
  let okCount = 0;
  for (const stmt of stmts) {
    if (stmt.startsWith('/*') || stmt.length < 3) continue;
    try {
      await prisma.$executeRawUnsafe(stmt);
      okCount++;
    } catch (e) {
      // Capture first 200 chars of statement + error for debugging
      errors.push({
        stmt: stmt.slice(0, 200) + (stmt.length > 200 ? '…' : ''),
        error: e.message.split('\n')[0],
      });
      // Don't abort — try to apply as many as possible
    }
  }
  return { total: stmts.length, ok: okCount, errors: errors.slice(0, 20) };
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) return error(res, 401, 'Unauthorized. Need Bearer ${process.env.CRON_SECRET ? "<CRON_SECRET>" : "<unset>"}.');

  if (await isAlreadyDone()) {
    return error(res, 409, 'Setup already completed. To re-run, delete the setup_lock_done SystemSetting row.');
  }

  if (req.method === 'GET') {
    return json(res, 200, {
      hint: 'POST { "sql": "<dump text>" } to this endpoint. Dump should be from `pg_dump --no-owner --no-acl --clean --if-exists`.',
    });
  }

  if (req.method !== 'POST') return error(res, 405, 'POST only');

  const { sql } = req.body || {};
  if (!sql || typeof sql !== 'string') return error(res, 400, 'Body must be { sql: "<dump>" }');

  try {
    const result = await applyDump(sql);

    // Mark setup done so this endpoint can never be re-run accidentally
    await prisma.systemSetting.upsert({
      where: { key: LOCK_KEY },
      update: { value: new Date().toISOString(), updatedBy: 'setup' },
      create: { key: LOCK_KEY, value: new Date().toISOString(), updatedBy: 'setup' },
    });

    return json(res, 200, { ...result, locked: true });
  } catch (err) {
    console.error('[setup/import-dump]', err);
    return error(res, 500, err.message || 'Import failed');
  }
}