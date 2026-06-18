// Catch-all router — Vercel Hobby plan = max 12 serverless functions.
// We use ONE function and dispatch internally to handlers in /api_handlers/.
//
// URL pattern: /api/<path>   e.g. /api/auctions, /api/auctions/123/bids
// The catch-all route receives the path as req.query.path (array).

// Static imports of _lib/ — forces Vercel bundler to include them in the
// module graph so they can resolve @prisma/client and other deps.
import '../_lib/prisma.js';
import '../_lib/auth.js';
import '../_lib/middleware.js';
import '../_lib/bdLocations.js';
import '../_lib/imgbb.js';
import '../_lib/payment-helpers.js';

// Side-effect import of the static handler registry — forces bundler
// to include every handler file in the function bundle.
import '../api_handlers/_registry.js';
import HANDLERS from '../api_handlers/_registry.js';

const HANDLERS_DIR = '../api_handlers';

// Route table: maps (METHOD + URL-pattern) → relative file in HANDLERS_DIR
// Wildcards use ':param' syntax → matches a single segment and exposes it via req.query.
const routes = [
  // Health
  { method: 'GET',  pattern: '/health',                                       file: '/health.js' },

  // Auth
  { method: 'POST', pattern: '/auth/register',                                file: '/auth/register.js' },
  { method: 'POST', pattern: '/auth/login',                                   file: '/auth/login.js' },
  { method: 'GET',  pattern: '/auth/me',                                      file: '/auth/me.js' },
  { method: 'PATCH',pattern: '/auth/me',                                      file: '/auth/me.js' },
  { method: 'GET',  pattern: '/auth/users',                                   file: '/auth/users/index.js' },
  { method: 'GET',  pattern: '/auth/users/:id/role',                          file: '/auth/users/[id]/role.js' },
  { method: 'PATCH',pattern: '/auth/users/:id/role',                          file: '/auth/users/[id]/role.js' },

  // Auctions — list + create
  { method: 'GET',  pattern: '/auctions',                                     file: '/auctions/index.js' },
  { method: 'POST', pattern: '/auctions',                                     file: '/auctions/index.js' },
  { method: 'GET',  pattern: '/auctions/meta/locations',                      file: '/auctions/meta/locations.js' },
  { method: 'GET',  pattern: '/auctions/meta/categories',                     file: '/auctions/meta/categories.js' },
  { method: 'GET',  pattern: '/auctions/meta/bd-locations',                   file: '/auctions/meta/bd-locations.js' },
  { method: 'GET',  pattern: '/auctions/seller/dashboard',                    file: '/auctions/seller/dashboard.js' },

  // Auctions — single (with subroutes)
  { method: 'GET',  pattern: '/auctions/:id',                                 file: '/auctions/[id]/index.js' },
  { method: 'GET',  pattern: '/auctions/:id/bids',                            file: '/auctions/[id]/bids.js' },
  { method: 'POST', pattern: '/auctions/:id/place-bid',                       file: '/auctions/[id]/place-bid.js' },
  { method: 'POST', pattern: '/auctions/:id/confirm',                         file: '/auctions/[id]/confirm.js' },
  { method: 'POST', pattern: '/auctions/:id/reject',                          file: '/auctions/[id]/reject.js' },
  { method: 'GET',  pattern: '/auctions/:id/similar',                         file: '/auctions/[id]/similar.js' },
  { method: 'POST', pattern: '/auctions/:id/view',                            file: '/auctions/[id]/view.js' },

  // Payments
  { method: 'POST', pattern: '/payments/:auctionId/buyer-pay',                file: '/payments/[auctionId]/buyer-pay.js' },
  { method: 'POST', pattern: '/payments/:auctionId/seller-pay',               file: '/payments/[auctionId]/seller-pay.js' },
  { method: 'GET',  pattern: '/payments/:auctionId/contact',                  file: '/payments/[auctionId]/contact.js' },
  { method: 'GET',  pattern: '/payments/:auctionId/status',                   file: '/payments/[auctionId]/status.js' },

  // Upload
  { method: 'POST', pattern: '/upload/image',                                 file: '/upload/image.js' },
  { method: 'POST', pattern: '/upload/auction',                               file: '/upload/auction.js' },

  // Chats
  { method: 'GET',  pattern: '/chats',                                        file: '/chats/index.js' },
  { method: 'POST', pattern: '/chats',                                        file: '/chats/index.js' },
  { method: 'GET',  pattern: '/chats/:id/messages',                           file: '/chats/[id]/messages.js' },
  { method: 'POST', pattern: '/chats/:id/send',                               file: '/chats/[id]/messages.js' },
  { method: 'POST', pattern: '/chats/:id/read',                               file: '/chats/[id]/messages.js' },

  // Watchlist
  { method: 'GET',  pattern: '/watchlist',                                    file: '/watchlist/index.js' },
  { method: 'POST', pattern: '/watchlist',                                    file: '/watchlist/index.js' },
  { method: 'GET',  pattern: '/watchlist/ids',                                file: '/watchlist/ids.js' },
  { method: 'POST', pattern: '/watchlist/:auctionId',                         file: '/watchlist/[auctionId].js' },
  { method: 'DELETE', pattern: '/watchlist/:auctionId',                       file: '/watchlist/[auctionId].js' },

  // Notifications
  { method: 'GET',  pattern: '/notifications',                                file: '/notifications/index.js' },
  { method: 'POST', pattern: '/notifications/read-all',                       file: '/notifications/read-all.js' },

  // Admin
  { method: 'GET',  pattern: '/admin/settings/edit-mode',                     file: '/admin/settings/edit-mode.js' },
  { method: 'POST', pattern: '/admin/settings/edit-mode',                     file: '/admin/settings/edit-mode.js' },
  { method: 'PATCH',pattern: '/admin/settings/edit-mode',                     file: '/admin/settings/edit-mode.js' },

  // Setup (one-time)
  { method: 'POST', pattern: '/setup/import-dump',                            file: '/setup/import-dump.js' },
  { method: 'GET',  pattern: '/setup/import-dump',                            file: '/setup/import-dump.js' },
  { method: 'POST', pattern: '/setup/migrate',                               file: '/setup/migrate.js' },
  { method: 'GET',  pattern: '/setup/migrate',                               file: '/setup/migrate.js' },

  // Cron (disabled on Hobby, but kept for compatibility)
  { method: 'GET',  pattern: '/cron/expire',                                  file: '/cron/expire.js' },
  { method: 'POST', pattern: '/cron/expire',                                  file: '/cron/expire.js' },

  // Settings (admin)
  { method: 'GET',  pattern: '/settings/edit-mode',                           file: '/settings/edit-mode.js' },
  { method: 'POST', pattern: '/settings/edit-mode',                           file: '/settings/edit-mode.js' },
  { method: 'PATCH',pattern: '/settings/edit-mode',                           file: '/settings/edit-mode.js' },
];

