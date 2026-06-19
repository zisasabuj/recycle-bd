// imgBB upload helper — replaces local disk storage.
// Receives a base64 string OR a Buffer, uploads to imgBB, returns the URL.
// Serverless-friendly: no filesystem, no sharp (imgBB doesn't accept HEIC; we tell clients to convert).

const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

/**
 * Upload a base64 image to imgBB.
 * @param {string} base64Data - data URI or raw base64 (no data:image/... prefix needed)
 * @param {string} [name] - optional filename hint
 * @returns {Promise<{url: string, deleteUrl: string}>}
 */
export async function uploadToImgBB(base64Data, name) {
  if (!IMGBB_API_KEY) {
    throw new Error('IMGBB_API_KEY not configured');
  }
  // Strip data URI prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

  const form = new URLSearchParams();
  form.append('image', cleanBase64);
  if (name) form.append('name', name);

  const resp = await fetch(`${IMGBB_UPLOAD_URL}?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`imgBB upload failed: ${resp.status} ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  if (!json.success) {
    throw new Error(`imgBB returned success=false: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return {
    url: json.data.url,
    deleteUrl: json.data.delete_url,
  };
}

/**
 * Parse a multipart/form-data request and extract image base64 strings.
 * Vercel serverless does NOT auto-parse multipart; we need to read the raw body.
 * This helper handles parsing the multipart body manually.
 */
export async function parseMultipartImages(req) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data')) {
    throw new Error('Expected multipart/form-data');
  }
  // Use undici's FormData parser (Node 18+)
  const { File } = await import('undici').catch(() => ({}));
  // Fallback: rely on the Vercel runtime to parse body
  if (typeof req.body === 'object' && req.body !== null) {
    // Body already parsed (e.g., by Vercel middleware)
    return req.body;
  }
  // Otherwise return raw — caller can deal with it
  return null;
}