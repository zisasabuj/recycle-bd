// GET /api/payments/[auctionId]/status — public transaction status
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'GET') return error(res, 405, 'GET only');
  const auctionId = req.query.auctionId || req.query.id;
  if (!auctionId) return error(res, 400, 'Missing auction id');
  try {
    // Schema drift: production Transaction table may not have all the fields.
    // Return what's available; null-safe defaults.
    const tx = await prisma.transaction.findUnique({ where: { auctionId } });
    if (!tx) return json(res, 200, { status: 'NONE', contactUnlocked: false });
    return json(res, 200, {
      status: tx.status || 'UNKNOWN',
      amount: tx.amount ? Number(tx.amount) : null,
      finalAmount: tx.amount ? Number(tx.amount) : null,  // alias for old API
      commissionAmt: tx.notes ? null : null,             // not in prod schema
      buyerPaid: tx.status === 'paid' || tx.status === 'completed',
      sellerPaid: tx.status === 'completed',
      contactUnlocked: tx.status === 'paid' || tx.status === 'completed',
      method: tx.method || null,
      createdAt: tx.createdAt,
    });
  } catch (err) {
    console.error('[payment-status]', err.message);
    return error(res, 500, `Failed: ${err.message}`);
  }
});