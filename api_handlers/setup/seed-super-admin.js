// POST /api/setup/seed-super-admin
// One-time setup: creates a SUPER_ADMIN user with provided credentials.
// Protected by CRON_SECRET. Safe to call repeatedly — idempotent.
import { prisma } from '../_lib/prisma.js';
import { hashPassword } from '../_lib/auth.js';
import { withCors, json, error } from '../_lib/middleware.js';

export default withCors(async (req, res) => {
  if (req.method !== 'POST') return error(res, 405, 'POST only');

  // Auth: require CRON_SECRET bearer (must match Vercel env)
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  const expected = process.env.CRON_SECRET;
  if (!expected) return error(res, 500, 'CRON_SECRET not configured on server');
  if (token !== expected) return error(res, 401, 'Bad token');

  const body = req.body || {};
  const email = (body.email || 'admin@recycle.bd').toLowerCase().trim();
  const username = (body.username || 'admin').toLowerCase().trim();
  const password = body.password || 'Admin@2026';
  const fullName = body.fullName || 'Super Admin';

  try {
    // Idempotent: upsert by email
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        passwordHash,
        role: 'SUPER_ADMIN',
        fullName,
      },
      create: {
        email,
        username,
        passwordHash,
        fullName,
        role: 'SUPER_ADMIN',
      },
    });

    return json(res, 200, {
      ok: true,
      message: 'SUPER_ADMIN seeded/updated',
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error('[seed-super-admin]', err);
    return error(res, 500, 'Seed failed: ' + (err.message || 'unknown'));
  }
});