import { withCors } from '../../_lib/middleware.js';
import { prisma } from '../../_lib/prisma.js';

async function handler(req, res) {
  withCors(req, res);

  // Require auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  let userId;
  try {
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'recycle-bd-jwt-secret-2026-xyz-prod-only');
    userId = decoded.id;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }

  if (req.method === 'GET') {
    // Get user's cart items
    const cartItems = await prisma.cartItem.findMany({
      where: { userId },
      include: {
        auction: {
          include: {
            seller: { select: { username: true } },
            _count: { select: { bids: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ cart: cartItems });
  }

  if (req.method === 'POST') {
    const { auctionId } = req.body;
    if (!auctionId) return res.status(400).json({ error: 'auctionId is required' });

    // Check if auction exists and is active
    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    if (auction.status !== 'ACTIVE') return res.status(400).json({ error: 'Auction is not active' });

    // Check if already in cart
    const existing = await prisma.cartItem.findFirst({
      where: { userId, auctionId }
    });
    if (existing) return res.status(400).json({ error: 'Already in cart' });

    const item = await prisma.cartItem.create({
      data: { userId, auctionId }
    });
    return res.status(201).json({ item });
  }

  if (req.method === 'DELETE') {
    const { auctionId } = req.body;
    if (!auctionId) return res.status(400).json({ error: 'auctionId is required' });

    await prisma.cartItem.deleteMany({
      where: { userId, auctionId }
    });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default handler;
