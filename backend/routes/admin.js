import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

// ============ Edit Mode Settings ============
// Stored as SystemSetting row with key='edit_mode', value='OPEN' | 'CLOSE'
// OPEN = owners can edit any field anytime
// CLOSE = owners can ONLY edit description

// GET /api/settings/edit-mode — public (frontend reads to know what to allow)
router.get('/edit-mode', async (req, res) => {
  try {
    const s = await prisma.systemSetting.findUnique({ where: { key: 'edit_mode' } });
    const mode = (s && (s.value === 'CLOSE' || s.value === 'OPEN')) ? s.value : 'OPEN';
    res.json({ mode });
  } catch (err) {
    console.error('[edit-mode GET]', err);
    res.status(500).json({ error: 'Failed to read edit mode' });
  }
});

// PUT /api/admin/settings/edit-mode — SUPER_ADMIN only
router.put('/edit-mode', authMiddleware, async (req, res) => {
  try {
    const requester = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!requester || requester.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'SUPER_ADMIN only' });
    }
    const { mode } = req.body;
    if (mode !== 'OPEN' && mode !== 'CLOSE') {
      return res.status(400).json({ error: 'mode must be OPEN or CLOSE' });
    }
    await prisma.systemSetting.upsert({
      where: { key: 'edit_mode' },
      update: { value: mode, updatedBy: req.user.userId },
      create: { key: 'edit_mode', value: mode, updatedBy: req.user.userId }
    });
    res.json({ ok: true, mode });
  } catch (err) {
    console.error('[edit-mode PUT]', err);
    res.status(500).json({ error: 'Failed to update edit mode' });
  }
});

// ============ Hero Stats Settings ============
// Stored as SystemSetting rows with key='hero_active_count', 'hero_anonymity_pct',
// 'hero_duration_label', 'hero_users_count'. SUPER_ADMIN can edit; public reads for display.

// GET /api/settings/hero-stats — public (homepage reads on load)
router.get('/hero-stats', async (req, res) => {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: ['hero_active_count', 'hero_anonymity_pct', 'hero_duration_label', 'hero_users_count'] } }
    });
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.json({
      hero_active_count:       map.hero_active_count       || '0',
      hero_anonymity_pct:      map.hero_anonymity_pct      || '100%',
      hero_duration_label:     map.hero_duration_label     || '48h',
      hero_users_count:        map.hero_users_count        || '0'
    });
  } catch (err) {
    console.error('[hero-stats GET]', err);
    res.status(500).json({ error: 'Failed to read hero stats' });
  }
});

// PUT /api/admin/settings/hero-stats — SUPER_ADMIN only
router.put('/hero-stats', authMiddleware, async (req, res) => {
  try {
    const requester = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!requester || requester.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'SUPER_ADMIN only' });
    }
    const allowed = ['hero_active_count', 'hero_anonymity_pct', 'hero_duration_label', 'hero_users_count'];
    const updates = req.body || {};
    const toSave = {};
    for (const k of allowed) {
      if (typeof updates[k] === 'string' && updates[k].length <= 32) {
        toSave[k] = updates[k];
      }
    }
    if (Object.keys(toSave).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }
    for (const [k, v] of Object.entries(toSave)) {
      await prisma.systemSetting.upsert({
        where: { key: k },
        update: { value: v, updatedBy: req.user.userId },
        create: { key: k, value: v, updatedBy: req.user.userId }
      });
    }
    res.json({ ok: true, updated: Object.keys(toSave) });
  } catch (err) {
    console.error('[hero-stats PUT]', err);
    res.status(500).json({ error: 'Failed to update hero stats' });
  }
});

export default router;