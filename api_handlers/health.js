// GET /api/health — public health check (used by Vercel + uptime monitors)
import { prisma } from '../_lib/prisma.js';
import { withCors, json } from '../_lib/middleware.js';

export default withCors(async (req, res) => {
  try {
    let dbOk = false;
    let dbError = null;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (e) {
      dbError = e.message.split('\n')[0];
    }
    return json(res, 200, {
      ok: true,
      time: new Date().toISOString(),
      db: dbOk ? 'up' : 'down',
      dbError,
    });
  } catch (err) {
    return json(res, 500, { ok: false, error: err.message });
  }
});