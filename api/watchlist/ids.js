// GET /api/watchlist/ids — cheap list of auctionIds the user has saved
import { prisma } from '../../_lib/prisma.js';
import { withCors, withAuth, json, error } from '../../_lib/middleware.js';

export default withCors(withAuth(async (req, res) => {
  if (req.method !== 'GET') return error(res, 405, 'GET only');
  try {
    const items = await prisma.watchlist.findMany({
      where: { userId: req.userId },
      select: { auctionId: true },
    });
    return json(res, 200, { ids: items.map((i) => i.auctionId) });
  } catch (err) {
    console.error('[watchlist ids]', err);
    return error(res, 500, 'Failed');
  }
}));