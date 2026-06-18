// GET /api/auctions/:id/similar — same category, same city, max 4
import { prisma } from '../../../../_lib/prisma.js';
import { withCors, json, error } from '../../../../_lib/middleware.js';

export default withCors(async (req, res) => {
  const id = req.query.id;
  if (!id) return error(res, 400, 'Missing auction id');
  if (req.method !== 'GET') return error(res, 405, 'GET only');
  try {
    const a = await prisma.auction.findUnique({
      where: { id },
      select: { id: true, category: true, city: true },
    });
    if (!a) return error(res, 404, 'Auction not found');

    let similar = await prisma.auction.findMany({
      where: {
        id: { not: a.id },
        category: a.category,
        city: a.city,
        status: 'ACTIVE',
        endsAt: { gt: new Date() },
      },
      take: 4,
      orderBy: { endsAt: 'asc' },
      include: {
        seller: { select: { username: true, rating: true } },
        _count: { select: { bids: true, watchlist: true } },
      },
    });

    if (similar.length < 4) {
      const more = await prisma.auction.findMany({
        where: {
          id: { notIn: [a.id, ...similar.map((s) => s.id)] },
          category: a.category,
          status: 'ACTIVE',
          endsAt: { gt: new Date() },
        },
        take: 4 - similar.length,
        orderBy: { endsAt: 'asc' },
        include: {
          seller: { select: { username: true, rating: true } },
          _count: { select: { bids: true, watchlist: true } },
        },
      });
      similar = similar.concat(more);
    }
    return json(res, 200, { auctions: similar });
  } catch (err) {
    console.error('[similar]', err);
    return error(res, 500, 'Failed');
  }
});