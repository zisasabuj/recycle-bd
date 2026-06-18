// GET /api/chats — list current user's chat threads
// POST /api/chats — get-or-create chat for an auction (winner or seller)
import { prisma } from '../_lib/prisma.js';
import { withCors, withAuth, json, error } from '../_lib/middleware.js';

export default withCors(withAuth(async (req, res) => {
  try {
    if (req.method === 'GET') {
      const chats = await prisma.chat.findMany({
        where: { OR: [{ buyerId: req.userId }, { sellerId: req.userId }] },
        orderBy: { lastMessageAt: 'desc' },
        include: {
          auction: { select: { id: true, title: true, images: true, status: true } },
          buyer: { select: { id: true, username: true, fullName: true } },
          seller: { select: { id: true, username: true, fullName: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      const result = await Promise.all(chats.map(async (c) => {
        const unread = await prisma.chatMessage.count({
          where: { chatId: c.id, readAt: null, senderId: { not: req.userId } },
        });
        const isBuyer = c.buyerId === req.userId;
        return {
          ...c,
          unread,
          counterparty: isBuyer ? c.seller : c.buyer,
          role: isBuyer ? 'buyer' : 'seller',
        };
      }));
      return json(res, 200, { chats: result });
    }

    if (req.method === 'POST') {
      const { auctionId } = req.body || {};
      if (!auctionId) return error(res, 400, 'auctionId required');

      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
        include: { bids: { orderBy: { amount: 'desc' }, take: 1 } },
      });
      if (!auction) return error(res, 404, 'Auction not found');

      const endedStates = ['COMPLETED', 'PAYMENT_PENDING'];
      if (!endedStates.includes(auction.status)) {
        return error(res, 403, { error: 'Chat unlocks after the auction ends', status: auction.status });
      }

      const isSeller = auction.sellerId === req.userId;
      const topBid = auction.bids[0];
      const winnerId = topBid ? topBid.bidderId : null;

      if (!isSeller && req.userId !== winnerId) {
        return error(res, 403, 'Only the seller or the winner can open this chat');
      }
      if (!winnerId) return error(res, 400, 'No winner assigned yet');

      const chat = await prisma.chat.upsert({
        where: { auctionId_buyerId_sellerId: { auctionId, buyerId: winnerId, sellerId: auction.sellerId } },
        update: {},
        create: { auctionId, buyerId: winnerId, sellerId: auction.sellerId },
        include: {
          buyer: { select: { id: true, username: true, fullName: true } },
          seller: { select: { id: true, username: true, fullName: true } },
        },
      });
      return json(res, 201, { chat });
    }

    return error(res, 405, 'GET or POST only');
  } catch (err) {
    console.error('[chats]', err);
    return error(res, 500, 'Failed');
  }
}));