// GET /api/hero-stats — public, top-level Vercel function (bypasses [[...path]] catch-all)
import { prisma } from '../_lib/prisma.js';
import { withCors, json, error } from '../_lib/middleware.js';

const KEYS = ['hero_active_count', 'hero_anonymity_pct', 'hero_duration_label', 'hero_users_count'];

async function handleGet(req, res) {
  let out = {
    hero_active_count: '0',
    hero_anonymity_pct: '100%',
    hero_duration_label: '48h',
    hero_users_count: '0'
  };
  try {
    if (prisma.systemSetting) {
      const rows = await prisma.systemSetting.findMany({ where: { key: { in: KEYS } } });
      for (const r of rows) {
        if (out.hasOwnProperty(r.key) && typeof r.value === 'string') {
          out[r.key] = r.value.slice(0, 32);
        }
      }
    }
  } catch (e) {
    console.error('[hero-stats get]', e.message);
  }
  return json(res, 200, out);
}

export default withCors(async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  return error(res, 405, 'Method not allowed');
});