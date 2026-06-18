// One-shot migration endpoint — runs as its own Vercel function
// so the bundler includes it without depending on the catch-all
// dynamic-import plumbing. Idempotent: safe to call repeatedly.
//
// Trigger: GET /api/migrate  (and POST)
// Returns: list of statements that were applied (or skipped).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Prisma schema DDL for the Auction model + supporting models.
// Kept in sync with backend/prisma/schema.prisma. If you change
// the schema, regenerate this list (or import the migration.sql
// from prisma/migrations/).
const STATEMENTS = [
  // Enums
  `DO $$ BEGIN
     CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT','ACTIVE','ENDED','SOLD','CANCELLED');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN
     CREATE TYPE "UserRole" AS ENUM ('USER','ADMIN');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN
     CREATE TYPE "NotificationType" AS ENUM ('BID_PLACED','BID_OUTBID','AUCTION_WON','AUCTION_ENDED','PAYMENT_RECEIVED','NEW_MESSAGE');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  // Users
  `CREATE TABLE IF NOT EXISTS "User" (
     "id" TEXT PRIMARY KEY,
     "email" TEXT UNIQUE,
     "phone" TEXT UNIQUE,
     "name" TEXT,
     "passwordHash" TEXT,
     "role" "UserRole" NOT NULL DEFAULT 'USER',
     "avatar" TEXT,
     "city" TEXT,
     "district" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  // Sessions
  `CREATE TABLE IF NOT EXISTS "Session" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
     "token" TEXT UNIQUE NOT NULL,
     "expiresAt" TIMESTAMP(3) NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");`,
  `CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");`,
  // Auctions
  `CREATE TABLE IF NOT EXISTS "Auction" (
     "id" TEXT PRIMARY KEY,
     "title" TEXT NOT NULL,
     "description" TEXT,
     "category" TEXT NOT NULL,
     "subcategory" TEXT,
     "startingBid" INTEGER NOT NULL,
     "reservePrice" INTEGER,
     "currentMaxBid" INTEGER,
     "minIncrement" INTEGER NOT NULL DEFAULT 100,
     "buyNowPrice" INTEGER,
     "imageUrl" TEXT,
     "additionalImages" TEXT,
     "city" TEXT NOT NULL,
     "district" TEXT,
     "area" TEXT,
     "thana" TEXT,
     "address" TEXT,
     "condition" TEXT,
     "year" INTEGER,
     "brand" TEXT,
     "model" TEXT,
     "status" "AuctionStatus" NOT NULL DEFAULT 'ACTIVE',
     "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
     "winnerId" TEXT REFERENCES "User"("id"),
     "viewCount" INTEGER NOT NULL DEFAULT 0,
     "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "endsAt" TIMESTAMP(3) NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Auction_status_idx" ON "Auction"("status");`,
  `CREATE INDEX IF NOT EXISTS "Auction_endsAt_idx" ON "Auction"("endsAt");`,
  `CREATE INDEX IF NOT EXISTS "Auction_sellerId_idx" ON "Auction"("sellerId");`,
  `CREATE INDEX IF NOT EXISTS "Auction_category_idx" ON "Auction"("category");`,
  // Bids
  `CREATE TABLE IF NOT EXISTS "Bid" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "bidderId" TEXT NOT NULL REFERENCES "User"("id"),
     "amount" INTEGER NOT NULL,
     "isWinning" BOOLEAN NOT NULL DEFAULT false,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Bid_auctionId_idx" ON "Bid"("auctionId");`,
  `CREATE INDEX IF NOT EXISTS "Bid_bidderId_idx" ON "Bid"("bidderId");`,
  // Watchlist
  `CREATE TABLE IF NOT EXISTS "Watchlist" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE("userId","auctionId")
   );`,
  // Chats
  `CREATE TABLE IF NOT EXISTS "Chat" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "buyerId" TEXT NOT NULL REFERENCES "User"("id"),
     "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE("auctionId","buyerId","sellerId")
   );`,
  `CREATE TABLE IF NOT EXISTS "Message" (
     "id" TEXT PRIMARY KEY,
     "chatId" TEXT NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
     "senderId" TEXT NOT NULL REFERENCES "User"("id"),
     "text" TEXT NOT NULL,
     "readAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Message_chatId_idx" ON "Message"("chatId");`,
  // Notifications
  `CREATE TABLE IF NOT EXISTS "Notification" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
     "type" "NotificationType" NOT NULL,
     "title" TEXT NOT NULL,
     "body" TEXT NOT NULL,
     "data" TEXT,
     "readAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");`,
  // Payments
  `CREATE TABLE IF NOT EXISTS "Payment" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id"),
     "buyerId" TEXT NOT NULL REFERENCES "User"("id"),
     "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
     "amount" INTEGER NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'pending',
     "method" TEXT,
     "transactionId" TEXT,
     "phone" TEXT,
     "notes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  // Edit-mode settings
  `CREATE TABLE IF NOT EXISTS "EditModeSetting" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT UNIQUE NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "sellerCanEdit" BOOLEAN NOT NULL DEFAULT false,
     "expiresAt" TIMESTAMP(3),
     "token" TEXT UNIQUE,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const results = { ok: 0, skipped: 0, errors: [] };
  for (const sql of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.ok++;
    } catch (e) {
      // "already exists" is fine for IF NOT EXISTS, but some PG
      // versions throw differently — treat any "exists" error as skip.
      if (/already exists|duplicate/i.test(e.message)) {
        results.skipped++;
      } else {
        results.errors.push({ sql: sql.slice(0, 80) + '...', error: e.message });
      }
    }
  }

  return res.status(200).json({
    success: results.errors.length === 0,
    statements_total: STATEMENTS.length,
    applied: results.ok,
    skipped: results.skipped,
    errors: results.errors,
  });
}
