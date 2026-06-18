// /api/auth/me — GET (current user) and PUT (update profile)
import { prisma } from '../_lib/prisma.js';
import { withAuth, json, error } from '../_lib/middleware.js';

export default withAuth(async (req, res) => {
  try {
    if (req.method === 'GET') {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: {
          id: true, username: true, email: true, fullName: true, phone: true,
          role: true, rating: true, createdAt: true,
        },
      });
      if (!user) return error(res, 404, 'User not found');
      return json(res, 200, { user });
    }
    if (req.method === 'PUT') {
      const { fullName, phone, email } = req.body || {};
      const data = {};
      if (fullName !== undefined) data.fullName = fullName || null;
      if (phone !== undefined) data.phone = phone || null;
      if (email !== undefined) {
        if (!email.includes('@')) return error(res, 400, 'Invalid email');
        const conflict = await prisma.user.findFirst({
          where: { email, NOT: { id: req.userId } },
          select: { id: true },
        });
        if (conflict) return error(res, 409, 'Email already in use');
        data.email = email;
      }
      const updated = await prisma.user.update({
        where: { id: req.userId },
        data,
        select: {
          id: true, username: true, email: true, fullName: true, phone: true,
          role: true, rating: true, createdAt: true,
        },
      });
      return json(res, 200, { user: updated });
    }
    return error(res, 405, 'GET or PUT only');
  } catch (err) {
    console.error('[me]', err);
    return error(res, 500, 'Failed');
  }
});