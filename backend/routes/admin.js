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

export default router;