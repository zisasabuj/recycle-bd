// One-shot migration endpoint — runs as its own Vercel function.
// Idempotent: safe to call repeatedly. Uses DROP IF EXISTS then
// CREATE to keep schema in lockstep with backend/prisma/schema.prisma.
//
// Trigger: GET /api/migrate
// Optional: ?drop=1  → drops all tables first (use to reset)

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DROP_ALL = [
  `DROP TABLE IF EXISTS "EditModeSetting" CASCADE;`,
  `DROP TABLE IF EXISTS "Payment" CASCADE;`,
  `DROP TABLE IF EXISTS "Transaction" CASCADE;`,
  `DROP TABLE IF EXISTS "Notification" CASCADE;`,
  `DROP TABLE IF EXISTS "Message" CASCADE;`,
  `DROP TABLE IF EXISTS "Chat" CASCADE;`,
  `DROP TABLE IF EXISTS "Watchlist" CASCADE;`,
  `DROP TABLE IF EXISTS "Bid" CASCADE;`,
  `DROP TABLE IF EXISTS "Auction" CASCADE;`,
  `DROP TABLE IF EXISTS "Session" CASCADE;`,
  `DROP TABLE IF EXISTS "User" CASCADE;`,
  `DROP TYPE IF EXISTS "NotificationType";`,
  `DROP TYPE IF EXISTS "AuctionStatus";`,
  `DROP TYPE IF EXISTS "UserRole";`,
];

const STATEMENTS = [
  // Enums
  `DO $$ BEGIN
     CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT','ACTIVE','ENDED','SOLD','CANCELLED');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN
     CREATE TYPE "UserRole" AS ENUM ('USER','ADMIN','BOTH','SUPER_ADMIN');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,
  `DO $$ BEGIN
     CREATE TYPE "NotificationType" AS ENUM ('BID_PLACED','BID_OUTBID','AUCTION_WON','AUCTION_ENDED','PAYMENT_RECEIVED','NEW_MESSAGE');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  // User (matches ACTUAL production schema from local Docker dump)
  `CREATE TABLE IF NOT EXISTS "User" (
     "id" TEXT PRIMARY KEY,
     "username" TEXT UNIQUE NOT NULL,
     "email" TEXT UNIQUE NOT NULL,
     "passwordHash" TEXT NOT NULL,
     "fullName" TEXT,
     "phone" TEXT,
     "role" "UserRole" NOT NULL DEFAULT 'USER',
     "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "avatar" TEXT,
     "city" TEXT,
     "district" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,

  // Session
  `CREATE TABLE IF NOT EXISTS "Session" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
     "token" TEXT UNIQUE NOT NULL,
     "expiresAt" TIMESTAMP(3) NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");`,
  `CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");`,

  // Auction (matches actual schema.prisma)
  `CREATE TABLE IF NOT EXISTS "Auction" (
     "id" TEXT PRIMARY KEY,
     "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
     "title" TEXT NOT NULL,
     "description" TEXT NOT NULL,
     "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
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
     "winnerId" TEXT,
     "secondWinnerId" TEXT,
     "viewCount" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Auction_status_endsAt_idx" ON "Auction"("status","endsAt");`,
  `CREATE INDEX IF NOT EXISTS "Auction_category_city_idx" ON "Auction"("category","city");`,
  `CREATE INDEX IF NOT EXISTS "Auction_sellerId_idx" ON "Auction"("sellerId");`,

  // Bid
  `CREATE TABLE IF NOT EXISTS "Bid" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "bidderId" TEXT NOT NULL REFERENCES "User"("id"),
     "amount" DECIMAL(12,2) NOT NULL,
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

  // Chat
  `CREATE TABLE IF NOT EXISTS "Chat" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "buyerId" TEXT NOT NULL REFERENCES "User"("id"),
     "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     UNIQUE("auctionId","buyerId","sellerId")
   );`,

  // Message
  `CREATE TABLE IF NOT EXISTS "Message" (
     "id" TEXT PRIMARY KEY,
     "chatId" TEXT NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
     "senderId" TEXT NOT NULL REFERENCES "User"("id"),
     "text" TEXT NOT NULL,
     "readAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Message_chatId_idx" ON "Message"("chatId");`,

  // Notification
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

  // Transaction
  `CREATE TABLE IF NOT EXISTS "Transaction" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT UNIQUE NOT NULL REFERENCES "Auction"("id"),
     "buyerId" TEXT NOT NULL REFERENCES "User"("id"),
     "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
     "amount" DECIMAL(12,2) NOT NULL,
     "status" TEXT NOT NULL DEFAULT 'pending',
     "method" TEXT,
     "transactionRef" TEXT,
     "phone" TEXT,
     "notes" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,

  // EditModeSetting
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

  // Vercel Node runtime should parse query, but be defensive.
  const url = new URL(req.url, 'https://x');
  const dropFirst = url.searchParams.get('drop') === '1' || req.query?.drop === '1';
  const dropResults = { dropped: 0, errors: [] };

  if (dropFirst) {
    for (const sql of DROP_ALL) {
      try {
        await prisma.$executeRawUnsafe(sql);
        dropResults.dropped++;
      } catch (e) {
        if (!/does not exist/i.test(e.message)) {
          dropResults.errors.push({ sql: sql.slice(0, 60), error: e.message });
        }
      }
    }
  }

  const results = { ok: 0, skipped: 0, errors: [] };
  for (const sql of STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
      results.ok++;
    } catch (e) {
      if (/already exists|duplicate/i.test(e.message)) {
        results.skipped++;
      } else {
        results.errors.push({ sql: sql.slice(0, 80) + '...', error: e.message });
      }
    }
  }

  return res.status(200).json({
    success: results.errors.length === 0,
    dropped: dropResults,
    statements_total: STATEMENTS.length,
    applied: results.ok,
    skipped: results.skipped,
    errors: results.errors,
  });
}
