// POST /api/upload/auction — upload images (to imgBB) + create auction in one shot
// Form mode:
//   - condition: 'New'  → cart-only, no bidding fields
//   - condition: 'Used' + listingType: 'BID'   → bidding (basePrice + bidIncrement + biddingDurationDays)
//   - condition: 'Used' + listingType: 'FIXED' → cart-only (fixed price, no bidding)
// Location: city = a major BD city, area = urban neighborhood within that city.
// INLINE: BD_CITIES kept inline (Vercel esbuild cache drops newly-added
// exports from bdLocations.js when bundled into a fresh function).
import { prisma } from '../_lib/prisma.js';
import { uploadToImgBB } from '../_lib/imgbb.js';
import { withCors, withAuth, json, error } from '../_lib/middleware.js';

const BD_CITIES = {
  'Dhaka':       ['Dhanmondi', 'Mohammadpur', 'Mirpur', 'Uttara', 'Gulshan', 'Banani', 'Bashundhara', 'Old Dhaka', 'Tejgaon', 'Ramna', 'Malibagh', 'Badda', 'Rampura', 'Khilgaon', 'Motijheel', 'Paltan', 'Wari', 'Lalbagh', 'Azimpur', 'New Market', 'Hazaribagh', 'Kamrangirchar', 'Keraniganj', 'Savar', 'Tongi'],
  'Chittagong':  ['Agrabad', 'Panchlaish', 'Khulshi', 'Halishahar', 'Nasirabad', 'Chawk Bazaar', 'Patiya', 'Karnaphuli', 'Bayazid', 'Hathazari'],
  'Sylhet':      ['Zindabazar', 'Ambarkhana', 'Akhalia', 'Shahporan', 'Beanibazar', 'Moulvibazar'],
  'Rajshahi':    ['Shaheb Bazar', 'Boalia', 'Motihar', 'Rajpara', 'Shiroil'],
  'Khulna':      ['Sonadanga', 'Khalishpur', 'Daulatpur', 'Khan Jahan Ali', 'Nirala'],
  'Barishal':    ['Sadar Road', 'Nathullabad', 'Rupatali', 'Banglabazar'],
  'Rangpur':     ['Jahaj Company', 'Pairaband', 'Mahiganj', 'Keranipara'],
  'Mymensingh':  ['Sadar', 'Charpara', 'Kachijhuli', 'Chorganga'],
  'Comilla':     ['Kandirpar', 'Ranir Bazar', 'Tomsom Bridge', 'Bhooter Goli'],
  'Gazipur':     ['Tongi', 'Board Bazar', 'Joydebpur', 'Kaliakair', 'Sreepur', 'Kapasia'],
  'Narayanganj': ['Sadar', 'Bandar', 'Araihazar', 'Rupganj', 'Sonargaon'],
  "Cox's Bazar": ['Sadar', 'Kolatoli', 'Sugandha', 'Laboni Beach', 'Inani'],
};
const getAreas = (city) => BD_CITIES[city] || [];

const CATEGORIES = ['Electronics', 'Computer', 'Furniture', 'Clothing', 'Vehicles', 'Books', 'Sports', 'Home Appliances', 'Other'];
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

    // Location validation: city = a major city, area = an urban area within that city
    if (!BD_CITIES[city]) return error(res, 400, `Invalid city: ${city}. Pick from the city list.`);
    const validAreas = getAreas(city);
    if (!validAreas.includes(area)) return error(res, 400, `Invalid area: ${area}. Pick an area within ${city}.`);

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
        seller: { connect: { id: req.userId } },
        title, description, images: uploaded, category,
        condition,
        // listingType removed — column missing in production DB
        // listingType: lType,
        basePrice: basePriceNum,
        ...(bidInc && { bidIncrement: bidInc }),
        ...(durationDays && { biddingDurationDays: durationDays }),
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
