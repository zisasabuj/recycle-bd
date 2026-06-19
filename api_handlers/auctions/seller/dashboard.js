// GET /api/auctions/seller/dashboard — analytics for current logged-in seller
import { prisma } from '../../../_lib/prisma.js';
import { withAuth, json, error } from '../../../_lib/middleware.js';

export default withAuth(async (req, res) => {
  if (req.method !== 'GET') return error(res, 405, 'GET only');

  // Each section wrapped independently so one Prisma drift fails the rest, not the whole dashboard.
  const safe = async (label, fn, fallback) => {
    try { return await fn(); }
    catch (e) { console.error(`[seller-dashboard:${label}]`, e?.message || e); return fallback; }
  };

  const auctions = await safe('list', () => prisma.auction.findMany({
    where: { sellerId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { bids: true, watchlist: true } } },
  }), []);

  const txns = await safe('txns', () => prisma.transaction.findMany({
    where: { sellerId: req.userId, sellerPaid: 'PAID' },
    select: { finalAmount: true, commissionAmt: true },
  }), []);

  const totalViews = auctions.reduce((s, a) => s + (a.viewCount || 0), 0);
  const totalBids = auctions.reduce((s, a) => s + (a._count?.bids || 0), 0);
  const totalWatch = auctions.reduce((s, a) => s + (a._count?.watchlist || 0), 0);
  const activeCount = auctions.filter((a) => a.status === 'ACTIVE').length;
  const completed = auctions.filter((a) => a.status === 'COMPLETED');
  const soldCount = completed.length;

  const grossEarnings = txns.reduce((s, t) => s + Number(t.finalAmount || 0), 0);
  const commissionPaid = txns.reduce((s, t) => s + Number(t.commissionAmt || 0), 0);
  const netEarnings = grossEarnings - commissionPaid;
  const conversionRate = totalViews > 0 ? ((totalBids / totalViews) * 100).toFixed(2) : '0.00';

  const perAuction = auctions.map((a) => ({
    id: a.id,
    title: a.title,
    images: a.images,
    category: a.category,
    basePrice: a.basePrice,
    currentMaxBid: a.currentMaxBid,
    status: a.status,
    endsAt: a.endsAt,
    viewCount: a.viewCount,
    bidCount: a._count?.bids || 0,
    watchCount: a._count?.watchlist || 0,
  }));

  const byCategory = {};
  auctions.forEach((a) => {
    if (a.category) byCategory[a.category] = (byCategory[a.category] || 0) + 1;
  });

  return json(res, 200, {
    totals: {
      totalAuctions: auctions.length,
      activeCount,
      soldCount,
      totalViews,
      totalBids,
      totalWatchlist: totalWatch,
      grossEarnings,
      commissionPaid,
      netEarnings,
      conversionRate: `${conversionRate}%`,
    },
    perAuction,
    byCategory,
    recentActivity: auctions.slice(0, 5).map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      createdAt: a.createdAt,
      bidCount: a._count?.bids || 0,
    })),
  });
});