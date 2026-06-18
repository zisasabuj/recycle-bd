// GET /api/settings/edit-mode — public, frontend reads to know what to allow
// PUT /api/admin/settings/edit-mode — SUPER_ADMIN only, opens/closes auction edit
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';
import { getUserFromHeader } from '../../../_lib/auth.js';

async function handleGet(req, res) {
  const s = await prisma.systemSetting.findUnique({ where: { key: 'edit_mode' } });
  const mode = (s && (s.value === 'CLOSE' || s.value === 'OPEN')) ? s.value : 'OPEN';
  return json(res, 200, { mode });
}

async function handlePut(req, res) {
  const payload = getUserFromHeader(req.headers.authorization);
  if (!payload) return error(res, 401, 'Missing auth');
  const requester = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!requester || requester.role !== 'SUPER_ADMIN') return error(res, 403, 'SUPER_ADMIN only');
  const { mode } = req.body || {};
  if (mode !== 'OPEN' && mode !== 'CLOSE') return error(res, 400, 'mode must be OPEN or CLOSE');
  await prisma.systemSetting.upsert({
    where: { key: 'edit_mode' },
    update: { value: mode, updatedBy: payload.userId },
    create: { key: 'edit_mode', value: mode, updatedBy: payload.userId },
  });
  return json(res, 200, { ok: true, mode });
}

export default withCors(async (req, res) => {
  try {
    if (req.method === 'GET') return handleGet(req, res);
    if (req.method === 'PUT') return handlePut(req, res);
    return error(res, 405, 'GET or PUT only');
  } catch (err) {
    console.error('[edit-mode]', err);
    return error(res, 500, 'Failed');
  }
});