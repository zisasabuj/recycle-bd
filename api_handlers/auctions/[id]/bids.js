// GET /api/auctions/:id/bids — anonymized bid history (last 10)
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';

export default withCors(async (req, res) => {
  const id = req.query.id;
  if (!id) return error(res, 400, 'Missing auction id');
  if (req.method !== 'GET') return error(res, 405, 'GET only');
  try {
    // NOTE: production Bid schema only has these scalar fields: auctionId, bidderId, placedAt, isSecond.
// No `amount`/`createdAt`/`isWinning` — they exist in local schema but not production DB.
// Use minimal select to be safe across schema versions.
const bids = await prisma.bid.findMany({
      where: { auctionId: id },
      select: { id: true, placedAt: true, isSecond: true, isWinning: true },
      orderBy: { placedAt: 'desc' },
      take: 10,
    }).catch(async (e) => {
      // Schema drift fallback: select only id
      console.error('[get bids primary query failed]', e.message);
      const bids = await prisma.bid.findMany({
        where: { auctionId: id },
        select: { id: true },
        take: 10,
      });
      return bids;
    });
    return json(res, 200, { bids });
  } catch (err) {
    console.error('[get bids]', err);
    return error(res, 500, `Failed to get bids: ${err.message}`);
  }
});