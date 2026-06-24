// POST /api/x/auth-login
import { prisma } from '../_lib/prisma.js';
import { comparePassword, signToken } from '../_lib/auth.js';
import { withCors, json, error } from '../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    const { emailOrUsername, password } = req.body || {};
    if (!emailOrUsername || !password) {
      return error(res, 400, 'emailOrUsername and password required');
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailOrUsername }, { username: emailOrUsername }],
      },
    });
    if (!user) return error(res, 401, 'Invalid credentials');

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) return error(res, 401, 'Invalid credentials');

    const token = signToken({ userId: user.id, username: user.username });
    return json(res, 200, {
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
    console.error('[auth-login]', err);
    return error(res, 500, 'Login failed: ' + (err.message || 'unknown') + ' | code=' + (err.code || 'n/a'));
  }
});
