// POST /api/auctions/:id/bids — place a sealed bid (replaces socket-based bidding)
// CORE LOGIC — transaction with race-condition protection
import { prisma } from '../../../../_lib/prisma.js';
import { withCors, json, error } from '../../../../_lib/middleware.js';
import { getUserFromHeader } from '../../../../_lib/auth.js';

export default withCors(async (req, res) => {
  const id = req.query.id;
  if (!id) return error(res, 400, 'Missing auction id');
  if (req.method !== 'POST') return error(res, 405, 'POST only');

  const payload = getUserFromHeader(req.headers.authorization);
  if (!payload) return error(res, 401, 'Missing or invalid Authorization header');
  const userId = payload.userId;

  try {
    const { amount } = req.body || {};
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 100) {
      return error(res, 400, 'amount must be a number >= 100');
    }

    const result = await prisma.$transaction(async (tx) => {
      const auction = await tx.auction.findUnique({ where: { id } });
      if (!auction) throw new Error('Auction not found');
      if (auction.status !== 'ACTIVE') throw new Error('Auction is not active');
      if (new Date() > auction.endsAt) throw new Error('Auction has expired');
      if (auction.sellerId === userId) throw new Error('Sellers cannot bid on their own auctions');

      const currentMax = await tx.bid.findFirst({
        where: { auctionId: id, isWinning: true },
        orderBy: { amount: 'desc' },
      });

      const minRequired = currentMax
        ? Number(currentMax.amount) + Number(auction.bidIncrement)
        : Number(auction.basePrice);

      if (numAmount < minRequired) {
        throw new Error(`Minimum bid is ৳${minRequired}`);
      }

      if (currentMax) {
        await tx.bid.update({
          where: { id: currentMax.id },
          data: { isWinning: false, isSecond: true },
        });
      }

      const newBid = await tx.bid.create({
        data: {
          auctionId: id,
          bidderId: userId,
          amount: numAmount,
          isWinning: true,
          isSecond: false,
        },
      });

      await tx.auction.update({
        where: { id },
        data: { currentMaxBid: numAmount },
      });

      return { newBid, prevBidderId: currentMax?.bidderId || null, minRequired };
    });

    // Notify previous bidder they were outbid
    if (result.prevBidderId && result.prevBidderId !== userId) {
      await prisma.notification.create({
        data: {
          userId: result.prevBidderId,
          type: 'OUTBID',
          message: `You were outbid on an auction. New max bid: ৳${result.newBid.amount}`,
          data: { auctionId: id, newBid: Number(result.newBid.amount) },
        },
      });
    }

    return json(res, 201, {
      ok: true,
      amount: Number(result.newBid.amount),
      bidId: result.newBid.id,
      placedAt: result.newBid.placedAt,
    });
  } catch (err) {
    console.error('[place bid]', err);
    return error(res, 400, err.message || 'Failed to place bid');
  }
});