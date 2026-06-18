// PUT /api/auth/users/:id/role — SUPER_ADMIN only, promotes/demotes users
import { prisma } from '../../../_lib/prisma.js';
import { withAuth, json, error } from '../../../_lib/middleware.js';

export default withAuth(async (req, res, { user }) => {
  if (req.method !== 'PUT') return error(res, 405, 'PUT only');
  if (user.role !== 'SUPER_ADMIN') return error(res, 403, 'SUPER_ADMIN only');
  try {
    const { role } = req.body || {};
    if (!['BUYER', 'SELLER', 'BOTH', 'ADMIN', 'SUPER_ADMIN'].includes(role)) {
      return error(res, 400, 'Invalid role');
    }
    const updated = await prisma.user.update({
      where: { id: req.query.id },
      select: { id: true, username: true, email: true, role: true },
      data: { role },
    });
    return json(res, 200, { user: updated, message: `${updated.username} → ${updated.role}` });
  } catch (err) {
    console.error('[role update]', err);
    return error(res, 500, 'Failed to update role');
  }
});