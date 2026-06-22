// GET /api/auctions/meta/cities — major BD cities + urban areas (for product listing form)
// INLINE: imports bdLocations.js, but keep a local fallback in case the import fails
// (Vercel esbuild cache can occasionally drop newly-added exports).
import { BD_CITIES, BD_CITY_NAMES, getAreas } from '../../../_lib/bdLocations.js';
import { withCors, json } from '../../../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  // Local fallback — used only if imports fail (Vercel build-cache edge cases)
  const FALLBACK = {
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

  // Use imported values if available, else fallback
  const cities = (BD_CITY_NAMES && BD_CITY_NAMES.length) ? BD_CITY_NAMES : Object.keys(FALLBACK).sort();
  const locations = (BD_CITIES && Object.keys(BD_CITIES).length) ? BD_CITIES : FALLBACK;

  return json(res, 200, {
    cities,
    locations,
    stats: {
      totalCities: cities.length,
      totalAreas: Object.values(locations).reduce((s, a) => s + a.length, 0),
    },
  });
});
