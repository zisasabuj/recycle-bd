// /api/watchlist — GET (list) and POST (add)
import { prisma } from '../_lib/prisma.js';
import { withCors, withAuth, json, error } from '../_lib/middleware.js';

export default withCors(withAuth(async (req, res) => {
  try {
    if (req.method === 'GET') {
      const items = await prisma.watchlist.findMany({
        where: { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        include: {
          auction: {
            include: {
              seller: { select: { username: true, rating: true } },
              _count: { select: { bids: true, watchlist: true } },
            },
          },
        },
      });
      const auctions = items.map((w) => ({
        ...w.auction,
        _count: { ...w.auction._count, watchlist: w.auction._count.watchlist + 1 },
      }));
      return json(res, 200, { auctions, total: auctions.length });
    }

    if (req.method === 'POST') {
      const { auctionId } = req.body || {};
      if (!auctionId) return error(res, 400, 'auctionId required');
      const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
      if (!auction) return error(res, 404, 'Auction not found');
      const item = await prisma.watchlist.upsert({
        where: { userId_auctionId: { userId: req.userId, auctionId } },
        update: {},
        create: { userId: req.userId, auctionId },
      });
      return json(res, 201, { watchlist: item, saved: true });
    }

    return error(res, 405, 'GET or POST only');
  } catch (err) {
    console.error('[watchlist]', err);
    return error(res, 500, 'Failed');
  }
}));