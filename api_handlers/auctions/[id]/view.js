// POST /api/auctions/:id/view — increment view count (idempotent cheap call)
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';

export default withCors(async (req, res) => {
  const id = req.query.id;
  if (!id) return error(res, 400, 'Missing auction id');
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    await prisma.auction.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('[view]', err);
    return error(res, 500, 'Failed');
  }
});