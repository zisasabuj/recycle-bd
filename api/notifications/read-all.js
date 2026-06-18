// POST /api/notifications/read-all — mark all current user's notifications as read
import { prisma } from '../../_lib/prisma.js';
import { withCors, withAuth, json, error } from '../../_lib/middleware.js';

export default withCors(withAuth(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('[notifications read-all]', err);
    return error(res, 500, 'Failed');
  }
}));