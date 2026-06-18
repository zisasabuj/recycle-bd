// GET /api/notifications — list current user's notifications (polling replaces socket)
// POST /api/notifications/read-all — mark all as read
import { prisma } from '../_lib/prisma.js';
import { withCors, withAuth, json, error } from '../_lib/middleware.js';

export default withCors(withAuth(async (req, res) => {
  try {
    if (req.method === 'GET') {
      const { unreadOnly } = req.query;
      const where = { userId: req.userId };
      if (unreadOnly === '1' || unreadOnly === 'true') where.readAt = null;
      const items = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      const unread = await prisma.notification.count({
        where: { userId: req.userId, readAt: null },
      });
      return json(res, 200, { notifications: items, unread });
    }
    if (req.method === 'POST' && req.url?.includes('read-all')) {
      await prisma.notification.updateMany({
        where: { userId: req.userId, readAt: null },
        data: { readAt: new Date() },
      });
      return json(res, 200, { ok: true });
    }
    return error(res, 405, 'GET only (use /api/notifications/read-all for POST)');
  } catch (err) {
    console.error('[notifications]', err);
    return error(res, 500, 'Failed');
  }
}));