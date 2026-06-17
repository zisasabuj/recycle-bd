// In-memory auction timer (no Redis/BullMQ dependency)
// Uses setTimeout for scheduled ends + lazy expiry on each request for robustness
import { prisma } from '../lib/prisma.js';

const scheduled = new Map(); // auctionId -> NodeJS.Timeout

/**
 * Process auction end:
 * 1. Mark status as PAYMENT_PENDING
 * 2. Identify winner + 2nd highest
 * 3. Create pending transaction
 * 4. Notify winner (socket + DB notification)
 * 5. Broadcast auction_ended to room
 * 6. Schedule fallback to 2nd bidder (24h timeout)
 */
export async function processAuctionEnd(auctionId, io) {
  console.log(`[Timer] Processing end of auction ${auctionId}`);

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      bids: {
        orderBy: { amount: 'desc' },
        take: 3,
        include: { bidder: { select: { id: true, username: true } } }
      }
    }
  });

  if (!auction) {
    console.log(`[Timer] Auction ${auctionId} not found, skipping`);
    return;
  }
  if (auction.status !== 'ACTIVE') {
    console.log(`[Timer] Auction ${auctionId} status=${auction.status}, skipping`);
    return;
  }

  // No bids at all
  if (auction.bids.length === 0) {
    await prisma.auction.update({
      where: { id: auctionId },
      data: { status: 'EXPIRED' }
    });
    if (io) io.to(`auction:${auctionId}`).emit('auction_ended', {
      auctionId,
      finalAmount: null,
      message: 'No bids placed'
    });
    return;
  }

  const winner = auction.bids[0];
  const secondWinner = auction.bids[1] || null;
  const finalAmount = Number(winner.amount);
  const commission = finalAmount * 0.20;

  // Update auction
  await prisma.auction.update({
    where: { id: auctionId },
    data: {
      status: 'PAYMENT_PENDING',
      winnerId: winner.bidderId,
      secondWinnerId: secondWinner?.bidderId || null
    }
  });

  // Create pending transaction
  await prisma.transaction.create({
    data: {
      auctionId,
      buyerId: winner.bidderId,
      sellerId: auction.sellerId,
      finalAmount: finalAmount,
      commissionAmt: commission
    }
  });

  // Create winner notification
  await prisma.notification.create({
    data: {
      userId: winner.bidderId,
      type: 'WON',
      message: `🎉 You won the auction "${auction.title}" for ৳${finalAmount}! Confirm and pay 20% commission (৳${commission}) within 24h.`,
      data: { auctionId, amount: finalAmount, commission }
    }
  });

  // Emit socket events
  if (io) {
    io.to(`auction:${auctionId}`).emit('auction_ended', {
      auctionId,
      finalAmount,
      message: 'Auction has ended. Winner has been notified.'
    });

    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      if (s.userId === winner.bidderId) {
        s.emit('you_won', {
          auctionId,
          amount: finalAmount,
          commission,
          action: 'confirm_or_reject'
        });
      }
    }
  }

  // Schedule fallback: if winner doesn't act in 24h, pass to 2nd highest
  setTimeout(async () => {
    try {
      const tx = await prisma.transaction.findUnique({
        where: { auctionId },
        include: { auction: true }
      });
      if (tx && tx.buyerPaid === 'PENDING' && tx.sellerPaid === 'PENDING') {
        console.log(`[Timer] Winner timeout for ${auctionId}, passing to 2nd bidder`);
        await passToSecondBidder(auctionId, io);
      }
    } catch (err) {
      console.error('[Timer] fallback error:', err);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
}

async function passToSecondBidder(auctionId, io) {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { bids: { orderBy: { amount: 'desc' }, take: 2 } }
  });
  if (!auction) return;

  if (!auction.secondWinnerId || auction.bids.length < 2) {
    await prisma.auction.update({
      where: { id: auctionId },
      data: { status: 'EXPIRED' }
    });
    return;
  }

  const secondBid = auction.bids[1];
  const finalAmount = Number(secondBid.amount);
  const commission = finalAmount * 0.20;

  await prisma.auction.update({
    where: { id: auctionId },
    data: { winnerId: auction.secondWinnerId }
  });

  await prisma.transaction.update({
    where: { auctionId },
    data: {
      buyerId: auction.secondWinnerId,
      finalAmount,
      commissionAmt: commission
    }
  });

  await prisma.notification.create({
    data: {
      userId: auction.secondWinnerId,
      type: 'WON_2ND',
      message: `🎉 Previous winner didn't confirm. You won "${auction.title}" for ৳${finalAmount}!`,
      data: { auctionId, amount: finalAmount, commission }
    }
  });

  if (io) {
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      if (s.userId === auction.secondWinnerId) {
        s.emit('you_won', {
          auctionId,
          amount: finalAmount,
          commission,
          action: 'confirm_or_reject'
        });
      }
    }
  }
}

