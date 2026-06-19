// POST /api/reset-password
// ONE-OFF: resets password for a given username. DELETE AFTER USE.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  const { username, newPassword, secret } = body || {};
  if (secret !== 'reset-bidblind-2026') return res.status(403).json({ error: 'Bad secret' });
  if (!username || !newPassword) return res.status(400).json({ error: 'username + newPassword required' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const user = await prisma.user.update({
    where: { username },
    data: { passwordHash },
    select: { id: true, username: true, email: true, role: true },
  });
  return res.status(200).json({ ok: true, user });
}
