// POST /api/auth/register
import { prisma } from '../_lib/prisma.js';
import { hashPassword, signToken } from '../_lib/auth.js';
import { withCors, json, error } from '../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    const { username, email, password, fullName, phone, role } = req.body || {};
    if (!username || !email || !password) {
      return error(res, 400, 'username, email, password required');
    }
    if (password.length < 6) {
      return error(res, 400, 'Password must be at least 6 characters');
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      return error(res, 409, 'Username or email already taken');
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        fullName: fullName || null,
        phone: phone || null,
        role: role || 'BOTH',
      },
      select: { id: true, username: true, email: true, fullName: true, role: true, createdAt: true },
    });

    const token = signToken({ userId: user.id, username: user.username });
    return json(res, 201, { user, token });
  } catch (err) {
    console.error('[register]', err);
    return error(res, 500, 'Registration failed: ' + (err.message || 'unknown') + ' | code=' + (err.code || 'n/a'));
  }
});