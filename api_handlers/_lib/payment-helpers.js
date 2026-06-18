// Shared payment helpers for buyer-pay, seller-pay, etc.
// Mock payment processor — replace with real bKash/Nagad API in production.
import { prisma } from './prisma.js';

export async function processMockPayment({ amount, invoiceNumber }) {
  // Simulate payment processing latency (synchronous, no real delay in serverless)
  return { success: true, trxId: `MOCK-${Date.now()}`, amount, invoice: invoiceNumber };
}

// When both buyer and seller have paid 20% commission:
// - Mark transaction contactUnlocked + completedAt
// - Mark auction COMPLETED
// - Notification rows for both parties (polling replaces socket emit)
export async function checkAndUnlockContacts(transactionId) {
  const tx = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!tx) return { unlocked: false };
  if (tx.buyerPaid !== 'PAID' || tx.sellerPaid !== 'PAID') {
    return { unlocked: false };
  }
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transactionId },
      data: { contactUnlocked: true, completedAt: new Date() },
    }),
    prisma.auction.update({
      where: { id: tx.auctionId },
      data: { status: 'COMPLETED' },
    }),
  ]);
  return { unlocked: true };
}