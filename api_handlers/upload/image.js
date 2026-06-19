// POST /api/upload/image — accepts base64 data URIs in JSON, uploads to imgBB
// Why JSON instead of multipart? Vercel serverless has a 4.5MB body limit on
// multipart parsing; base64-in-JSON works around that and keeps it simple.
// Client should resize to <600px on the longest edge before sending.
import { uploadToImgBB } from '../_lib/imgbb.js';
import { withCors, withAuth, json, error } from '../_lib/middleware.js';

export default withCors(withAuth(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');
  try {
    const { images, image } = req.body || {};
    const list = images ? (Array.isArray(images) ? images : [images]) : (image ? [image] : []);
    if (list.length === 0) return error(res, 400, 'No images provided. Send { images: [dataUri, ...] } or { image: dataUri }');
    if (list.length > 5) return error(res, 400, 'Max 5 images per upload');

    const urls = [];
    for (const dataUri of list) {
      if (typeof dataUri !== 'string') continue;
      const result = await uploadToImgBB(dataUri);
      // imgBB returns { url, deleteUrl } — return just URL string for Prisma String[] storage
      const url = typeof result === 'string' ? result : result?.url;
      if (url) urls.push(url);
    }
    if (urls.length === 0) return error(res, 400, 'No valid images uploaded');
    return json(res, 200, { urls });
  } catch (err) {
    console.error('[upload/image]', err);
    return error(res, 500, err.message || 'Upload failed');
  }
}));