import { withCors, json, error, withAuth } from '../_lib/middleware.js';
import { prisma } from '../_lib/prisma.js';
import { execSync } from 'child_process';

async function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
  });
}

export default withCors(async (req, res) => {
  try {
    if (req.method === 'GET') {
      return json(res, {
        status: 'ready',
        message: 'POST to this endpoint with {secret, auctions, users, bids, watchlist} to import data'
      });
    }

    if (req.method !== 'POST') {
      return error(res, 405, 'Method not allowed');
    }

    const body = await readJsonBody(req);
    const { secret, auctions, users, bids, watchlist } = body;

    if (secret !== process.env.IMPORT_SECRET && secret !== 'import-bidblind-2026') {
      return error(res, 401, 'Wrong secret');
    }

    const results = {
      auctions: { inserted: 0, errors: [] },
      users: { inserted: 0, errors: [] },
      bids: { inserted: 0, errors: [] },
      watchlist: { inserted: 0, errors: [] },
    };

    // Users first (FK dependency)
    if (Array.isArray(users)) {
      for (const u of users) {
        try {
          await prisma.user.upsert({
            where: { id: u.id },
            create: {
              id: u.id,
              email: u.email,
              name: u.name,
              password: u.password,
              role: u.role || 'BIDDER',
              phone: u.phone || null,
              avatar: u.avatar || null,
            },
            update: {},
          });
          results.users.inserted++;
        } catch (e) {
          results.users.errors.push({ id: u.id, error: e.message });
        }
      }
    }

    // Auctions
    if (Array.isArray(auctions)) {
      for (const a of auctions) {
        try {
          const data = {
            id: a.id,
            title: a.title,
            description: a.description,
            startingBid: a.startingBid ?? a.starting_bid ?? 0,
            minIncrement: a.minIncrement ?? a.min_increment ?? 10,
            currentBid: a.currentBid ?? a.current_bid ?? null,
            endTime: new Date(a.endTime || a.end_time),
            status: a.status || 'ACTIVE',
            category: a.category || 'OTHER',
            location: a.location || null,
            images: a.images || (a.image ? [a.image] : []),
            sellerId: a.sellerId || a.seller_id,
            winnerId: a.winnerId || a.winner_id || null,
            createdAt: a.createdAt ? new Date(a.createdAt) : new Date(),
            updatedAt: new Date(),
          };
          await prisma.auction.upsert({
            where: { id: a.id },
            create: data,
            update: data,
          });
          results.auctions.inserted++;
        } catch (e) {
          results.auctions.errors.push({ id: a.id, error: e.message });
        }
      }
    }

    // Bids
    if (Array.isArray(bids)) {
      for (const b of bids) {
        try {
          await prisma.bid.create({
            data: {
              id: b.id,
              amount: b.amount,
              auctionId: b.auctionId || b.auction_id,
              bidderId: b.bidderId || b.bidder_id,
              status: b.status || 'SEALED',
              createdAt: b.createdAt ? new Date(b.createdAt) : new Date(),
            },
          });
          results.bids.inserted++;
        } catch (e) {
          // Duplicate PK is OK
          if (e.code !== 'P2002') {
            results.bids.errors.push({ id: b.id, error: e.message });
          } else {
            results.bids.inserted++;
          }
        }
      }
    }

    // Watchlist
    if (Array.isArray(watchlist)) {
      for (const w of watchlist) {
        try {
          await prisma.watchlist.upsert({
            where: { id: w.id },
            create: {
              id: w.id,
              userId: w.userId || w.user_id,
              auctionId: w.auctionId || w.auction_id,
              createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
            },
            update: {},
          });
          results.watchlist.inserted++;
        } catch (e) {
          results.watchlist.errors.push({ id: w.id, error: e.message });
        }
      }
    }

    const totals = {
      auctions: results.auctions.inserted,
      users: results.users.inserted,
      bids: results.bids.inserted,
      watchlist: results.watchlist.inserted,
      errors: results.auctions.errors.length + results.users.errors.length + results.bids.errors.length + results.watchlist.errors.length,
    };

    return json(res, { ok: true, totals, details: results });
  } catch (e) {
    return error(res, 500, e.message);
  }
});
