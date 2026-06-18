// Higher-order wrappers for Vercel serverless route handlers.
// Each exports a function that takes (req, res) and returns a Response.
//
// Usage:
//   import { withAuth, withRole, json, error } from '../_lib/middleware.js';
//   export default withAuth(async (req, res, { userId, user }) => {
//     return json(res, 200, { ok: true });
//   });

/** Send a JSON response with status code. */
export function json(res, status, body) {
  res.status(status).json(body);
}

/** Send an error response. */
export function error(res, status, message) {
  res.status(status).json({ error: message });
}

/** Wrap a handler with CORS preflight + headers. */
export function withCors(handler) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.status(204).end();
    try {
      return await handler(req, res);
    } catch (err) {
      console.error('[handler]', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * Wrap a handler that requires a valid JWT.
 * Attaches userId/username/user to req.
 * If token missing/invalid, returns 401.
 */
export function withAuth(handler) {
  return withCors(async (req, res) => {
    const { getUserFromHeader } = await import('./auth.js');
    const { prisma } = await import('./prisma.js');
    const payload = getUserFromHeader(req.headers.authorization);
    if (!payload) return error(res, 401, 'Missing or invalid Authorization header');
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true, email: true, role: true },
      });
      if (!user) return error(res, 401, 'User not found');
      req.userId = user.id;
      req.user = user;
      return await handler(req, res, { userId: user.id, user });
    } catch (err) {
      console.error('[withAuth]', err);
      return error(res, 500, 'Auth failed');
    }
  });
}

/**
 * Wrap a handler that requires specific role(s).
 * Pass allowed roles: withRole('ADMIN', 'SUPER_ADMIN', handler)
 */
export function withRole(...allowed) {
  return async (handler) => withAuth(async (req, res, ctx) => {
    if (!allowed.includes(ctx.user.role)) {
      return error(res, 403, `Forbidden — need one of: ${allowed.join(', ')}`);
    }
    return handler(req, res, ctx);
  });
}

/** Convenience: SUPER_ADMIN only */
export const withSuperAdmin = (handler) => withRole('SUPER_ADMIN')(handler);