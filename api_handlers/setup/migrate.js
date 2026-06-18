// GET/POST /api/setup/migrate
// ONE-TIME: creates all Prisma tables in the target DB.
// Idempotent — uses CREATE TABLE IF NOT EXISTS so safe to re-run.
// Also creates all indexes and enums.
//
// Why: Vercel Hobby plan deploys run from scratch. If the target DB
// is fresh (e.g. a brand new Neon project), the first request will
// fail because tables don't exist. This endpoint bootstraps them.

import { prisma } from '../../_lib/prisma.js';
import { withCors, json, error } from '../../_lib/middleware.js';

const STATEMENTS = [
  // Enums
  `DO $$ BEGIN
     CREATE TYPE "UserRole" AS ENUM ('BUYER','SELLER','BOTH','ADMIN','SUPER_ADMIN');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN
     CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT','ACTIVE','PAYMENT_PENDING','COMPLETED','CANCELLED','EXPIRED');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN
     CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','PAID','FAILED','REFUNDED');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  // User
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT PRIMARY KEY,
    "username" TEXT NOT NULL UNIQUE,
    "email" TEXT NOT NULL UNIQUE,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'BOTH',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,

  // Auction
  `CREATE TABLE IF NOT EXISTS "Auction" (
    "id" TEXT PRIMARY KEY,
    "sellerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "images" TEXT[],
    "category" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "currentMaxBid" DECIMAL(12,2),
    "bidIncrement" DECIMAL(12,2) NOT NULL DEFAULT 100,
    "city" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "district" TEXT,
    "thana" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "Auction_status_endsAt_idx" ON "Auction"("status","endsAt");`,
  `CREATE INDEX IF NOT EXISTS "Auction_sellerId_idx" ON "Auction"("sellerId");`,
  `CREATE INDEX IF NOT EXISTS "Auction_city_area_idx" ON "Auction"("city","area");`,

  // Bid
  `CREATE TABLE IF NOT EXISTS "Bid" (
    "id" TEXT PRIMARY KEY,
    "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
    "bidderId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "Bid_auctionId_idx" ON "Bid"("auctionId");`,
  `CREATE INDEX IF NOT EXISTS "Bid_bidderId_idx" ON "Bid"("bidderId");`,

  // Transaction
  `CREATE TABLE IF NOT EXISTS "Transaction" (
    "id" TEXT PRIMARY KEY,
    "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
    "buyerId" TEXT NOT NULL REFERENCES "User"("id"),
    "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "trxId" TEXT,
    "senderNumber" TEXT,
    "method" TEXT,
    "paidAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "Transaction_auctionId_idx" ON "Transaction"("auctionId");`,

  // Notification
  `CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");`,

  // Watchlist
  `CREATE TABLE IF NOT EXISTS "Watchlist" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("userId","auctionId")
  );`,

  // Chat + ChatMessage
  `CREATE TABLE IF NOT EXISTS "Chat" (
    "id" TEXT PRIMARY KEY,
    "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
    "buyerId" TEXT NOT NULL REFERENCES "User"("id"),
    "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT PRIMARY KEY,
    "chatId" TEXT NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
    "senderId" TEXT NOT NULL REFERENCES "User"("id"),
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`,
];

export default withCors(async (req, res) => {
  try {
    const results = [];
    for (const sql of STATEMENTS) {
      try {
        await prisma.$executeRawUnsafe(sql);
        results.push({ ok: true, sql: sql.slice(0, 50) + '...' });
      } catch (e) {
        results.push({ ok: false, sql: sql.slice(0, 50) + '...', err: e.message.split('\n')[0] });
      }
    }
    return json(res, 200, {
      ok: true,
      total: STATEMENTS.length,
      succeeded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results: results.filter(r => !r.ok),
    });
  } catch (err) {
    return error(res, 500, 'Migration failed: ' + err.message);
  }
});
