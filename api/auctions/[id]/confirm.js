// POST /api/auctions/:id/confirm — winner confirms purchase
import { prisma } from '../../../../_lib/prisma.js';
import { withCors, json, error } from '../../../../_lib/middleware.js';
import { getUserFromHeader } from '../../../../_lib/auth.js';

export default withCors(async (req, res) => {
  const id = req.query.id;
  if (!id) return error(res, 400, 'Missing auction id');
  if (req.method !== 'POST') return error(res, 405, 'POST only');

  const payload = getUserFromHeader(req.headers.authorization);
  if (!payload) return error(res, 401, 'Missing or invalid Authorization header');

  try {
    const auction = await prisma.auction.findUnique({ where: { id } });
    if (!auction) return error(res, 404, 'Auction not found');
    if (auction.winnerId !== payload.userId) return error(res, 403, 'Only the winner can confirm');
    if (auction.status !== 'PAYMENT_PENDING') {
      return error(res, 400, 'Auction is not in payment pending state');
    }
    const tx = await prisma.transaction.findUnique({ where: { auctionId: id } });
    return json(res, 200, { message: 'Please proceed to pay 20% commission', transaction: tx });
  } catch (err) {
    console.error('[confirm]', err);
    return error(res, 500, 'Failed to confirm');
  }
});