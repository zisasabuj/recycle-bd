// GET /api/auctions/meta/categories
import { withCors, json } from '../../../_lib/middleware.js';

const CATEGORIES = ['Electronics', 'Computer', 'Furniture', 'Cookeries', 'Vehicles', 'Sports', 'Home Appliances', 'Other'];

export default withCors(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  return json(res, 200, { categories: CATEGORIES });
});