// GET/PUT /api/auth/me
// Inline pattern (matches import-data.js). Returns current user.
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

function getUserFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try { return jwt.verify(authHeader.slice(7), JWT_SECRET); }
  catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const payload = getUserFromHeader(req.headers.authorization);
  if (!payload) return res.status(401).json({ error: 'Missing or invalid Authorization header' });

  try {
    if (req.method === 'GET') {
      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, username: true, email: true, fullName: true, role: true, rating: true, phone: true, createdAt: true },
      });
      if (!user) return res.status(401).json({ error: 'User not found' });
      return res.status(200).json({ user });
    }
    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
      }
      const { fullName, phone, email } = body || {};
      const user = await prisma.user.update({
        where: { id: payload.userId },
        data: { ...(fullName && { fullName }), ...(phone && { phone }), ...(email && { email }) },
        select: { id: true, username: true, email: true, fullName: true, role: true, rating: true, phone: true },
      });
      return res.status(200).json({ user });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ error: 'Auth check failed' });
  }
}
