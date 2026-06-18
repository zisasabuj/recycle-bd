// PUT /api/admin/settings/edit-mode — SUPER_ADMIN only (alias under /api/admin path)
import { prisma } from '../../_lib/prisma.js';
import { withCors, json, error } from '../../_lib/middleware.js';
import { getUserFromHeader } from '../../_lib/auth.js';

export default withCors(async (req, res) => {
  if (req.method !== 'PUT') return error(res, 405, 'PUT only');
  try {
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
  } catch (err) {
    console.error('[admin edit-mode PUT]', err);
    return error(res, 500, 'Failed');
  }
});