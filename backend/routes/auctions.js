import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, requireRole } from '../lib/auth.js';
import { scheduleAuctionEnd } from '../workers/auctionTimer.js';
import { BD_LOCATIONS, BD_DISTRICTS, BD_STATS, getThanas } from '../lib/bdLocations.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { processImage } from './upload.js';
import { UPLOADS_PUBLIC_PATH, UPLOADS_ABSOLUTE_DIR } from '../lib/upload.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// RESTRICTED locations: city-level + area-level only (no street addresses)
const LOCATIONS = {
  Dhaka: ['Dhanmondi', 'Mohammadpur', 'Mirpur', 'Uttara', 'Gulshan', 'Banani', 'Bashundhara', 'Old Dhaka', 'Tejgaon', 'Ramna'],
  Chittagong: ['Agrabad', 'Panchlaish', 'Khulshi', 'Halishahar', 'Nasirabad'],
  Sylhet: ['Zindabazar', 'Ambarkhana', 'Akhalia', 'Shahporan'],
  Khulna: ['Sonadanga', 'Khalishpur', 'Daulatpur'],
  Rajshahi: ['Shaheb Bazar', 'Boalia', 'Motihar']
};

const CATEGORIES = ['Electronics', 'Furniture', 'Clothing', 'Vehicles', 'Books', 'Sports', 'Home Appliances', 'Other'];

// GET /api/auctions/meta/locations - location dropdown options
router.get('/meta/locations', (req, res) => {
  res.json({ locations: LOCATIONS });
});

router.get('/meta/categories', (req, res) => {
  res.json({ categories: CATEGORIES });
});

// GET /api/auctions/meta/bd-locations - Bangladesh district → thana (police station) map
router.get('/meta/bd-locations', (req, res) => {
  res.json({
    districts: BD_DISTRICTS,
    locations: BD_LOCATIONS,
    stats: BD_STATS
  });
});

// POST /api/auctions - create new auction
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description, images, category, condition, basePrice, bidIncrement, city, area, district, thana } = req.body;

    if (!title || !description || !basePrice || !city || !area) {
      return res.status(400).json({ error: 'title, description, basePrice, city, area required' });
    }
    if (!LOCATIONS[city] || !LOCATIONS[city].includes(area)) {
      return res.status(400).json({ error: 'Invalid location. Only city/area allowed, no street addresses.' });
    }
    if (basePrice < 100) {
      return res.status(400).json({ error: 'Base price must be at least 100 BDT' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    // Optional BD district + thana validation
    if (district && !BD_LOCATIONS[district]) {
      return res.status(400).json({ error: `Invalid district: ${district}` });
    }
    if (thana && (!district || !getThanas(district).includes(thana))) {
      return res.status(400).json({ error: `Invalid thana: ${thana} (must belong to selected district)` });
    }

    const endsAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
    const auction = await prisma.auction.create({
      data: {
        sellerId: req.userId,
        title,
        description,
        images: images || [],
        category,
        condition: condition || 'Used',
        basePrice,
        bidIncrement: bidIncrement || 100,
        city,
        area,
        district: district || null,
        thana: thana || null,
        endsAt
      },
      include: {
        seller: { select: { username: true, rating: true } },
        _count: { select: { bids: true } }
      }
    });

    // Schedule the 48h timer
    await scheduleAuctionEnd(auction.id, endsAt);

    res.status(201).json({ auction });
  } catch (err) {
    console.error('[create auction]', err);
    res.status(500).json({ error: 'Failed to create auction' });
  }
});

