import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

// All watchlist routes require auth
router.use(authMiddleware);

// GET /api/watchlist — list current user's watchlist (auctions)
router.get('/', async (req, res) => {
  try {
    const items = await prisma.watchlist.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        auction: {
          include: {
            seller: { select: { username: true, rating: true } },
            _count: { select: { bids: true, watchlist: true } }
          }
        }
      }
    });
    // Flatten so frontend can re-use card renderer directly
    const auctions = items.map(w => ({
      ...w.auction,
      _count: { ...w.auction._count, watchlist: w.auction._count.watchlist + 1 }
    }));
    res.json({ auctions, total: auctions.length });
  } catch (err) {
    console.error('[watchlist list]', err);
    res.status(500).json({ error: 'Failed to load watchlist' });
  }
});

// POST /api/watchlist — add { auctionId }
router.post('/', async (req, res) => {
  try {
    const { auctionId } = req.body;
    if (!auctionId) return res.status(400).json({ error: 'auctionId required' });

    const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });

    const item = await prisma.watchlist.upsert({
      where: { userId_auctionId: { userId: req.userId, auctionId } },
      update: {},
      create: { userId: req.userId, auctionId }
    });
    res.status(201).json({ watchlist: item, saved: true });
  } catch (err) {
    console.error('[watchlist add]', err);
    res.status(500).json({ error: 'Failed to add to watchlist' });
  }
});

// DELETE /api/watchlist/:auctionId — remove
router.delete('/:auctionId', async (req, res) => {
  try {
    await prisma.watchlist.deleteMany({
      where: { userId: req.userId, auctionId: req.params.auctionId }
    });
    res.json({ saved: false });
  } catch (err) {
    console.error('[watchlist delete]', err);
    res.status(500).json({ error: 'Failed to remove from watchlist' });
  }
});

// GET /api/watchlist/ids — list of just the auction IDs the user has saved (cheap)
router.get('/ids', async (req, res) => {
  try {
    const items = await prisma.watchlist.findMany({
      where: { userId: req.userId },
      select: { auctionId: true }
    });
    res.json({ ids: items.map(i => i.auctionId) });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;