import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

// All cart routes require login
router.use(authMiddleware);

/**
 * GET /api/cart - list current user's cart items (New items only)
 */
router.get('/', async (req, res) => {
  try {
    const items = await prisma.cartItem.findMany({
      where: { userId: req.userId },
      include: {
        auction: {
          include: {
            seller: { select: { id: true, username: true, rating: true } },
            _count: { select: { bids: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ items });
  } catch (err) {
    console.error('[cart list]', err);
    res.status(500).json({ error: 'Failed to load cart' });
  }
});

/**
 * POST /api/cart - add item to cart (New items only)
 * body: { auctionId }
 */
router.post('/', async (req, res) => {
  try {
    const { auctionId } = req.body;
    if (!auctionId) return res.status(400).json({ error: 'auctionId required' });

    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    if (auction.condition !== 'New') {
      return res.status(400).json({ error: 'Only New items can be added to cart. Used items use bidding.' });
    }
    if (auction.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'Auction is not active' });
    }
    if (auction.sellerId === req.userId) {
      return res.status(400).json({ error: 'Sellers cannot add their own items to cart' });
    }

    const cartItem = await prisma.cartItem.upsert({
      where: { userId_auctionId: { userId: req.userId, auctionId } },
      update: {},
      create: { userId: req.userId, auctionId }
    });

    res.status(201).json({ cartItem });
  } catch (err) {
    console.error('[cart add]', err);
    res.status(500).json({ error: 'Failed to add to cart' });
  }
});

/**
 * DELETE /api/cart/:auctionId - remove item from cart
 */
router.delete('/:auctionId', async (req, res) => {
  try {
    await prisma.cartItem.deleteMany({
      where: { userId: req.userId, auctionId: req.params.auctionId }
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[cart remove]', err);
    res.status(500).json({ error: 'Failed to remove from cart' });
  }
});

export default router;