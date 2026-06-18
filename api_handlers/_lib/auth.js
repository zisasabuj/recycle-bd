// JWT + bcrypt auth helpers (serverless-compatible)
// Same exports as backend/lib/auth.js but without Express middleware.
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
 * Parse Bearer token from Authorization header.
 * Returns { userId, username } or null.
 */
export function getUserFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

/**
 * Verify socket token (same as JWT, just named for clarity)
 */
export function verifySocketToken(token) {
  return verifyToken(token);
}