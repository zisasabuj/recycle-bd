// Production migration endpoint — Vercel function.
// Idempotent: safe to call repeatedly. Drops and recreates the schema to
// match backend/prisma/schema.prisma exactly.
//
// Usage:
//   GET  /api/migrate          → run all migrations (idempotent CREATE)
//   GET  /api/migrate?drop=1   → drop all + recreate (full reset)
//
// Schema source: backend/prisma/schema.prisma (v33 — biddingDurationDays, CartItem)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DROP_ALL = [
  // Drop orphan/old tables first (don't break on missing)
  `DROP TABLE IF EXISTS "EditModeSetting" CASCADE;`,
  `DROP TABLE IF EXISTS "Message" CASCADE;`,
  // Drop current schema tables in reverse FK order
  `DROP TABLE IF EXISTS "ChatMessage" CASCADE;`,
  `DROP TABLE IF EXISTS "Chat" CASCADE;`,
  `DROP TABLE IF EXISTS "CartItem" CASCADE;`,
  `DROP TABLE IF EXISTS "Watchlist" CASCADE;`,
  `DROP TABLE IF EXISTS "Notification" CASCADE;`,
  `DROP TABLE IF EXISTS "Transaction" CASCADE;`,
  `DROP TABLE IF EXISTS "Bid" CASCADE;`,
  `DROP TABLE IF EXISTS "Auction" CASCADE;`,
  `DROP TABLE IF EXISTS "Session" CASCADE;`,
  `DROP TABLE IF EXISTS "SystemSetting" CASCADE;`,
  `DROP TABLE IF EXISTS "User" CASCADE;`,
  // Drop enums last
  `DROP TYPE IF EXISTS "PaymentStatus";`,
  `DROP TYPE IF EXISTS "AuctionStatus";`,
  `DROP TYPE IF EXISTS "UserRole";`,
];

