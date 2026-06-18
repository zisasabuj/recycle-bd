// DELETE /api/watchlist/[auctionId] — remove from watchlist
import { prisma } from '../../_lib/prisma.js';
import { withCors, withAuth, json, error } from '../../_lib/middleware.js';

export default withCors(withAuth(async (req, res) => {
  if (req.method !== 'DELETE') return error(res, 405, 'DELETE only');
  try {
    await prisma.watchlist.deleteMany({
      where: { userId: req.userId, auctionId: req.query.auctionId },
    });
    return json(res, 200, { saved: false });
  } catch (err) {
    console.error('[watchlist delete]', err);
    return error(res, 500, 'Failed');
  }
}));