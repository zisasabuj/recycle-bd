// GET /api/auctions/meta/locations
import { withCors, json } from '../../../_lib/middleware.js';

const LOCATIONS = {
  Dhaka: ['Dhanmondi', 'Mohammadpur', 'Mirpur', 'Uttara', 'Gulshan', 'Banani', 'Bashundhara', 'Old Dhaka', 'Tejgaon', 'Ramna'],
  Chittagong: ['Agrabad', 'Panchlaish', 'Khulshi', 'Halishahar', 'Nasirabad'],
  Sylhet: ['Zindabazar', 'Ambarkhana', 'Akhalia', 'Shahporan'],
  Khulna: ['Sonadanga', 'Khalishpur', 'Daulatpur'],
  Rajshahi: ['Shaheb Bazar', 'Boalia', 'Motihar'],
};

export default withCors(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  return json(res, 200, { locations: LOCATIONS });
});