const STATEMENTS = [
  // ===== ENUMS =====
  `DO $$ BEGIN
     CREATE TYPE "UserRole" AS ENUM ('BUYER','SELLER','BOTH','ADMIN','SUPER_ADMIN');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  `DO $$ BEGIN
     CREATE TYPE "AuctionStatus" AS ENUM ('DRAFT','ACTIVE','PAYMENT_PENDING','COMPLETED','CANCELLED','EXPIRED');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  `DO $$ BEGIN
     CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','PAID','FAILED','REFUNDED');
   EXCEPTION WHEN duplicate_object THEN null; END $$;`,

  // ===== User =====
  `CREATE TABLE IF NOT EXISTS "User" (
     "id" TEXT PRIMARY KEY,
     "username" TEXT UNIQUE NOT NULL,
     "email" TEXT UNIQUE NOT NULL,
     "passwordHash" TEXT NOT NULL,
     "fullName" TEXT,
     "phone" TEXT,
     "role" "UserRole" NOT NULL DEFAULT 'BOTH',
     "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,

  // ===== Session =====
  `CREATE TABLE IF NOT EXISTS "Session" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
     "token" TEXT UNIQUE NOT NULL,
     "expiresAt" TIMESTAMP(3) NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");`,
  `CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");`,

  // ===== Auction (v33 with biddingDurationDays, firstBidAt) =====
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
     "biddingDurationDays" INTEGER,
     "firstBidAt" TIMESTAMP(3),
     "winnerId" TEXT,
     "secondWinnerId" TEXT,
     "viewCount" INTEGER NOT NULL DEFAULT 0,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Auction_status_endsAt_idx" ON "Auction"("status","endsAt");`,
  `CREATE INDEX IF NOT EXISTS "Auction_category_city_idx" ON "Auction"("category","city");`,
  `CREATE INDEX IF NOT EXISTS "Auction_sellerId_idx" ON "Auction"("sellerId");`,

  // ===== Bid (v33: placedAt, isSecond) =====
  `CREATE TABLE IF NOT EXISTS "Bid" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "bidderId" TEXT NOT NULL REFERENCES "User"("id"),
     "amount" DECIMAL(12,2) NOT NULL,
     "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "isWinning" BOOLEAN NOT NULL DEFAULT false,
     "isSecond" BOOLEAN NOT NULL DEFAULT false
   );`,
  `CREATE INDEX IF NOT EXISTS "Bid_auctionId_amount_idx" ON "Bid"("auctionId","amount");`,
  `CREATE INDEX IF NOT EXISTS "Bid_bidderId_idx" ON "Bid"("bidderId");`,

  // ===== Transaction (v33: finalAmount, commissionRate, etc.) =====
  `CREATE TABLE IF NOT EXISTS "Transaction" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT UNIQUE NOT NULL REFERENCES "Auction"("id"),
     "buyerId" TEXT NOT NULL REFERENCES "User"("id"),
     "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
     "finalAmount" DECIMAL(12,2) NOT NULL,
     "commissionRate" DECIMAL(4,2) NOT NULL DEFAULT 0.20,
     "commissionAmt" DECIMAL(12,2) NOT NULL,
     "buyerPaid" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
     "sellerPaid" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
     "buyerPaidAt" TIMESTAMP(3),
     "sellerPaidAt" TIMESTAMP(3),
     "contactUnlocked" BOOLEAN NOT NULL DEFAULT false,
     "completedAt" TIMESTAMP(3),
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,

  // ===== Notification (v33: type/message/data/read) =====
  `CREATE TABLE IF NOT EXISTS "Notification" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
     "type" TEXT NOT NULL,
     "message" TEXT NOT NULL,
     "data" JSONB,
     "read" BOOLEAN NOT NULL DEFAULT false,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId","read");`,

  // ===== Watchlist =====
  `CREATE TABLE IF NOT EXISTS "Watchlist" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Watchlist_userId_auctionId_key" ON "Watchlist"("userId","auctionId");`,
  `CREATE INDEX IF NOT EXISTS "Watchlist_userId_idx" ON "Watchlist"("userId");`,

  // ===== CartItem (v33 NEW) =====
  `CREATE TABLE IF NOT EXISTS "CartItem" (
     "id" TEXT PRIMARY KEY,
     "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_userId_auctionId_key" ON "CartItem"("userId","auctionId");`,
  `CREATE INDEX IF NOT EXISTS "CartItem_userId_idx" ON "CartItem"("userId");`,

  // ===== Chat =====
  `CREATE TABLE IF NOT EXISTS "Chat" (
     "id" TEXT PRIMARY KEY,
     "auctionId" TEXT NOT NULL REFERENCES "Auction"("id") ON DELETE CASCADE,
     "buyerId" TEXT NOT NULL REFERENCES "User"("id"),
     "sellerId" TEXT NOT NULL REFERENCES "User"("id"),
     "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "lastMessage" TEXT,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Chat_auctionId_buyerId_sellerId_key" ON "Chat"("auctionId","buyerId","sellerId");`,
  `CREATE INDEX IF NOT EXISTS "Chat_buyerId_lastMessageAt_idx" ON "Chat"("buyerId","lastMessageAt");`,
  `CREATE INDEX IF NOT EXISTS "Chat_sellerId_lastMessageAt_idx" ON "Chat"("sellerId","lastMessageAt");`,

  // ===== ChatMessage =====
  `CREATE TABLE IF NOT EXISTS "ChatMessage" (
     "id" TEXT PRIMARY KEY,
     "chatId" TEXT NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
     "senderId" TEXT NOT NULL REFERENCES "User"("id"),
     "text" TEXT NOT NULL,
     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
     "readAt" TIMESTAMP(3)
   );`,
  `CREATE INDEX IF NOT EXISTS "ChatMessage_chatId_createdAt_idx" ON "ChatMessage"("chatId","createdAt");`,

  // ===== SystemSetting =====
  `CREATE TABLE IF NOT EXISTS "SystemSetting" (
     "key" TEXT PRIMARY KEY,
     "value" TEXT NOT NULL,
     "updatedBy" TEXT,
     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
   );`,
  `CREATE INDEX IF NOT EXISTS "SystemSetting_key_idx" ON "SystemSetting"("key");`,
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, 'https://x');
  const dropFirst = url.searchParams.get('drop') === '1' || req.query?.drop === '1';
  const debugMode = url.searchParams.get('debug') === '1' || req.query?.debug === '1';

  if (debugMode) {
    try {
      const cols = await prisma.$queryRawUnsafe(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'User' ORDER BY ordinal_position;
      `);
      const tables = await prisma.$queryRawUnsafe(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name;
      `);
      const enums = await prisma.$queryRawUnsafe(`
        SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
        FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
        GROUP BY t.typname ORDER BY t.typname;
      `);
      return res.status(200).json({
        mode: 'debug',
        userColumns: cols,
        allTables: tables,
        allEnums: enums,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

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
