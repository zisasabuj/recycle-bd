// POST /api/x/auth-register
import { prisma } from '../_lib/prisma.js';
import { hashPassword, signToken } from '../_lib/auth.js';
import { withCors, json, error } from '../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    const { username, email, password, fullName, phone } = req.body || {};
    if (!username || !email || !password) {
      return error(res, 400, 'username, email and password required');
    }

    // Check if user exists
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) return error(res, 409, 'User already exists');

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { username, email, passwordHash, fullName: fullName || '', phone: phone || '' },
    });

    const token = signToken({ userId: user.id, username: user.username });
    return json(res, 201, {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    console.error('[auth-register]', err);
    return error(res, 500, 'Registration failed: ' + (err.message || 'unknown'));
  }
});
