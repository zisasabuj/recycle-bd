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
      let likeNewCount = 0;
      let goodCount = 0;
      let counts = {};
      try {
        const likeNew = await prisma.auction.updateMany({
          where: { condition: 'Like New' },
          data: { condition: 'New' },
        });
        likeNewCount = likeNew.count;

        const good = await prisma.auction.updateMany({
          where: { condition: 'Good' },
          data: { condition: 'Used' },
        });
        goodCount = good.count;

        const all = await prisma.auction.findMany({
          select: { condition: true },
        });
        for (const a of all) {
          counts[a.condition] = (counts[a.condition] || 0) + 1;
        }
      } catch (dbErr) {
        return json(res, 500, {
          ok: false,
          stage: 'db',
          error: dbErr.message,
          code: dbErr.code,
          meta: dbErr.meta,
        });
      }

      return json(res, 200, {
        ok: true,
        migrated: true,
        changed: {
          'Like New → New': likeNewCount,
          'Good → Used': goodCount,
        },
        currentDistribution: counts,
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
    return json(res, 500, {
      ok: false,
      stage: 'outer',
      error: err.message,
      code: err.code,
    });
  }
});