import { prisma } from '../lib/prisma.js';
import { verifySocketToken } from '../lib/socketAuth.js';
import { placeBidSchema } from '../validators/bidValidator.js';

/**
 * Socket events for auction bidding
 * Client → Server: 'authenticate', 'join_auction', 'place_bid', 'leave_auction'
 * Server → Client: 'auction_state', 'new_max_bid', 'bid_error', 'auction_ended', 'authenticated'
 */
export function auctionHandler(io, socket) {

  // Authenticate socket
  socket.on('authenticate', async ({ token }) => {
    try {
      const user = await verifySocketToken(token);
      socket.userId = user.id;
      socket.username = user.username;
      socket.emit('authenticated', { userId: user.id, username: user.username });
    } catch (err) {
      socket.emit('bid_error', { message: 'Authentication failed' });
    }
  });

  // Join auction room
  socket.on('join_auction', async ({ auctionId }) => {
    try {
      const auction = await prisma.auction.findUnique({
        where: { id: auctionId },
        select: { id: true, status: true, endsAt: true, currentMaxBid: true, basePrice: true }
      });

      if (!auction) {
        return socket.emit('bid_error', { message: 'Auction not found' });
      }

      socket.join(`auction:${auctionId}`);

      // Anonymized state - only amount, no bidder info
      socket.emit('auction_state', {
        auctionId: auction.id,
        currentMaxBid: auction.currentMaxBid ? Number(auction.currentMaxBid) : null,
        basePrice: Number(auction.basePrice),
        status: auction.status,
        endsAt: auction.endsAt,
        serverTime: new Date()
      });
    } catch (err) {
      console.error('[join_auction]', err);
      socket.emit('bid_error', { message: 'Failed to join auction' });
    }
  });

  // Place a bid - CORE LOGIC
  socket.on('place_bid', async (data) => {
    if (!socket.userId) {
      return socket.emit('bid_error', { message: 'Not authenticated. Emit authenticate first.' });
    }

    try {
      const validated = placeBidSchema.parse(data);
      const { auctionId, amount } = validated;

      // Transaction: lock + validate + update (no race condition)
      const result = await prisma.$transaction(async (tx) => {
        const auction = await tx.auction.findUnique({
          where: { id: auctionId }
        });

        if (!auction) throw new Error('Auction not found');
        if (auction.status !== 'ACTIVE') throw new Error('Auction is not active');
        if (new Date() > auction.endsAt) throw new Error('Auction has expired');
        if (auction.sellerId === socket.userId) throw new Error('Sellers cannot bid on their own auctions');

        // Get current top bid
        const currentMax = await tx.bid.findFirst({
          where: { auctionId, isWinning: true },
          orderBy: { amount: 'desc' }
        });

        const minRequired = currentMax
          ? Number(currentMax.amount) + Number(auction.bidIncrement)
          : Number(auction.basePrice);

        if (amount < minRequired) {
          throw new Error(`Minimum bid is ৳${minRequired}`);
        }

        // Demote previous winner
        if (currentMax) {
          await tx.bid.update({
            where: { id: currentMax.id },
            data: { isWinning: false, isSecond: true }
          });
        }

        // Insert new winning bid
        const newBid = await tx.bid.create({
          data: {
            auctionId,
            bidderId: socket.userId,
            amount,
            isWinning: true,
            isSecond: false
          }
        });

        // Update auction's current max
        await tx.auction.update({
          where: { id: auctionId },
          data: { currentMaxBid: amount }
        });

        return { newBid, prevBidderId: currentMax?.bidderId || null };
      });

      // Broadcast ANONYMIZED update to everyone in the room
      io.to(`auction:${auctionId}`).emit('new_max_bid', {
        auctionId,
        amount: Number(result.newBid.amount),
        timestamp: result.newBid.placedAt
        // CRITICAL: NO bidderId, NO username, NO identifying info
      });

      // Notify the previous top bidder that they were outbid (privately)
      if (result.prevBidderId) {
        // Find that user's socket and emit privately
        const sockets = await io.fetchSockets();
        for (const s of sockets) {
          if (s.userId === result.prevBidderId) {
            s.emit('outbid', {
              auctionId,
              newAmount: Number(result.newBid.amount)
            });
          }
        }
      }

    } catch (err) {
      console.error('[place_bid]', err.message);
      socket.emit('bid_error', { message: err.message });
    }
  });

  socket.on('leave_auction', ({ auctionId }) => {
    socket.leave(`auction:${auctionId}`);
  });
}
