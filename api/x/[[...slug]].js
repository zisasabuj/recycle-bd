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
];

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // slug = the verb segment (e.g. 'bids', 'place-bid', 'categories')
  let slug = req.query.slug;
  // DEBUG: log what Vercel actually sends
  console.log('[/api/x DEBUG]', JSON.stringify({
    method: req.method,
    url: req.url,
    query: req.query,
    slug,
    slugType: typeof slug,
    isArray: Array.isArray(slug)
  }));
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