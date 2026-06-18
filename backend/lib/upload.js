import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Serve at /uploads/<filename> via static route
export const UPLOADS_PUBLIC_PATH = '/uploads';
export const UPLOADS_ABSOLUTE_DIR = UPLOAD_DIR;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'].includes(ext) ? ext : '.jpg';
    const random = crypto.randomBytes(8).toString('hex');
    const ts = Date.now();
    cb(null, `${ts}-${random}${safeExt}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif'
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only JPG, PNG, WebP, GIF, HEIC images allowed'), false);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 18 * 1024 * 1024, files: 5 } // 18MB per file, max 5 files
});