/**
 * Schedule a setTimeout for an auction's endsAt.
 * Returns the timer handle (or null if endsAt is in the past — call processAuctionEnd immediately).
 */
export function scheduleAuctionEnd(auctionId, endsAt, io) {
  // Cancel any existing timer
  const existing = scheduled.get(auctionId);
  if (existing) clearTimeout(existing);

  const delay = Math.max(0, endsAt.getTime() - Date.now());

  // If already expired, process immediately
  if (delay === 0) {
    console.log(`[Timer] Auction ${auctionId} already expired, processing now`);
    processAuctionEnd(auctionId, io).catch((err) =>
      console.error(`[Timer] immediate process error for ${auctionId}:`, err.message)
    );
    return null;
  }

  // Cap delay at 24.8 days (max safe setTimeout)
  const MAX_TIMEOUT = 2147483647;
  if (delay > MAX_TIMEOUT) {
    console.log(`[Timer] Auction ${auctionId} endsAt > 24.8 days away, will rely on lazy expiry`);
    return null;
  }

  const timer = setTimeout(() => {
    scheduled.delete(auctionId);
    processAuctionEnd(auctionId, io).catch((err) =>
      console.error(`[Timer] process error for ${auctionId}:`, err.message)
    );
  }, delay);

  scheduled.set(auctionId, timer);
  console.log(`[Timer] Scheduled end of auction ${auctionId} in ${Math.round(delay / 1000)}s`);
  return timer;
}

/**
 * Cancel a scheduled timer (e.g., auction deleted/cancelled).
 */
export function cancelAuctionEnd(auctionId) {
  const existing = scheduled.get(auctionId);
  if (existing) {
    clearTimeout(existing);
    scheduled.delete(auctionId);
    console.log(`[Timer] Cancelled scheduled end for auction ${auctionId}`);
  }
}

/**
 * Lazy expiry: check for any ACTIVE auctions whose endsAt has passed,
 * and process them. Run on each API request to recover from server restarts.
 */
let lazyExpiryRunning = false;
export async function lazyExpireAuctions(io) {
  if (lazyExpiryRunning) return; // prevent concurrent runs
  lazyExpiryRunning = true;
  try {
    const expired = await prisma.auction.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { lt: new Date() }
      },
      select: { id: true }
    });
    if (expired.length === 0) return;

    console.log(`[Lazy Expiry] Found ${expired.length} expired auctions to process`);
    for (const a of expired) {
      try {
        await processAuctionEnd(a.id, io);
      } catch (err) {
        console.error(`[Lazy Expiry] Error processing ${a.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Lazy Expiry] Query error:', err.message);
  } finally {
    lazyExpiryRunning = false;
  }
}

/**
 * Start the timer worker (no-op for in-memory; just a startup log).
 * Kept for backward compatibility with server.js.
 */
export function startTimerWorker(io) {
  console.log('[Timer] In-memory worker started (no Redis required)');
  // Run lazy expiry once at startup to catch anything missed during downtime
  lazyExpireAuctions(io).catch((err) =>
    console.error('[Timer] startup lazy expiry error:', err.message)
  );
}