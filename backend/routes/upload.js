import express from 'express';
import { authMiddleware } from '../lib/auth.js';
import { upload, UPLOADS_PUBLIC_PATH } from '../lib/upload.js';
import { prisma } from '../lib/prisma.js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const router = express.Router();

const MAX_WIDTH = 600;   // max image width in px
const MAX_HEIGHT = 600;  // max image height in px
const JPEG_QUALITY = 78;  // balance size vs quality
const WEBP_QUALITY = 80;

/**
 * Resize an uploaded image: shrink to MAX_WIDTH x MAX_HEIGHT max, convert to JPEG.
 * Handles HEIC/HEIF (iPhone) by converting to JPEG first, since sharp can't decode HEIC.
 * Returns the absolute path of the final file (may be renamed .heic → .jpg).
 */
async function processImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let processPath = filePath;
  let outExt = ext;

  // HEIC/HEIF → JPEG conversion (sharp can't decode HEIC by default)
  if (ext === '.heic' || ext === '.heif') {
    try {
      const { default: heicConvert } = await import('heic-convert');
      const inputBuffer = fs.readFileSync(filePath);
      const jpegBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 0.9
      });
      const newPath = filePath.replace(/\.(heic|heif)$/i, '.jpg');
      fs.writeFileSync(newPath, jpegBuffer);
      fs.unlinkSync(filePath);
      processPath = newPath;
      outExt = '.jpg';
    } catch (e) {
      console.error('HEIC conversion failed', filePath, e);
      // Fall through with original file — sharp will fail gracefully downstream
    }
  }

  // Resize (sharp handles JPEG, PNG, WebP, GIF)
  const tmpPath = processPath + '.tmp.jpg';
  try {
    await sharp(processPath)
      .rotate()                          // auto-rotate based on EXIF
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: 'inside',                   // shrink to fit, never upscale
        withoutEnlargement: true
      })
      .jpeg({ quality: JPEG_QUALITY, progressive: true, mozjpeg: true })
      .toFile(tmpPath);
    fs.unlinkSync(processPath);
    fs.renameSync(tmpPath, processPath);
  } catch (e) {
    // Clean up tmp if sharp failed
    try { fs.unlinkSync(tmpPath); } catch {}
    throw e;
  }
  return { path: processPath, ext: outExt };
}

/**
 * POST /api/upload/image
 * Multipart form-data: field name = "image" (single) or "images" (max 5)
 * Returns: { urls: ["http://localhost:5000/uploads/abc.jpg", ...] }
 */
router.post('/image', authMiddleware, upload.array('images', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    // Resize all images server-side (HEIC → JPEG happens inside processImage)
    const urls = [];
    for (const f of req.files) {
      try {
        const result = await processImage(f.path);
        // Build URL from the final file extension (HEIC may have been renamed to .jpg)
        const finalFilename = f.filename.replace(/\.(heic|heif)$/i, result.ext);
        urls.push(`${protocol}://${host}${UPLOADS_PUBLIC_PATH}/${finalFilename}`);
      } catch (e) {
        console.error('resize failed', f.path, e);
        // Skip failed file but continue with others
      }
    }
    res.json({ urls });
  } catch (err) {
    console.error('[upload/image]', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

/**
 * POST /api/upload/auction
 * Upload + create auction in one shot
 * Multipart: images[] (max 5) + title, description, category, etc.
 */
router.post('/auction', authMiddleware, upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, category, condition, basePrice, bidIncrement, city, area, district, thana } = req.body;
    if (!title || !description || !basePrice || !city || !area) {
      // Clean up uploaded files
      if (req.files) req.files.forEach(f => fs.unlinkSync(f.path));
      return res.status(400).json({ error: 'title, description, basePrice, city, area required' });
    }

    const basePriceNum = Number(basePrice);
    if (isNaN(basePriceNum) || basePriceNum < 100) {
      if (req.files) req.files.forEach(f => fs.unlinkSync(f.path));
      return res.status(400).json({ error: 'Base price must be at least 100 BDT' });
    }

    const host = req.get('host');
    const protocol = req.protocol;
    // Resize images (HEIC → JPEG happens inside processImage), build final URLs
    const images = [];
    for (const f of (req.files || [])) {
      try {
        const result = await processImage(f.path);
        const finalFilename = f.filename.replace(/\.(heic|heif)$/i, result.ext);
        images.push(`${protocol}://${host}${UPLOADS_PUBLIC_PATH}/${finalFilename}`);
      } catch (e) {
        console.error('resize failed', f.path, e);
      }
    }

    const { scheduleAuctionEnd } = await import('../workers/auctionTimer.js');
    const endsAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const auction = await prisma.auction.create({
      data: {
        sellerId: req.userId,
        title, description, images, category,
        condition: condition || 'Used',
        basePrice: basePriceNum,
        bidIncrement: Number(bidIncrement) || 100,
        city, area,
        district: district || null,
        thana: thana || null,
        endsAt
      },
      include: {
        seller: { select: { username: true, rating: true } },
        _count: { select: { bids: true } }
      }
    });

    await scheduleAuctionEnd(auction.id, endsAt);
    res.status(201).json({ auction });
  } catch (err) {
    console.error('[upload/auction]', err);
    if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    res.status(500).json({ error: 'Failed to create auction' });
  }
});

// Error handler for multer (file too large, etc.)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 18MB)' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Too many files (max 5)' });
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
});

export default router;
export { processImage };