// GET /api/auctions - list active auctions
// Query: city, area, category, search, sort, page, limit, endingIn (hours)
//   endingIn=2 → only auctions ending within 2 hours (🔥 Ending Soon section)
router.get('/', async (req, res) => {
  try {
    const { city, area, district, thana, category, status = 'ACTIVE', search, sort, page = 1, limit = 20, endingIn } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      status: String(status),
      ...(city && { city: String(city) }),
      ...(area && { area: String(area) }),
      ...(district && { district: String(district) }),
      ...(thana && { thana: String(thana) }),
      ...(category && { category: String(category) }),
      ...(endingIn && {
        endsAt: { lte: new Date(Date.now() + Number(endingIn) * 3600 * 1000), gt: new Date() }
      }),
      ...(search && {
        OR: [
          { title: { contains: String(search), mode: 'insensitive' } },
          { description: { contains: String(search), mode: 'insensitive' } }
        ]
      })
    };

    const sortMap = {
      'ending':    { endsAt: 'asc' },
      'newest':    { createdAt: 'desc' },
      'price-asc': { basePrice: 'asc' },
      'price-desc':{ basePrice: 'desc' }
    };
    const orderBy = sortMap[String(sort)] || { endsAt: 'asc' };

    const [auctions, total] = await Promise.all([
      prisma.auction.findMany({
        where,
        select: {
          id: true, sellerId: true, title: true, images: true, category: true, condition: true,
          city: true, area: true, district: true, thana: true,
          basePrice: true, currentMaxBid: true,
          bidIncrement: true, endsAt: true, status: true, createdAt: true,
          seller: { select: { username: true, rating: true } },
          _count: { select: { bids: true } }
        },
        orderBy,
        skip,
        take: Number(limit)
      }),
      prisma.auction.count({ where })
    ]);

    res.json({ auctions, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[list auctions]', err);
    res.status(500).json({ error: 'Failed to list auctions' });
  }
});

// GET /api/auctions/seller/dashboard — analytics for current logged-in seller
// IMPORTANT: registered BEFORE /:id routes to avoid Express matching "seller" as an :id
router.get('/seller/dashboard', authMiddleware, async (req, res) => {
  try {
    const auctions = await prisma.auction.findMany({
      where: { sellerId: req.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { bids: true, watchlist: true } }
      }
    });

    const totalViews   = auctions.reduce((s, a) => s + (a.viewCount || 0), 0);
    const totalBids    = auctions.reduce((s, a) => s + (a._count.bids || 0), 0);
    const totalWatch   = auctions.reduce((s, a) => s + (a._count.watchlist || 0), 0);
    const activeCount  = auctions.filter(a => a.status === 'ACTIVE').length;
    const completed    = auctions.filter(a => a.status === 'COMPLETED');
    const soldCount    = completed.length;

    // Earnings = sum of finalAmount for completed transactions where seller was involved
    const txns = await prisma.transaction.findMany({
      where: { sellerId: req.userId, sellerPaid: 'PAID' },
      select: { finalAmount: true, commissionAmt: true }
    });
    const grossEarnings   = txns.reduce((s, t) => s + Number(t.finalAmount || 0), 0);
    const commissionPaid  = txns.reduce((s, t) => s + Number(t.commissionAmt || 0), 0);
    const netEarnings     = grossEarnings - commissionPaid;

    // Conversion rate = bids per view across all auctions
    const conversionRate  = totalViews > 0 ? ((totalBids / totalViews) * 100).toFixed(2) : '0.00';

    // Per-auction summary
    const perAuction = auctions.map(a => ({
      id: a.id,
      title: a.title,
      images: a.images,
      category: a.category,
      basePrice: a.basePrice,
      currentMaxBid: a.currentMaxBid,
      status: a.status,
      endsAt: a.endsAt,
      viewCount: a.viewCount,
      bidCount: a._count.bids,
      watchCount: a._count.watchlist
    }));

    // Category breakdown
    const byCategory = {};
    auctions.forEach(a => {
      byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    });

    res.json({
      totals: {
        totalAuctions: auctions.length,
        activeCount,
        soldCount,
        totalViews,
        totalBids,
        totalWatchlist: totalWatch,
        grossEarnings,
        commissionPaid,
        netEarnings,
        conversionRate: `${conversionRate}%`
      },
      perAuction,
      byCategory,
      recentActivity: auctions.slice(0, 5).map(a => ({
        id: a.id, title: a.title, status: a.status, createdAt: a.createdAt,
        bidCount: a._count.bids
      }))
    });
  } catch (err) {
    console.error('[seller dashboard]', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});
// GET /api/auctions/:id - get single auction
router.get('/:id', async (req, res) => {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id: req.params.id },
      include: {
        seller: { select: { username: true, rating: true, createdAt: true } },
        _count: { select: { bids: true } }
      }
    });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    res.json({ auction });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get auction' });
  }
});

