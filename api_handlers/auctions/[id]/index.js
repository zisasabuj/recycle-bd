// /api/auctions/[id] — GET (detail), PUT (update), DELETE
import { prisma } from '../../../_lib/prisma.js';
import { withCors, json, error } from '../../../_lib/middleware.js';
import { getUserFromHeader } from '../../../_lib/auth.js';

// GET /api/auctions/:id — public detail view (no auth)
async function handleGet(req, res, id) {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, username: true, fullName: true, rating: true, createdAt: true } },
        _count: { select: { bids: true } },
        bids: {
          select: { id: true, amount: true, bidderId: true, createdAt: true },
          orderBy: { amount: 'desc' },
          take: 20,
        },
      },
    });
    if (!auction) return error(res, 404, 'Auction not found');
    // Compute currentMaxBid = top bid amount (already desc-sorted)
    auction.currentMaxBid = auction.bids && auction.bids.length ? Number(auction.bids[0].amount) : null;
    return json(res, 200, { auction });
  } catch (err) {
    console.error('[get auction]', err && err.message ? err.message : err);
    console.error('[get auction stack]', err && err.stack ? err.stack : 'no stack');
    return error(res, 500, 'Failed to get auction: ' + (err && err.message ? err.message : 'unknown'));
  }
}

// PUT /api/auctions/:id — owner or admin update
async function handlePut(req, res, id, userId) {
  try {
    const auction = await prisma.auction.findUnique({ where: { id } });
    if (!auction) return error(res, 404, 'Auction not found');

    const requester = await prisma.user.findUnique({ where: { id: userId } });
    const isOwner = auction.sellerId === userId;
    const isAdmin = requester && (requester.role === 'ADMIN' || requester.role === 'SUPER_ADMIN');
    if (!isOwner && !isAdmin) return error(res, 403, 'Only the seller or admin can edit');

    let editMode = 'OPEN';
    try {
      const setting = await prisma.systemSetting.findUnique({ where: { key: 'edit_mode' } });
      editMode = setting && (setting.value === 'CLOSE' || setting.value === 'OPEN') ? setting.value : 'OPEN';
    } catch (e) {
      // SystemSetting table may not exist on a fresh DB — default to OPEN
      editMode = 'OPEN';
    }

    const allEditable = ['title', 'description', 'category', 'condition', 'basePrice', 'bidIncrement', 'city', 'area', 'district', 'thana', 'images'];
    const allowedInMode = editMode === 'CLOSE' ? ['description'] : allEditable;

    const data = {};
    for (const f of allowedInMode) {
      if (req.body[f] !== undefined && req.body[f] !== '') data[f] = req.body[f];
    }

    if (editMode === 'CLOSE') {
      const attempted = Object.keys(req.body || {}).filter((k) => allEditable.includes(k) && !allowedInMode.includes(k));
      if (attempted.length > 0) {
        return error(res, 403, 'Edit mode is CLOSED — only description can be edited');
      }
    }

    if (data.basePrice) data.basePrice = Number(data.basePrice);
    if (data.bidIncrement) data.bidIncrement = Number(data.bidIncrement);

    // Image handling for edit:
    //   - req.body.keepImages (string[]) = existing URLs the user wants to keep (after X-clicks)
    //   - req.body.images    (string[]) = new file data URIs to upload to imgBB
    // We merge: keepImages (URLs already) + newly uploaded URLs → final images[]
    if (editMode === 'OPEN') {
      const keepImages = Array.isArray(req.body.keepImages) ? req.body.keepImages.filter(u => typeof u === 'string' && u.startsWith('http')) : [];
      const newUris = Array.isArray(req.body.images) ? req.body.images.filter(u => typeof u === 'string' && u.startsWith('data:')) : [];
      const finalImages = [...keepImages];

      if (newUris.length > 0) {
        try {
          const { uploadToImgBB } = await import('../../_lib/imgbb.js');
          for (const dataUri of newUris.slice(0, 5 - keepImages.length)) {
            try {
              const result = await uploadToImgBB(dataUri);
              const url = typeof result === 'string' ? result : result?.url;
              if (url) finalImages.push(url);
            } catch (e) { console.error('[imgBB upload]', e); }
          }
        } catch (e) {
          console.error('[imgBB import]', e);
        }
      }

      data.images = finalImages.slice(0, 5);
    } else {
      // CLOSE mode: strip any image-related fields to be safe (description-only)
      delete data.images;
    }

    const updated = await prisma.auction.update({
      where: { id },
      data,
      include: { seller: { select: { id: true, username: true, fullName: true } } },
    });

    return json(res, 200, { auction: updated, message: 'Auction updated', mode: editMode });
  } catch (err) {
    console.error('[edit auction]', err && err.message ? err.message : err);
    console.error('[edit auction stack]', err && err.stack ? err.stack : 'no stack');
    return error(res, 500, 'Failed to update auction: ' + (err && err.message ? err.message : 'unknown'));
  }
}

// DELETE /api/auctions/:id — owner (DRAFT/no bids) or admin (any)
async function handleDelete(req, res, id, userId) {
  try {
    const auction = await prisma.auction.findUnique({
      where: { id },
      select: { id: true, sellerId: true, status: true, bids: { select: { id: true }, take: 1 } },
    });
    if (!auction) return error(res, 404, 'Auction not found');

    const requester = await prisma.user.findUnique({ where: { id: userId } });
    const isAdmin = requester && (requester.role === 'ADMIN' || requester.role === 'SUPER_ADMIN');
    const isOwner = auction.sellerId === userId;

    if (!isAdmin) {
      if (!isOwner) return error(res, 403, 'Not allowed — only seller or admin can delete');
      if (auction.status !== 'DRAFT' && auction.bids.length > 0) {
        return error(res, 403, 'Cannot delete — auction is live with bids. Contact admin.');
      }
    }

    await prisma.bid.deleteMany({ where: { auctionId: id } });
    await prisma.auction.delete({ where: { id } });

    const deletedBy = isAdmin ? (requester.role === 'SUPER_ADMIN' ? 'super_admin' : 'admin') : 'owner';
    return json(res, 200, { message: 'Auction deleted', id, deletedBy });
  } catch (err) {
    console.error('[delete auction]', err);
    return error(res, 500, 'Failed to delete auction');
  }
}

export default withCors(async (req, res) => {
  const id = req.query.id;
  if (!id) return error(res, 400, 'Missing auction id');

  if (req.method === 'GET') return handleGet(req, res, id);

  if (req.method === 'PUT' || req.method === 'DELETE') {
    const payload = getUserFromHeader(req.headers.authorization);
    if (!payload) return error(res, 401, 'Missing or invalid Authorization header');
    if (req.method === 'PUT') return handlePut(req, res, id, payload.userId);
    return handleDelete(req, res, id, payload.userId);
  }

  return error(res, 405, 'GET, PUT, or DELETE only');
});