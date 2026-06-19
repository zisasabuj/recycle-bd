// /api/x/[[...slug]].js — single dispatcher for ALL auction verb routes.
//
// Why this exists: Vercel Hobby only invokes a subdirectory optional catch-all
// for paths with EXACTLY one slug segment. Multi-segment paths like
// `/api/auction/{id}/bids` always return CDN-404 regardless of routing. To
// bypass this, we flatten all verb routes to a single 2-segment URL shape:
//   /api/x/bids?id={auctionId}     GET  list bids for an auction
//   /api/x/similar?id={auctionId}  GET  similar auctions
//   /api/x/place-bid?id={auctionId}  POST place a sealed bid
//   /api/x/confirm?id={auctionId}    POST confirm (seller)
//   /api/x/reject?id={auctionId}     POST reject (seller)
//   /api/x/view?id={auctionId}       POST record view
//   /api/x/categories             GET  category list
//   /api/x/locations              GET  location list
//   /api/x/bd-locations           GET  BD cities list
//   /api/x/seller-dashboard       GET  seller dashboard
//
// /api/x/{slug} is a brand-new URL prefix Vercel has never cached, so it
// bypasses the existing 404 cache on /api/auctions/* and /api/auction/*.
// Tradeoff: only 1 serverless function used; clients pass id via query string.

import '../../_lib/prisma.js';
import '../../_lib/auth.js';
import '../../_lib/middleware.js';
import '../../_lib/bdLocations.js';
import '../../_lib/imgbb.js';
import '../../_lib/payment-helpers.js';

const HANDLERS_DIR = '../../api_handlers';

const routes = [
  // Auction verb routes
  { method: 'GET',  verb: 'bids',            file: '/auctions/[id]/bids.js' },
  { method: 'GET',  verb: 'similar',         file: '/auctions/[id]/similar.js' },
  { method: 'POST', verb: 'place-bid',       file: '/auctions/[id]/place-bid.js' },
  { method: 'POST', verb: 'confirm',         file: '/auctions/[id]/confirm.js' },
  { method: 'POST', verb: 'reject',          file: '/auctions/[id]/reject.js' },
  { method: 'POST', verb: 'view',            file: '/auctions/[id]/view.js' },
  { method: 'GET',  verb: 'categories',      file: '/auctions/meta/categories.js' },
  { method: 'GET',  verb: 'locations',       file: '/auctions/meta/locations.js' },
  { method: 'GET',  verb: 'bd-locations',    file: '/auctions/meta/bd-locations.js' },
  { method: 'GET',  verb: 'seller-dashboard', file: '/auctions/seller/dashboard.js' },

  // Upload routes (flattened: was /api/upload/auction, /api/upload/image)
  { method: 'POST', verb: 'upload-auction',  file: '/upload/auction.js' },
  { method: 'POST', verb: 'upload-image',    file: '/upload/image.js' },

  // Watchlist routes (flattened: was /api/watchlist/ids, /api/watchlist/{id})
  { method: 'GET',    verb: 'watchlist',         file: '/watchlist/index.js' },
  { method: 'POST',   verb: 'watchlist',         file: '/watchlist/index.js' },
  { method: 'GET',    verb: 'watchlist-ids',     file: '/watchlist/ids.js' },
  { method: 'POST',   verb: 'watchlist-toggle',  file: '/watchlist/[auctionId].js' },
  { method: 'DELETE', verb: 'watchlist-toggle',  file: '/watchlist/[auctionId].js' },

  // Notifications
  { method: 'POST', verb: 'notifications-read-all', file: '/notifications/read-all.js' },

  // Payments (flattened: was /api/payments/{id}/buyer-pay, etc.)
  { method: 'POST', verb: 'pay-buyer',    file: '/payments/[auctionId]/buyer-pay.js' },
  { method: 'POST', verb: 'pay-seller',   file: '/payments/[auctionId]/seller-pay.js' },
  { method: 'GET',  verb: 'pay-contact',  file: '/payments/[auctionId]/contact.js' },
  { method: 'GET',  verb: 'pay-status',   file: '/payments/[auctionId]/status.js' },

  // Chats (flattened: was /api/chats/{id}/messages, send, read)
  { method: 'GET',  verb: 'chat-messages', file: '/chats/[id]/messages.js' },
  { method: 'POST', verb: 'chat-messages', file: '/chats/[id]/messages.js' },
  { method: 'POST', verb: 'chat-read',     file: '/chats/[id]/messages.js' },

  // Admin user role (flattened: was /api/auth/users/{id}/role)
  { method: 'GET',   verb: 'user-role',   file: '/auth/users/[id]/role.js' },
  { method: 'PATCH', verb: 'user-role',   file: '/auth/users/[id]/role.js' },

  // Settings / edit-mode (flattened: was /api/settings/edit-mode, /api/admin/settings/edit-mode)
  { method: 'GET',   verb: 'settings-edit-mode', file: '/settings/edit-mode.js' },
  { method: 'POST',  verb: 'settings-edit-mode', file: '/settings/edit-mode.js' },
  { method: 'PATCH', verb: 'settings-edit-mode', file: '/settings/edit-mode.js' },
  { method: 'GET',   verb: 'admin-edit-mode',    file: '/admin/settings/edit-mode.js' },
  { method: 'POST',  verb: 'admin-edit-mode',    file: '/admin/settings/edit-mode.js' },
  { method: 'PATCH', verb: 'admin-edit-mode',    file: '/admin/settings/edit-mode.js' },
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // slug = the verb segment (e.g. 'bids', 'place-bid', 'categories').
  // Vercel subdirectory catch-all puts the slug in `req.query['[...slug]']` (literal key
  // with brackets) instead of `req.query.slug`. Try both for compatibility.
  let slug = req.query.slug ?? req.query['[...slug]'];
  if (Array.isArray(slug)) slug = slug[0];
  if (typeof slug !== 'string' || !slug) {
    return res.status(404).json({ error: `Route not found: ${req.method} /api/x/`, debug: { query: req.query, url: req.url } });
  }

  const route = routes.find((r) => r.method === req.method && r.verb === slug);
  if (!route) {
    return res.status(404).json({ error: `Route not found: ${req.method} /api/x/${slug}` });
  }

  // Handlers expect req.query.id (from path param). We pass via query string:
  //   /api/x/bids?id={auctionId}
  // So copy query.id (or query.auctionId) → req.query.id for handler compatibility.
  if (req.query.id) req.query.id = req.query.id;
  if (!req.query.id && req.query.auctionId) req.query.id = req.query.auctionId;

  try {
    const mod = await import(`${HANDLERS_DIR}${route.file}`);
    return await mod.default(req, res);
  } catch (e) {
    console.error(`[/api/x] ${req.method} ${slug}:`, e);
    return res.status(500).json({ error: 'Handler error', detail: e.message });
  }
}