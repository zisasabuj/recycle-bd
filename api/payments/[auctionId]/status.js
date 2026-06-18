// GET /api/payments/[auctionId]/status — public transaction status
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'GET') return error(res, 405, 'GET only');
  const auctionId = req.query.auctionId;
  try {
    const tx = await prisma.transaction.findUnique({ where: { auctionId } });
    if (!tx) return error(res, 404, 'Transaction not found');
    return json(res, 200, {
      finalAmount: Number(tx.finalAmount),
      commissionAmt: Number(tx.commissionAmt),
      buyerPaid: tx.buyerPaid,
      sellerPaid: tx.sellerPaid,
      contactUnlocked: tx.contactUnlocked,
    });
  } catch (err) {
    console.error('[payment-status]', err);
    return error(res, 500, 'Failed');
  }
});