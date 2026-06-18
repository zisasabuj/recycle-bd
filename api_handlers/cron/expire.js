// /api/cron/expire — Vercel Cron job. Replaces the original in-process setTimeout
// worker that lived in workers/auctionTimer.js (which cannot run on serverless).
//
// Vercel cron config (vercel.json):
//   "crons": [{ "path": "/api/cron/expire", "schedule": "* * * * *" }]
//
// What it does every minute:
//   1. Find all ACTIVE auctions where endsAt <= now()
//   2. For each: determine winner (highest bid), close the auction, set winner,
//      create Transaction row with 20% commission, notify both parties
//
// Security: requires header `x-vercel-cron: 1` (Vercel sets this automatically
// on cron requests) OR Bearer token CRON_SECRET (for manual triggers).
import { prisma } from '../../_lib/prisma.js';
import { json, error } from '../../_lib/middleware.js';

function isAuthorized(req) {
  const cronHeader = req.headers['x-vercel-cron'];
  if (cronHeader === '1' || cronHeader === 'true') return true;
  const auth = req.headers.authorization;
  if (auth && process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  return false;
}

async function expireOneAuction(auctionId) {
  return prisma.$transaction(async (tx) => {
    const auction = await tx.auction.findUnique({
      where: { id: auctionId },
      include: { bids: { orderBy: { amount: 'desc' } } },
    });
    if (!auction) return { skipped: true };
    if (auction.status !== 'ACTIVE') return { skipped: true };
    if (new Date(auction.endsAt).getTime() > Date.now()) return { skipped: true };

    const winnerBid = auction.bids[0];
    const finalAmount = winnerBid ? Number(winnerBid.amount) : 0;
    const commissionAmt = finalAmount * 0.20;

    await tx.auction.update({
      where: { id: auction.id },
      data: {
        status: 'PAYMENT_PENDING',
        currentMaxBid: finalAmount,
        winnerId: winnerBid ? winnerBid.bidderId : null,
      },
    });

    if (winnerBid) {
      await tx.transaction.create({
        data: {
          auctionId: auction.id,
          buyerId: winnerBid.bidderId,
          sellerId: auction.sellerId,
          finalAmount,
          commissionAmt,
          buyerPaid: 'PENDING',
          sellerPaid: 'PENDING',
        },
      });
      await tx.notification.createMany({
        data: [
          {
            userId: winnerBid.bidderId,
            type: 'AUCTION_WON',
            message: `🎉 You won "${auction.title}" for ৳${finalAmount.toLocaleString()}. Please pay 20% commission.`,
            data: { auctionId: auction.id },
          },
          {
            userId: auction.sellerId,
            type: 'AUCTION_SOLD',
            message: `Your auction "${auction.title}" sold for ৳${finalAmount.toLocaleString()}. Pay 20% commission to unlock buyer contact.`,
            data: { auctionId: auction.id },
          },
        ],
      });
      // Update watchlist rows for the winner (mark as sold)
      await tx.watchlist.updateMany({
        where: { auctionId: auction.id },
        data: { sold: true },
      });
    } else {
      // No bids → just close the auction, notify seller
      await tx.auction.update({
        where: { id: auction.id },
        data: { status: 'EXPIRED' },
      });
      await tx.notification.create({
        data: {
          userId: auction.sellerId,
          type: 'AUCTION_EXPIRED',
          message: `Your auction "${auction.title}" ended with no bids.`,
          data: { auctionId: auction.id },
        },
      });
    }
    return { expired: true, hadWinner: !!winnerBid, finalAmount };
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return error(res, 405, 'GET or POST only');
  }
  if (!isAuthorized(req)) return error(res, 401, 'Unauthorized cron call');

  try {
    const expired = await prisma.auction.findMany({
      where: { status: 'ACTIVE', endsAt: { lte: new Date() } },
      select: { id: true },
    });
    const results = [];
    for (const a of expired) {
      const r = await expireOneAuction(a.id);
      results.push({ id: a.id, ...r });
    }
    return json(res, 200, { processed: results.length, results });
  } catch (err) {
    console.error('[cron/expire]', err);
    return error(res, 500, err.message || 'Cron failed');
  }
}