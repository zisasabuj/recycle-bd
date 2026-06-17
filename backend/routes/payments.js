import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

/**
 * 20% commission payment.
 * Real bKash/Nagad API integration would go here.
 * For now: simple mock that just marks as PAID.
 */
async function processMockPayment({ amount, invoiceNumber, customerPhone }) {
  // Simulate payment processing delay
  await new Promise(r => setTimeout(r, 500));
  return { success: true, trxId: `MOCK-${Date.now()}`, amount, invoice: invoiceNumber };
}

// POST /api/payments/:auctionId/buyer-pay
router.post('/:auctionId/buyer-pay', authMiddleware, async (req, res) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { auctionId: req.params.auctionId }
    });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.buyerId !== req.userId) return res.status(403).json({ error: 'Not buyer' });
    if (tx.buyerPaid === 'PAID') return res.status(400).json({ error: 'Already paid' });

    const result = await processMockPayment({
      amount: Number(tx.commissionAmt),
      invoiceNumber: `BUYER-${tx.id}`,
      customerPhone: req.body.phone || '01700000000'
    });

    if (result.success) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { buyerPaid: 'PAID', buyerPaidAt: new Date() }
      });
      await prisma.notification.create({
        data: {
          userId: tx.sellerId,
          type: 'BUYER_PAID',
          message: `Buyer has paid 20% commission. Please complete your payment to unlock contact details.`
        }
      });
      await checkAndUnlockContacts(tx.id, req.app.get('io'));
    }

    res.json(result);
  } catch (err) {
    console.error('[buyer-pay]', err);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// POST /api/payments/:auctionId/seller-pay
router.post('/:auctionId/seller-pay', authMiddleware, async (req, res) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { auctionId: req.params.auctionId }
    });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.sellerId !== req.userId) return res.status(403).json({ error: 'Not seller' });
    if (tx.sellerPaid === 'PAID') return res.status(400).json({ error: 'Already paid' });

    const result = await processMockPayment({
      amount: Number(tx.commissionAmt),
      invoiceNumber: `SELLER-${tx.id}`,
      customerPhone: req.body.phone || '01700000000'
    });

    if (result.success) {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { sellerPaid: 'PAID', sellerPaidAt: new Date() }
      });
      await prisma.notification.create({
        data: {
          userId: tx.buyerId,
          type: 'SELLER_PAID',
          message: `Seller has paid 20% commission. Contact details are now unlocked.`
        }
      });
      await checkAndUnlockContacts(tx.id, req.app.get('io'));
    }

    res.json(result);
  } catch (err) {
    console.error('[seller-pay]', err);
    res.status(500).json({ error: 'Payment failed' });
  }
});

async function checkAndUnlockContacts(transactionId, io) {
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!tx) return;
  if (tx.buyerPaid !== 'PAID' || tx.sellerPaid !== 'PAID') return;

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { contactUnlocked: true, completedAt: new Date() }
  });
  await prisma.auction.update({
    where: { id: tx.auctionId },
    data: { status: 'COMPLETED' }
  });

  // Notify both parties via socket
  if (io) {
    const sockets = await io.fetchSockets();
    for (const s of sockets) {
      if (s.userId === tx.buyerId || s.userId === tx.sellerId) {
        s.emit('contact_unlocked', { auctionId: tx.auctionId });
      }
    }
  }
}

// GET /api/payments/:auctionId/contact - get other party's contact (only if both paid)
router.get('/:auctionId/contact', authMiddleware, async (req, res) => {
  try {
    const tx = await prisma.transaction.findUnique({ where: { auctionId: req.params.auctionId } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (!tx.contactUnlocked) {
      return res.status(403).json({ error: 'Both parties must complete payment to unlock contact' });
    }

    const isBuyer = tx.buyerId === req.userId;
    const isSeller = tx.sellerId === req.userId;
    if (!isBuyer && !isSeller) {
      return res.status(403).json({ error: 'Not party to this transaction' });
    }

    const otherPartyId = isBuyer ? tx.sellerId : tx.buyerId;
    const otherParty = await prisma.user.findUnique({
      where: { id: otherPartyId },
      select: { username: true, fullName: true, phone: true, email: true }
    });
    res.json({ contact: otherParty });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get contact' });
  }
});

// GET /api/payments/:auctionId/status
router.get('/:auctionId/status', authMiddleware, async (req, res) => {
  try {
    const tx = await prisma.transaction.findUnique({ where: { auctionId: req.params.auctionId } });
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    res.json({
      finalAmount: Number(tx.finalAmount),
      commissionAmt: Number(tx.commissionAmt),
      buyerPaid: tx.buyerPaid,
      sellerPaid: tx.sellerPaid,
      contactUnlocked: tx.contactUnlocked
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
