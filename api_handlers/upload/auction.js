// POST /api/upload/auction — upload images (to imgBB) + create auction in one shot
// Form mode:
//   - condition: 'New'  → cart-only, no bidding fields
//   - condition: 'Used' + listingType: 'BID'   → bidding (basePrice + bidIncrement + biddingDurationDays)
//   - condition: 'Used' + listingType: 'FIXED' → cart-only (fixed price, no bidding)
// Location: city = District, area = Area/Thana (BD 64-district cascade)
import { prisma } from '../_lib/prisma.js';
import { uploadToImgBB } from '../_lib/imgbb.js';
import { withCors, withAuth, json, error } from '../_lib/middleware.js';
import { BD_LOCATIONS, getThanas } from '../_lib/bdLocations.js';

const CATEGORIES = ['Electronics', 'Furniture', 'Clothing', 'Vehicles', 'Books', 'Sports', 'Home Appliances', 'Other'];
const VALID_LISTING_TYPES = ['BID', 'FIXED'];
const VALID_CONDITIONS = ['New', 'Used'];

export default withCors(withAuth(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    const {
      title, description, category, condition, listingType,
      basePrice, bidIncrement, biddingDurationDays,
      city, area, images
    } = req.body || {};

    // Required base fields
    if (!title || !description || !basePrice || !city || !area) {
      return error(res, 400, 'title, description, basePrice, city, area required');
    }
    if (!category || !CATEGORIES.includes(category)) return error(res, 400, 'Invalid category');
    if (!condition || !VALID_CONDITIONS.includes(condition)) return error(res, 400, 'Invalid condition (must be New or Used)');

    // Location validation: city is a BD district, area is a thana within that district
    if (!BD_LOCATIONS[city]) return error(res, 400, `Invalid district: ${city}. Pick from BD 64-district list.`);
    const validThanas = getThanas(city);
    if (!validThanas.includes(area)) return error(res, 400, `Invalid area: ${area}. Pick a thana within district ${city}.`);

    // Listing type
    let lType = listingType || 'FIXED';  // default FIXED = cart-only
    if (!VALID_LISTING_TYPES.includes(lType)) return error(res, 400, `Invalid listingType: ${lType} (BID or FIXED)`);
    // New items are always FIXED (no bidding). Force override.
    if (condition === 'New') lType = 'FIXED';

    // Base price
    const basePriceNum = Number(basePrice);
    if (isNaN(basePriceNum) || basePriceNum < 100) {
      return error(res, 400, 'Base price must be at least 100 BDT');
    }

    // Bidding fields: only required for Used+BID
    let bidInc = null;
    let durationDays = null;
    let endsAt = null;
    if (condition === 'Used' && lType === 'BID') {
      bidInc = Number(bidIncrement) || 100;
      if (bidInc < 50) return error(res, 400, 'Bid increment must be at least 50 BDT');
      durationDays = parseInt(biddingDurationDays, 10);
      if (!durationDays || durationDays < 2 || durationDays > 7) {
        return error(res, 400, 'Bidding duration must be 2-7 days for Used+BID items');
      }
      // Set initial endsAt to 48h from now — but endsAt is recomputed on first bid
      // (firstBidAt + durationDays). Setting it to 48h gives a sane fallback for the
      // 48h-after-posting contract if no bid arrives.
      endsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    } else {
      // Cart-only (New or Used+FIXED): 30-day expiration
      endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    // Upload images to imgBB (client sends base64 data URIs) — extract URL string only
    const list = Array.isArray(images) ? images : (images ? [images] : []);
    const uploaded = [];
    for (const dataUri of list.slice(0, 5)) {
      try {
        const result = await uploadToImgBB(dataUri);
        const url = typeof result === 'string' ? result : result?.url;
        if (url) uploaded.push(url);
      }
      catch (e) { console.error('[imgBB upload]', e); }
    }

    const auction = await prisma.auction.create({
      data: {
        sellerId: req.userId,
        title, description, images: uploaded, category,
        condition,
        listingType: lType,
        basePrice: basePriceNum,
        bidIncrement: bidInc,           // null for cart-only
        biddingDurationDays: durationDays,  // null for cart-only
        city, area,
        endsAt,
      },
      include: {
        seller: { select: { username: true, rating: true } },
        _count: { select: { bids: true } },
      },
    });

    return json(res, 201, { auction });
  } catch (err) {
    console.error('[upload/auction]', err);
    return error(res, 500, err.message || 'Failed to create auction');
  }
}));
