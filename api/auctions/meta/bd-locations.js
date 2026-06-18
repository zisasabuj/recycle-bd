// GET /api/auctions/meta/bd-locations — district → thana map for Bangladesh
import { BD_LOCATIONS, BD_DISTRICTS, BD_STATS } from '../../../_lib/bdLocations.js';
import { withCors, json } from '../../../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  return json(res, 200, {
    districts: BD_DISTRICTS,
    locations: BD_LOCATIONS,
    stats: BD_STATS,
  });
});