// GET /api/payments/[auctionId]/contact — get other party's contact (only if both paid)
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';
import { getUserFromHeader } from '../../../_lib/auth.js';

export default withCors(async (req, res) => {
  if (req.method !== 'GET') return error(res, 405, 'GET only');
  const payload = getUserFromHeader(req.headers.authorization);
  if (!payload) return error(res, 401, 'Missing auth');
  const auctionId = req.query.auctionId;

  try {
    const tx = await prisma.transaction.findUnique({ where: { auctionId } });
    if (!tx) return error(res, 404, 'Transaction not found');
    if (!tx.contactUnlocked) {
      return error(res, 403, 'Both parties must complete payment to unlock contact');
    }
    const isBuyer = tx.buyerId === payload.userId;
    const isSeller = tx.sellerId === payload.userId;
    if (!isBuyer && !isSeller) return error(res, 403, 'Not party to this transaction');
    const otherPartyId = isBuyer ? tx.sellerId : tx.buyerId;
    const otherParty = await prisma.user.findUnique({
      where: { id: otherPartyId },
      select: { username: true, fullName: true, phone: true, email: true },
    });
    return json(res, 200, { contact: otherParty });
  } catch (err) {
    console.error('[contact]', err);
    return error(res, 500, 'Failed to get contact');
  }
});