// Convert URL pattern with :param to regex, extract param names
function compilePattern(pattern) {
  const paramNames = [];
  const regexStr = pattern.replace(/:[a-zA-Z]+/g, (m) => {
    paramNames.push(m.slice(1));
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

const compiled = routes.map((r) => ({
  method: r.method,
  ...compilePattern(r.pattern),
  file: r.file,
}));

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
  // CORS preflight — must be answered by the router itself,
  // individual handlers also wrap with withCors, but preflight never reaches them.
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Build URL path from req.url — more reliable than req.query.path
  // (Vercel optional catch-all doesn't always populate req.query.path)
  let urlPath = req.url || '/';
  // Strip query string
  urlPath = urlPath.split('?')[0];
  // Strip /api prefix
  if (urlPath.startsWith('/api/')) urlPath = urlPath.slice(4);
  else if (urlPath === '/api') urlPath = '/';
  const url = urlPath || '/';

  const route = findRoute(req.method, url);
  if (!route) {
    return res.status(404).json({ error: `Route not found: ${req.method} ${url}` });
  }

  // Attach params to req.query so handlers can read req.query.id etc.
  Object.assign(req.query, route.params);

  try {
    // Look up the handler in the static registry (bundler-resolved).
    // route.file is like '/setup/migrate.js' → key 'setup/migrate'.
    const key = route.file.replace(/^\//, '').replace(/\.js$/, '');
    const handler = HANDLERS[key];
    if (!handler) {
      console.error(`[router] Handler not in registry: ${key}`);
      return res.status(500).json({ error: `Handler not bundled: ${key}` });
    }
    return await handler(req, res);
  } catch (e) {
    console.error(`[router] ${req.method} ${url} → ${route.file}:`, e);
    return res.status(500).json({ error: 'Handler error', detail: e.message });
  }
}
