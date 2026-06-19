// POST /api/auctions/:id/reject — winner rejects, passes to 2nd
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';
import { getUserFromHeader } from '../../../_lib/auth.js';

export default withCors(async (req, res) => {
  const id = req.query.id;
  if (!id) return error(res, 400, 'Missing auction id');
  if (req.method !== 'POST') return error(res, 405, 'POST only');

  const payload = getUserFromHeader(req.headers.authorization);
  if (!payload) return error(res, 401, 'Missing or invalid Authorization header');

  try {
    const auction = await prisma.auction.findUnique({
      where: { id },
      include: { bids: { orderBy: { amount: 'desc' }, take: 2 } },
    });
    if (!auction) return error(res, 404, 'Auction not found');
    if (auction.winnerId !== payload.userId) return error(res, 403, 'Only the winner can reject');

    // Pass to second bidder if exists
    if (auction.bids.length >= 2) {
      const second = auction.bids[1];
      const newCommission = Number(second.amount) * 0.20;
      await prisma.$transaction([
        prisma.auction.update({
          where: { id },
          data: { winnerId: second.bidderId, status: 'PAYMENT_PENDING' },
        }),
        prisma.transaction.update({
          where: { auctionId: id },
          data: {
            buyerId: second.bidderId,
            finalAmount: second.amount,
            commissionAmt: newCommission,
          },
        }),
        prisma.notification.create({
          data: {
            userId: second.bidderId,
            type: 'WON',
            message: `🎉 Previous winner rejected — auction passed to you for ৳${second.amount}! Confirm and pay 20% commission (৳${newCommission}) within 24h.`,
            data: { auctionId: id, amount: Number(second.amount), commission: newCommission },
          },
        }),
      ]);
      return json(res, 200, { message: 'Passed to 2nd highest bidder.' });
    }

    // No 2nd bidder → expire
    await prisma.auction.update({
      where: { id },
      data: { status: 'EXPIRED' },
    });
    return json(res, 200, { message: 'No 2nd bidder — auction expired.' });
  } catch (err) {
    console.error('[reject]', err);
    return error(res, 500, 'Failed to reject');
  }
});