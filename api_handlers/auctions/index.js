// /api/auctions — GET (list) + POST (create)
// Note: in serverless, we cannot use setTimeout for auction end timers.
// Instead, we store `endsAt` and a separate Vercel cron job (/api/cron/expire)
// runs every minute to process expired auctions.
import { prisma } from '../../_lib/prisma.js';
import { withCors, withAuth, json, error } from '../../_lib/middleware.js';
import { BD_LOCATIONS, getThanas } from '../../_lib/bdLocations.js';

const LOCATIONS = {
  Dhaka: ['Dhanmondi', 'Mohammadpur', 'Mirpur', 'Uttara', 'Gulshan', 'Banani', 'Bashundhara', 'Old Dhaka', 'Tejgaon', 'Ramna'],
  Chittagong: ['Agrabad', 'Panchlaish', 'Khulshi', 'Halishahar', 'Nasirabad'],
  Sylhet: ['Zindabazar', 'Ambarkhana', 'Akhalia', 'Shahporan'],
  Khulna: ['Sonadanga', 'Khalishpur', 'Daulatpur'],
  Rajshahi: ['Shaheb Bazar', 'Boalia', 'Motihar'],
};
const CATEGORIES = ['Electronics', 'Furniture', 'Clothing', 'Vehicles', 'Books', 'Sports', 'Home Appliances', 'Other'];

// Lazy expiry: when listing, also mark expired ACTIVE auctions as ENDED
// (replaces cron — Vercel Hobby plan has no cron jobs)
async function expireStaleAuctions() {
  try {
    const result = await prisma.auction.updateMany({
      where: { status: 'ACTIVE', endsAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    if (result.count > 0) console.log(`[expire] marked ${result.count} auctions EXPIRED`);
  } catch (e) {
    console.error('[expire] failed:', e.message);
  }
}

// GET handler — list active auctions (filters + sort + pagination)
async function handleList(req, res) {
  try {
    await expireStaleAuctions();
    const { city, area, district, thana, category, status = 'ACTIVE', search, sort, page = 1, limit = 20, endingIn } = req.query || {};
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      status: String(status),
      ...(city && { city: String(city) }),
      ...(area && { area: String(area) }),
      ...(district && { district: String(district) }),
      ...(thana && { thana: String(thana) }),
      ...(category && { category: String(category) }),
      ...(endingIn && {
        endsAt: {
          lte: new Date(Date.now() + Number(endingIn) * 3600 * 1000),
          gt: new Date(),
        },
      }),
      ...(search && {
        OR: [
          { title: { contains: String(search), mode: 'insensitive' } },
          { description: { contains: String(search), mode: 'insensitive' } },
        ],
      }),
    };

    const sortMap = {
      ending: { endsAt: 'asc' },
      newest: { createdAt: 'desc' },
      'price-asc': { basePrice: 'asc' },
      'price-desc': { basePrice: 'desc' },
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
          _count: { select: { bids: true } },
        },
        orderBy,
        skip,
        take: Number(limit),
      }),
      prisma.auction.count({ where }),
    ]);

    return json(res, 200, { auctions, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('[list auctions]', err);
    return error(res, 500, 'Failed to list auctions: ' + err.message);
  }
}

// POST handler — create new auction (auth required)
async function handleCreate(req, res) {
  try {
    const { title, description, images, category, condition, basePrice, bidIncrement, city, area, district, thana } = req.body || {};
    if (!title || !description || !basePrice || !city || !area) {
      return error(res, 400, 'title, description, basePrice, city, area required');
    }
    if (!LOCATIONS[city] || !LOCATIONS[city].includes(area)) {
      return error(res, 400, 'Invalid location. Only city/area allowed, no street addresses.');
    }
    if (basePrice < 100) return error(res, 400, 'Base price must be at least 100 BDT');
    if (!CATEGORIES.includes(category)) return error(res, 400, 'Invalid category');
    if (district && !BD_LOCATIONS[district]) {
      return error(res, 400, `Invalid district: ${district}`);
    }
    if (thana && (!district || !getThanas(district).includes(thana))) {
      return error(res, 400, `Invalid thana: ${thana} (must belong to selected district)`);
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
        endsAt,
      },
      include: {
        seller: { select: { username: true, rating: true } },
        _count: { select: { bids: true } },
      },
    });

    return json(res, 201, { auction });
  } catch (err) {
    console.error('[create auction]', err);
    return error(res, 500, 'Failed to create auction');
  }
}

// Export: list = no auth, create = auth required
// Vercel doesn't allow conditional default export, so we split via method
export default withCors(async (req, res) => {
  if (req.method === 'GET') return handleList(req, res);
  if (req.method === 'POST') {
    // Run auth middleware inline
    const { getUserFromHeader } = await import('../../_lib/auth.js');
    const payload = getUserFromHeader(req.headers.authorization);
    if (!payload) return error(res, 401, 'Missing or invalid Authorization header');
    req.userId = payload.userId;
    return handleCreate(req, res);
  }
  return error(res, 405, 'GET or POST only');
});