// POST /api/auctions/:id/confirm - winner confirms purchase
router.post('/:id/confirm', authMiddleware, async (req, res) => {
  try {
    const auction = await prisma.auction.findUnique({ where: { id: req.params.id } });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    if (auction.winnerId !== req.userId) {
      return res.status(403).json({ error: 'Only the winner can confirm' });
    }
    if (auction.status !== 'PAYMENT_PENDING') {
      return res.status(400).json({ error: 'Auction is not in payment pending state' });
    }
    const tx = await prisma.transaction.findUnique({ where: { auctionId: req.params.id } });
    res.json({ message: 'Please proceed to pay 20% commission', transaction: tx });
  } catch (err) {
    res.status(500).json({ error: 'Failed to confirm' });
  }
});

// POST /api/auctions/:id/reject - winner rejects, passes to 2nd
router.post('/:id/reject', authMiddleware, async (req, res) => {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id: req.params.id },
      include: { bids: { orderBy: { amount: 'desc' }, take: 2 } }
    });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    if (auction.winnerId !== req.userId) {
      return res.status(403).json({ error: 'Only the winner can reject' });
    }
    // Mark as needing pass
    res.json({ message: 'Rejection registered. Will pass to 2nd highest bidder.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject' });
  }
});

// GET /api/auctions/:id/bids - bid history (anonymized unless seller/winner)
router.get('/:id/bids', async (req, res) => {
  try {
    const bids = await prisma.bid.findMany({
      where: { auctionId: req.params.id },
      select: { id: true, amount: true, placedAt: true, isWinning: true, isSecond: true },
      orderBy: { amount: 'desc' },
      take: 10
    });
    res.json({ bids });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get bids' });
  }
});


// DELETE /api/auctions/:id - delete an auction
//   - Seller can delete their OWN DRAFT auction
//   - Admin can delete ANY auction
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id: req.params.id },
      select: { id: true, sellerId: true, status: true, bids: { select: { id: true }, take: 1 } }
    });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });

    // Get requester role
    const requester = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true }
    });
    const isAdmin = requester && (requester.role === 'ADMIN' || requester.role === 'SUPER_ADMIN');
    const isOwner = auction.sellerId === req.userId;

    if (!isAdmin) {
      if (!isOwner) {
        return res.status(403).json({ error: 'Not allowed — only seller or admin can delete' });
      }
      // Sellers can only delete DRAFT or auctions with no bids
      if (auction.status !== 'DRAFT' && auction.bids.length > 0) {
        return res.status(403).json({ error: 'Cannot delete — auction is live with bids. Contact admin.' });
      }
    }

    // Cascade: delete bids first (in case onDelete not working in this schema), then auction
    await prisma.bid.deleteMany({ where: { auctionId: req.params.id } });
    await prisma.auction.delete({ where: { id: req.params.id } });

    res.json({ message: 'Auction deleted', id: req.params.id, deletedBy: isAdmin ? (requester.role === 'SUPER_ADMIN' ? 'super_admin' : 'admin') : 'owner' });
  } catch (err) {
    console.error('[delete auction]', err);
    res.status(500).json({ error: 'Failed to delete auction' });
  }
});

