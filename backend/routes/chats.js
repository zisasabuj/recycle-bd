import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

// All chat routes require auth
router.use(authMiddleware);

// GET /api/chats — list current user's chat threads (as buyer or seller)
router.get('/', async (req, res) => {
  try {
    const chats = await prisma.chat.findMany({
      where: {
        OR: [{ buyerId: req.userId }, { sellerId: req.userId }]
      },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        auction: { select: { id: true, title: true, images: true, status: true } },
        buyer:   { select: { id: true, username: true, fullName: true } },
        seller:  { select: { id: true, username: true, fullName: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });
    // Annotate with counterparty + unread count
    const result = await Promise.all(chats.map(async c => {
      const unread = await prisma.chatMessage.count({
        where: { chatId: c.id, readAt: null, senderId: { not: req.userId } }
      });
      const isBuyer = c.buyerId === req.userId;
      return {
        ...c,
        unread,
        counterparty: isBuyer ? c.seller : c.buyer,
        role: isBuyer ? 'buyer' : 'seller'
      };
    }));
    res.json({ chats: result });
  } catch (err) {
    console.error('[chat list]', err);
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

// POST /api/chats — get-or-create chat for an auction
// Body: { auctionId }
// Only the winner (buyer) and the seller can have a chat.
// Auction must be ended (status COMPLETED or PAYMENT_PENDING).
router.post('/', async (req, res) => {
  try {
    const { auctionId } = req.body;
    if (!auctionId) return res.status(400).json({ error: 'auctionId required' });

    const auction = await prisma.auction.findUnique({
      where: { id: auctionId },
      include: { bids: { orderBy: { amount: 'desc' }, take: 1 } }
    });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });

    // Post-win gate: chat opens only after the auction has actually ended
    // and a winner is assigned (status COMPLETED or PAYMENT_PENDING).
    const endedStates = ['COMPLETED', 'PAYMENT_PENDING'];
    if (!endedStates.includes(auction.status)) {
      return res.status(403).json({
        error: 'Chat unlocks after the auction ends and a winner is assigned',
        status: auction.status
      });
    }

    const isSeller = auction.sellerId === req.userId;
    // Winner = highest bid bidderId (currentMaxBid was set by the auction end worker)
    const topBid = auction.bids[0];
    const winnerId = topBid ? topBid.bidderId : null;

    if (!isSeller && req.userId !== winnerId) {
      return res.status(403).json({ error: 'Only the seller or the winner can open this chat' });
    }

    const buyerId = winnerId;
    const sellerId = auction.sellerId;
    if (!buyerId) return res.status(400).json({ error: 'No winner assigned yet' });

    const chat = await prisma.chat.upsert({
      where: { auctionId_buyerId_sellerId: { auctionId, buyerId, sellerId } },
      update: {},
      create: { auctionId, buyerId, sellerId },
      include: {
        buyer: { select: { id: true, username: true, fullName: true } },
        seller: { select: { id: true, username: true, fullName: true } }
      }
    });
    res.status(201).json({ chat });
  } catch (err) {
    console.error('[chat create]', err);
    res.status(500).json({ error: 'Failed to open chat' });
  }
});

// GET /api/chats/:id/messages — paginated
router.get('/:id/messages', async (req, res) => {
  try {
    const chat = await prisma.chat.findUnique({ where: { id: req.params.id } });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (chat.buyerId !== req.userId && chat.sellerId !== req.userId) {
      return res.status(403).json({ error: 'Not a participant' });
    }
    const { before, limit = 50 } = req.query;
    const where = { chatId: chat.id, ...(before && { createdAt: { lt: new Date(String(before)) } }) };

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit), 100)
    });
    // Mark incoming messages as read
    await prisma.chatMessage.updateMany({
      where: { chatId: chat.id, readAt: null, senderId: { not: req.userId } },
      data: { readAt: new Date() }
    });
    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('[chat messages get]', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/chats/:id/messages — send
router.post('/:id/messages', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
    if (text.length > 1000) return res.status(400).json({ error: 'Message too long (max 1000 chars)' });

    const chat = await prisma.chat.findUnique({ where: { id: req.params.id } });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (chat.buyerId !== req.userId && chat.sellerId !== req.userId) {
      return res.status(403).json({ error: 'Not a participant' });
    }

    const msg = await prisma.chatMessage.create({
      data: { chatId: chat.id, senderId: req.userId, text: text.trim() }
    });
    await prisma.chat.update({
      where: { id: chat.id },
      data: { lastMessageAt: new Date(), lastMessage: text.trim().slice(0, 80) }
    });

    // Realtime push via Socket.IO (best-effort, non-fatal if it fails)
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`chat:${chat.id}`).emit('chat:message', { chatId: chat.id, message: msg });
        const otherId = chat.buyerId === req.userId ? chat.sellerId : chat.buyerId;
        io.to(`user:${otherId}`).emit('chat:message', { chatId: chat.id, message: msg });
      }
    } catch {}

    res.status(201).json({ message: msg });
  } catch (err) {
    console.error('[chat send]', err);
    res.status(500).json({ error: 'Failed to send' });
  }
});

export default router;