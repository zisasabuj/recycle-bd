import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = '7d';

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Express middleware: requires Authorization: Bearer <token>
 * Attaches req.userId and req.user to request
 */
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Role guard middleware. Use AFTER authMiddleware.
 * Pass allowed roles: requireRole('ADMIN', 'SUPER_ADMIN')
 * Also accepts the user's own resource — pass { selfIdParam: 'id' } as 2nd arg.
 */
export function requireRole(...allowed) {
  return async (req, res, next) => {
    if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });
    try {
      const user = await (await import('./prisma.js')).prisma.user.findUnique({
        where: { id: req.userId },
        select: { role: true }
      });
      if (!user) return res.status(401).json({ error: 'User not found' });
      if (!allowed.includes(user.role)) {
        return res.status(403).json({ error: `Forbidden — need one of: ${allowed.join(', ')}` });
      }
      req.userRole = user.role;
      next();
    } catch (err) {
      res.status(500).json({ error: 'Role check failed' });
    }
  };
}

/** Convenience: SUPER_ADMIN only */
export const requireSuperAdmin = requireRole('SUPER_ADMIN');
