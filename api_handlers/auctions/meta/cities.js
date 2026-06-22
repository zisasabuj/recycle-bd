// GET /api/auctions/meta/cities — major BD cities + urban areas (for product listing form)
import { BD_CITIES, BD_CITY_NAMES } from '../../../_lib/bdLocations.js';
import { withCors, json } from '../../../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  return json(res, 200, {
    cities: BD_CITY_NAMES,
    locations: BD_CITIES,  // city → areas map
    stats: {
      totalCities: BD_CITY_NAMES.length,
      totalAreas: Object.values(BD_CITIES).reduce((s, a) => s + a.length, 0),
    },
  });
});
