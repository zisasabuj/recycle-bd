// POST /api/admin/reset-password  — ONE-OFF
// (a) Resets password for a user. Body: { username, newPassword, secret }
// (b) ONE-TIME migration: when called with { migrate: true, secret } (no username),
//     maps "Like New" → "New" and "Good" → "Used" on the Auction table.
import { prisma } from '../_lib/prisma.js';
import { hashPassword } from '../_lib/auth.js';
import { withCors, json, error } from '../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    const { username, newPassword, secret, migrate } = req.body || {};
    if (secret !== 'reset-bidblind-2026') return error(res, 403, 'Bad secret');

    // (b) one-time condition migration
    if (migrate === true) {
      const before = await prisma.auction.groupBy({
        by: ['condition'],
        _count: { _all: true },
      });
      const beforeMap = Object.fromEntries(before.map(b => [b.condition, b._count._all]));

      const likeNew = await prisma.auction.updateMany({
        where: { condition: 'Like New' },
        data: { condition: 'New' },
      });
      const good = await prisma.auction.updateMany({
        where: { condition: 'Good' },
        data: { condition: 'Used' },
      });

      const after = await prisma.auction.groupBy({
        by: ['condition'],
        _count: { _all: true },
      });
      const afterMap = Object.fromEntries(after.map(a => [a.condition, a._count._all]));

      return json(res, 200, {
        ok: true,
        migrated: true,
        before: beforeMap,
        after: afterMap,
        changed: {
          'Like New → New': likeNew.count,
          'Good → Used': good.count,
        },
      });
    }

    // (a) password reset
    if (!username || !newPassword) return error(res, 400, 'username + newPassword required');
    const passwordHash = await hashPassword(newPassword);
    const user = await prisma.user.update({
      where: { username },
      data: { passwordHash },
      select: { id: true, username: true, email: true, role: true },
    });
    return json(res, 200, { ok: true, user });
  } catch (err) {
    console.error('[reset-password / migrate]', err);
    return error(res, 500, 'Reset/migrate failed');
  }
});