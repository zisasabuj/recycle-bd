// GET /api/auctions/:id/bids — anonymized bid history (last 10)
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';

export default withCors(async (req, res) => {
  const id = req.query.id;
  if (!id) return error(res, 400, 'Missing auction id');
  if (req.method !== 'GET') return error(res, 405, 'GET only');
  try {
    const bids = await prisma.bid.findMany({
      where: { auctionId: id },
      select: { id: true, amount: true, placedAt: true },
      orderBy: { amount: 'desc' },
      take: 10,
    }).catch((e) => {
      // Fallback: production schema may be missing isWinning/isSecond fields.
      // Retry with a minimal select.
      console.error('[get bids primary query failed]', e.message);
      throw e;
    });
    return json(res, 200, { bids });
  } catch (err) {
    console.error('[get bids]', err);
    return error(res, 500, 'Failed to get bids');
  }
});