// GET /api/auctions/meta/cities — major BD cities + urban areas (for product listing form)
// INLINE: Vercel esbuild cache sometimes drops newly-added exports from the
// shared bdLocations.js. To avoid the import-error, we duplicate the city
// data inline here. If the import is fixed in the future, switch back to
// importing from '../../../_lib/bdLocations.js'.
import { withCors, json } from '../../../_lib/middleware.js';

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
const BD_CITY_NAMES = Object.keys(BD_CITIES).sort();

export default withCors(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  return json(res, 200, {
    cities: BD_CITY_NAMES,
    locations: BD_CITIES,
    stats: {
      totalCities: BD_CITY_NAMES.length,
      totalAreas: Object.values(BD_CITIES).reduce((s, a) => s + a.length, 0),
    },
  });
});
