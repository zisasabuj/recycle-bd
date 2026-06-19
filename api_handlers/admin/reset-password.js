// POST /api/admin/reset-password  — ONE-OFF
// Resets password for a user. Body: { username, newPassword, secret }
import { prisma } from '../_lib/prisma.js';
import { hashPassword } from '../_lib/auth.js';
import { withCors, json, error } from '../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    const { username, newPassword, secret } = req.body || {};
    if (secret !== 'reset-bidblind-2026') return error(res, 403, 'Bad secret');
    if (!username || !newPassword) return error(res, 400, 'username + newPassword required');
    const passwordHash = await hashPassword(newPassword);
    const user = await prisma.user.update({
      where: { username },
      data: { passwordHash },
      select: { id: true, username: true, email: true, role: true },
    });
    return json(res, 200, { ok: true, user });
  } catch (err) {
    console.error('[reset-password]', err);
    return error(res, 500, 'Reset failed');
  }
});
