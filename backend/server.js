import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './lib/prisma.js';
import { auctionHandler } from './sockets/auctionHandler.js';
import { startTimerWorker, scheduleAuctionEnd, lazyExpireAuctions } from './workers/auctionTimer.js';
import authRoutes from './routes/auth.js';
import auctionRoutes from './routes/auctions.js';
import paymentRoutes from './routes/payments.js';
import uploadRoutes from './routes/upload.js';
import watchlistRoutes from './routes/watchlist.js';
import chatRoutes from './routes/chats.js';
import adminRoutes from './routes/admin.js';
import { UPLOADS_ABSOLUTE_DIR } from './lib/upload.js';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '../frontend');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(UPLOADS_ABSOLUTE_DIR));

// Make io accessible in routes
app.set('io', io);

// Lazy expiry middleware: process any ACTIVE auctions whose endsAt has passed
// Runs on every API request (fire-and-forget), recovers from server restarts
app.use('/api', (req, res, next) => {
  lazyExpireAuctions(io).catch(() => {});
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/settings', adminRoutes);
app.use('/api/admin/settings', adminRoutes);

// Socket.IO: track user rooms for chat
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  socket.on('register', (userId) => {
    if (userId) socket.join(`user:${userId}`);
  });
  socket.on('join_chat', (chatId) => {
    if (chatId) socket.join(`chat:${chatId}`);
  });
  auctionHandler(io, socket);
  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// Start timer worker
startTimerWorker(io);

// On startup, schedule timers for any active auctions that don't have one
async function rescheduleActiveAuctions() {
  try {
    const active = await prisma.auction.findMany({
      where: { status: 'ACTIVE', endsAt: { gt: new Date() } },
      select: { id: true, endsAt: true }
    });
    console.log(`[Startup] Found ${active.length} active auctions`);
    for (const a of active) {
      await scheduleAuctionEnd(a.id, a.endsAt);
    }
  } catch (err) {
    console.error('[Startup] reschedule error:', err.message);
  }
}
rescheduleActiveAuctions();

// Serve frontend static files (so backend can serve both API + frontend on single port for tunneling)
app.use(express.static(FRONTEND_DIR, { maxAge: '5m', etag: true }));
// SPA fallback — any non-API GET serves index.html (lets deep links work via tunnels)
app.get(/^\/(?!api|uploads|socket\.io|health).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`   Frontend + API served from same origin (tunnel-ready)`);
  console.log(`   Health: http://localhost:${PORT}/health\n`);
});
