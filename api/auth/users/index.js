// GET /api/auth/users — SUPER_ADMIN only, lists all users
import { prisma } from '../../_lib/prisma.js';
import { withAuth, json, error } from '../../_lib/middleware.js';

export default withAuth(async (req, res, { user }) => {
  if (req.method !== 'GET') return error(res, 405, 'GET only');
  if (user.role !== 'SUPER_ADMIN') return error(res, 403, 'SUPER_ADMIN only');
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        rating: true,
        createdAt: true,
        _count: { select: { auctions: true, bids: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return json(res, 200, { users });
  } catch (err) {
    console.error('[users list]', err);
    return error(res, 500, 'Failed to list users');
  }
});