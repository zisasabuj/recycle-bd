// POST /api/payments/[auctionId]/seller-pay
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
    if (tx.sellerId !== payload.userId) return error(res, 403, 'Not seller');
    if (tx.sellerPaid === 'PAID') return error(res, 400, 'Already paid');

    const result = await processMockPayment({
      amount: Number(tx.commissionAmt),
      invoiceNumber: `SELLER-${tx.id}`,
    });
    if (result.success) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { sellerPaid: 'PAID', sellerPaidAt: new Date() },
      });
      await prisma.notification.create({
        data: {
          userId: tx.buyerId,
          type: 'SELLER_PAID',
          message: 'Seller has paid 20% commission. Contact details are now unlocked.',
          data: { auctionId, transactionId: tx.id },
        },
      });
      await checkAndUnlockContacts(tx.id);
    }
    return json(res, 200, result);
  } catch (err) {
    console.error('[seller-pay]', err);
    return error(res, 500, 'Payment failed');
  }
});