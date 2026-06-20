// /api/admin/migrate-conditions — ONE-TIME migration
// Maps existing condition values to the new "Used"/"New" filter set:
//   "Like New" → "New"
//   "Good"     → "Used"
// Leaves "Used" and "New" untouched.
//
// POST /api/admin/migrate-conditions
// body: { secret: "reset-bidblind-2026" }
import { prisma } from '../../_lib/prisma.js';
import { withCors } from '../../_lib/middleware.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  const { secret } = req.body || {};
  if (secret !== 'reset-bidblind-2026') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
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

    return res.json({
      success: true,
      before: beforeMap,
      after: afterMap,
      changed: {
        'Like New → New': likeNew.count,
        'Good → Used': good.count,
      },
    });
  } catch (e) {
    console.error('[migrate-conditions]', e);
    return res.status(500).json({ error: 'Migration failed', detail: e.message });
  }
}

export default withCors(handler);