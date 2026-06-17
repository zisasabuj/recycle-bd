import { verifyToken } from '../lib/auth.js';

/**
 * Socket auth helper: verify JWT from handshake or auth event
 */
export async function verifySocketToken(token) {
  if (!token) throw new Error('No token');
  const decoded = verifyToken(token);
  return { id: decoded.userId, username: decoded.username };
}
