// /api/auction/[[...slug]].js — scoped catch-all for /api/auction/*
//
// Why this exists: Vercel's top-level catch-all `api/[[...path]].js` doesn't get
// invoked for nested paths in our deployment (likely an edge cache quirk on this
// project — even totally fresh paths like /api/zzz/foo return CDN-404 instead of
// our JSON). A *scoped* catch-all in a directory Vercel hasn't cached yet works
// fine. This file dispatches every /api/auction/* request to the appropriate
// handler in api_handlers/.
//
// Tradeoff: +1 serverless function (we're at 4/12 on Hobby — plenty of room).
// Keeping a duplicate route table here instead of importing from the top-level
// catch-all avoids re-introducing the same routing layer that doesn't fire.

// Static imports of _lib/ — forces Vercel bundler to include them.
import '../../_lib/prisma.js';
import '../../_lib/auth.js';
import '../../_lib/middleware.js';
import '../../_lib/bdLocations.js';
import '../../_lib/imgbb.js';
import '../../_lib/payment-helpers.js';

const HANDLERS_DIR = '../../api_handlers';

// Route table — order doesn't matter; first match wins via regex anchor.
const routes = [
  // List + create (no slug)
  { method: 'GET',  pattern: '/',                file: '/auctions/index.js' },
  { method: 'POST', pattern: '/',                file: '/auctions/index.js' },

  // Meta
  { method: 'GET',  pattern: '/meta/locations',         file: '/auctions/meta/locations.js' },
  { method: 'GET',  pattern: '/meta/categories',        file: '/auctions/meta/categories.js' },
  { method: 'GET',  pattern: '/meta/bd-locations',      file: '/auctions/meta/bd-locations.js' },

  // Seller
  { method: 'GET',  pattern: '/seller/dashboard',       file: '/auctions/seller/dashboard.js' },

  // Single + subroutes
  { method: 'GET',    pattern: '/:id',             file: '/auctions/[id]/index.js' },
  { method: 'PUT',    pattern: '/:id',             file: '/auctions/[id]/index.js' },
  { method: 'DELETE', pattern: '/:id',             file: '/auctions/[id]/index.js' },
  { method: 'GET',    pattern: '/:id/bids',        file: '/auctions/[id]/bids.js' },
  { method: 'POST',   pattern: '/:id/place-bid',   file: '/auctions/[id]/place-bid.js' },
  { method: 'POST',   pattern: '/:id/confirm',     file: '/auctions/[id]/confirm.js' },
  { method: 'POST',   pattern: '/:id/reject',      file: '/auctions/[id]/reject.js' },
  { method: 'GET',    pattern: '/:id/similar',     file: '/auctions/[id]/similar.js' },
  { method: 'POST',   pattern: '/:id/view',        file: '/auctions/[id]/view.js' },
];

// Build regex per route
function compilePattern(pattern) {
  const paramNames = [];
  const regexStr = pattern.replace(/:[a-zA-Z]+/g, (m) => {
    paramNames.push(m.slice(1));
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

const compiled = routes.map((r) => ({ method: r.method, ...compilePattern(r.pattern), file: r.file }));

function findRoute(method, url) {
  for (const r of compiled) {
    if (r.method !== method) continue;
    const m = url.match(r.regex);
    if (m) {
      const params = {};
      r.paramNames.forEach((name, i) => { params[name] = m[i + 1]; });
      return { file: r.file, params };
    }
  }
  return null;
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Build URL path from slug array (Vercel optional catch-all populates this).
  // For /api/auction → slug is undefined; /api/auction/abc → slug = 'abc'.
  // Note: Vercel subdirectory catch-alls put slug in `req.query['[...slug]']`
  // (literal key with brackets) on some paths — try both for compatibility.
  let slug = req.query.slug ?? req.query['[...slug]'];
  // Vercel sometimes gives a string instead of an array — normalize
  if (typeof slug === 'string') slug = [slug];
  if (!slug || (Array.isArray(slug) && slug.length === 0)) slug = [];
  const url = '/' + slug.join('/');

  const route = findRoute(req.method, url);
  if (!route) {
    return res.status(404).json({ error: `Route not found: ${req.method} /api/auction${url}` });
  }

  // Attach params to req.query so handlers can read req.query.id etc.
  Object.assign(req.query, route.params);

  try {
    const mod = await import(`${HANDLERS_DIR}${route.file}`);
    return await mod.default(req, res);
  } catch (e) {
    console.error(`[/api/auction] ${req.method} ${url} → ${route.file}:`, e);
    return res.status(500).json({ error: 'Handler error', detail: e.message });
  }
}