// GET /api/chats/[id]/messages — paginated, marks incoming as read
// POST /api/chats/[id]/messages — send a message
import { prisma } from '../../../_lib/prisma.js';
import { withCors, withAuth, json, error } from '../../../_lib/middleware.js';

export default withCors(withAuth(async (req, res) => {
  try {
    const chatId = req.query.id;
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) return error(res, 404, 'Chat not found');
    if (chat.buyerId !== req.userId && chat.sellerId !== req.userId) {
      return error(res, 403, 'Not a participant');
    }

    if (req.method === 'GET') {
      const { before, limit = 50 } = req.query;
      const where = { chatId: chat.id, ...(before && { createdAt: { lt: new Date(String(before)) } }) };
      const messages = await prisma.chatMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(Number(limit), 100),
      });
      await prisma.chatMessage.updateMany({
        where: { chatId: chat.id, readAt: null, senderId: { not: req.userId } },
        data: { readAt: new Date() },
      });
      return json(res, 200, { messages: messages.reverse() });
    }

    if (req.method === 'POST') {
      const { text } = req.body || {};
      if (!text || !text.trim()) return error(res, 400, 'text required');
      if (text.length > 1000) return error(res, 400, 'Message too long (max 1000 chars)');

      const msg = await prisma.chatMessage.create({
        data: { chatId: chat.id, senderId: req.userId, text: text.trim() },
      });
      await prisma.chat.update({
        where: { id: chat.id },
        data: { lastMessageAt: new Date(), lastMessage: text.trim().slice(0, 80) },
      });
      // Note: realtime push via socket removed for serverless. Frontend will poll.
      return json(res, 201, { message: msg });
    }

    return error(res, 405, 'GET or POST only');
  } catch (err) {
    console.error('[chat messages]', err);
    return error(res, 500, 'Failed');
  }
}));