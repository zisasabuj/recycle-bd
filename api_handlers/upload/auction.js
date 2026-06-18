// POST /api/upload/auction — upload images (to imgBB) + create auction in one shot
import { prisma } from '../_lib/prisma.js';
import { uploadBase64 } from '../_lib/imgbb.js';
import { withCors, withAuth, json, error } from '../_lib/middleware.js';
import { BD_LOCATIONS, getThanas } from '../_lib/bdLocations.js';

const LOCATIONS = {
  Dhaka: ['Dhanmondi', 'Mohammadpur', 'Mirpur', 'Uttara', 'Gulshan', 'Banani', 'Bashundhara', 'Old Dhaka', 'Tejgaon', 'Ramna'],
  Chittagong: ['Agrabad', 'Panchlaish', 'Khulshi', 'Halishahar', 'Nasirabad'],
  Sylhet: ['Zindabazar', 'Ambarkhana', 'Akhalia', 'Shahporan'],
  Khulna: ['Sonadanga', 'Khalishpur', 'Daulatpur'],
  Rajshahi: ['Shaheb Bazar', 'Boalia', 'Motihar'],
};
const CATEGORIES = ['Electronics', 'Furniture', 'Clothing', 'Vehicles', 'Books', 'Sports', 'Home Appliances', 'Other'];

export default withCors(withAuth(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    const {
      title, description, category, condition, basePrice, bidIncrement,
      city, area, district, thana, images
    } = req.body || {};

    if (!title || !description || !basePrice || !city || !area) {
      return error(res, 400, 'title, description, basePrice, city, area required');
    }
    const basePriceNum = Number(basePrice);
    if (isNaN(basePriceNum) || basePriceNum < 100) {
      return error(res, 400, 'Base price must be at least 100 BDT');
    }
    if (!LOCATIONS[city] || !LOCATIONS[city].includes(area)) {
      return error(res, 400, 'Invalid location. Only city/area allowed, no street addresses.');
    }
    if (!CATEGORIES.includes(category)) return error(res, 400, 'Invalid category');
    if (district && !BD_LOCATIONS[district]) return error(res, 400, `Invalid district: ${district}`);
    if (thana && (!district || !getThanas(district).includes(thana))) {
      return error(res, 400, `Invalid thana: ${thana}`);
    }

    // Upload images to imgBB (client sends base64 data URIs)
    const list = Array.isArray(images) ? images : (images ? [images] : []);
    const uploaded = [];
    for (const dataUri of list.slice(0, 5)) {
      try { uploaded.push(await uploadBase64(dataUri)); }
      catch (e) { console.error('[imgBB upload]', e); }
    }

    const endsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const auction = await prisma.auction.create({
      data: {
        sellerId: req.userId,
        title, description, images: uploaded, category,
        condition: condition || 'Used',
        basePrice: basePriceNum,
        bidIncrement: Number(bidIncrement) || 100,
        city, area,
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
    console.error('[upload/auction]', err);
    return error(res, 500, err.message || 'Failed to create auction');
  }
}));