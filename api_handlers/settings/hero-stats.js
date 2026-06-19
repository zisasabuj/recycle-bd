// GET /api/settings/hero-stats — public, frontend reads on load
// PUT /api/admin/settings/hero-stats — SUPER_ADMIN only
// Stored as SystemSetting rows: hero_active_count, hero_anonymity_pct,
// hero_duration_label, hero_users_count. All values are short strings (max 32 chars).
import { prisma } from '../../_lib/prisma.js';
import { withCors, json, error } from '../../_lib/middleware.js';
import { getUserFromHeader } from '../../_lib/auth.js';

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

async function handlePut(req, res) {
  const payload = getUserFromHeader(req.headers.authorization);
  if (!payload) return error(res, 401, 'Missing auth');
  const requester = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!requester || requester.role !== 'SUPER_ADMIN') return error(res, 403, 'SUPER_ADMIN only');
  const body = req.body || {};
  const toSave = {};
  for (const k of KEYS) {
    if (typeof body[k] === 'string') {
      const v = body[k].slice(0, 32).trim();
      if (v.length > 0) toSave[k] = v;
    }
  }
  if (Object.keys(toSave).length === 0) return error(res, 400, 'No valid fields provided');
  for (const [k, v] of Object.entries(toSave)) {
    await prisma.systemSetting.upsert({
      where: { key: k },
      update: { value: v, updatedBy: payload.userId },
      create: { key: k, value: v, updatedBy: payload.userId },
    });
  }
  return json(res, 200, { ok: true, updated: Object.keys(toSave) });
}

export default withCors(async (req, res) => {
  try {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'PUT') return handlePut(req, res);
    return error(res, 405, 'GET or PUT only');
  } catch (err) {
    console.error('[hero-stats]', err);
    return error(res, 500, 'Failed');
  }
});