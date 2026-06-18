// POST /api/payments/[auctionId]/buyer-pay
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';
import { getUserFromHeader } from '../../../_lib/auth.js';
import { processMockPayment, checkAndUnlockContacts } from '../../../_lib/payment-helpers.js';

export default withCors(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  const payload = getUserFromHeader(req.headers.authorization);
  if (!payload) return error(res, 401, 'Missing auth');
  const auctionId = req.query.auctionId;

  try {
    const tx = await prisma.transaction.findUnique({ where: { auctionId } });
    if (!tx) return error(res, 404, 'Transaction not found');
    if (tx.buyerId !== payload.userId) return error(res, 403, 'Not buyer');
    if (tx.buyerPaid === 'PAID') return error(res, 400, 'Already paid');

    const result = await processMockPayment({
      amount: Number(tx.commissionAmt),
      invoiceNumber: `BUYER-${tx.id}`,
    });
    if (result.success) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { buyerPaid: 'PAID', buyerPaidAt: new Date() },
      });
      await prisma.notification.create({
        data: {
          userId: tx.sellerId,
          type: 'BUYER_PAID',
          message: 'Buyer has paid 20% commission. Please complete your payment to unlock contact details.',
          data: { auctionId, transactionId: tx.id },
        },
      });
      await checkAndUnlockContacts(tx.id);
    }
    return json(res, 200, result);
  } catch (err) {
    console.error('[buyer-pay]', err);
    return error(res, 500, 'Payment failed');
  }
});