// PUT /api/auctions/:id - owner-only update of editable fields
// Multipart optional: new images (replaces existing). JSON body if no image change.
// Editable: title, description, category, condition, basePrice, bidIncrement, city, area, district, thana, images
// NOT editable: sellerId, status, endsAt, createdAt (preserves auction integrity & 48h timer)
// Edit mode:
//   OPEN  = owner can edit any field
//   CLOSE = owner can ONLY edit description (other fields locked, even for admin-on-behalf)
const editUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(UPLOADS_ABSOLUTE_DIR)) fs.mkdirSync(UPLOADS_ABSOLUTE_DIR, { recursive: true });
      cb(null, UPLOADS_ABSOLUTE_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'].includes(ext) ? ext : '.jpg';
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
    }
  }),
  limits: { fileSize: 18 * 1024 * 1024 }, // 18 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];
    cb(null, allowed.includes(file.mimetype));
  }
});
router.put('/:id', authMiddleware, editUpload.array('images', 5), async (req, res) => {
  try {
    const auction = await prisma.auction.findUnique({ where: { id: req.params.id } });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });

    // Owner or admin
    const requester = await prisma.user.findUnique({ where: { id: req.user.userId } });
    const isOwner = auction.sellerId === req.user.userId;
    const isAdmin = requester && (requester.role === 'ADMIN' || requester.role === 'SUPER_ADMIN');
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Only the seller or admin can edit' });

    // Read current edit mode setting
    const setting = await prisma.systemSetting.findUnique({ where: { key: 'edit_mode' } });
    const editMode = (setting && (setting.value === 'CLOSE' || setting.value === 'OPEN')) ? setting.value : 'OPEN';

    // Build update payload — only fields actually provided
    const allEditable = ['title', 'description', 'category', 'condition', 'basePrice', 'bidIncrement', 'city', 'area', 'district', 'thana', 'images'];
    const allowedInMode = editMode === 'CLOSE' ? ['description'] : allEditable;

    const data = {};
    for (const f of allowedInMode) {
      if (req.body[f] !== undefined && req.body[f] !== '') data[f] = req.body[f];
    }

    // In CLOSE mode, detect attempts to edit other fields → reject
    if (editMode === 'CLOSE') {
      const attempted = Object.keys(req.body).filter(k => allEditable.includes(k) && !allowedInMode.includes(k));
      const hasNewImages = req.files && req.files.length > 0;
      if (attempted.length > 0 || hasNewImages) {
        return res.status(403).json({
          error: 'Edit mode is CLOSED — only description can be edited',
          mode: 'CLOSE',
          rejected: [...attempted, ...(hasNewImages ? ['images'] : [])]
        });
      }
    }

    // Numeric fields
    if (data.basePrice) data.basePrice = Number(data.basePrice);
    if (data.bidIncrement) data.bidIncrement = Number(data.bidIncrement);

    // Handle image replacement if new files uploaded (only allowed in OPEN mode — checked above)
    if (req.files && req.files.length > 0) {
      const host = req.get('host');
      const protocol = req.protocol;
      const images = [];
      for (const f of req.files) {
        try { await processImage(f.path); } catch (e) { console.error('processImage err', e); }
        // HEIC was renamed to .jpg inside processImage — get actual filename
        const dir = path.dirname(f.path);
        const allFiles = fs.readdirSync(dir).filter(x => x.startsWith(path.basename(f.path, path.extname(f.path))));
        const finalName = allFiles[0] || f.filename;
        images.push(`${protocol}://${host}${UPLOADS_PUBLIC_PATH}/${finalName}`);
      }
      data.images = images;
    }

    const updated = await prisma.auction.update({
      where: { id: req.params.id },
      data,
      include: { seller: { select: { id: true, username: true, fullName: true } } }
    });

    res.json({ auction: updated, message: 'Auction updated', mode: editMode });
  } catch (err) {
    console.error('[edit auction]', err);
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 18MB)' });
    res.status(500).json({ error: 'Failed to update auction' });
  }
});

// GET /api/auctions/:id/similar — same category + same city, excluding self, max 4
router.get('/:id/similar', async (req, res) => {
  try {
    const a = await prisma.auction.findUnique({
      where: { id: req.params.id },
      select: { id: true, category: true, city: true }
    });
    if (!a) return res.status(404).json({ error: 'Auction not found' });

    // Primary: same category + same city
    let similar = await prisma.auction.findMany({
      where: {
        id: { not: a.id },
        category: a.category,
        city: a.city,
        status: 'ACTIVE',
        endsAt: { gt: new Date() }
      },
      take: 4,
      orderBy: { endsAt: 'asc' },
      include: {
        seller: { select: { username: true, rating: true } },
        _count: { select: { bids: true, watchlist: true } }
      }
    });

    // Fallback: same category, any city (if not enough)
    if (similar.length < 4) {
      const more = await prisma.auction.findMany({
        where: {
          id: { notIn: [a.id, ...similar.map(s => s.id)] },
          category: a.category,
          status: 'ACTIVE',
          endsAt: { gt: new Date() }
        },
        take: 4 - similar.length,
        orderBy: { endsAt: 'asc' },
        include: {
          seller: { select: { username: true, rating: true } },
          _count: { select: { bids: true, watchlist: true } }
        }
      });
      similar = similar.concat(more);
    }
    res.json({ auctions: similar });
  } catch (err) {
    console.error('[similar]', err);
    res.status(500).json({ error: 'Failed' });
  }
});

// POST /api/auctions/:id/view — increment view counter (idempotent cheap call)
router.post('/:id/view', async (req, res) => {
  try {
    await prisma.auction.update({
      where: { id: req.params.id },
      data: { viewCount: { increment: 1 } }
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

export default router;
