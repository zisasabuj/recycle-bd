import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authMiddleware, hashPassword, comparePassword, signToken, requireRole, requireSuperAdmin } from '../lib/auth.js';

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, fullName, phone, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'username, email, password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    if (existing) {
      return res.status(409).json({ error: 'Username or email already taken' });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        fullName: fullName || null,
        phone: phone || null,
        role: role || 'BOTH'
      },
      select: { id: true, username: true, email: true, fullName: true, role: true, createdAt: true }
    });

    const token = signToken({ userId: user.id, username: user.username });
    res.status(201).json({ user, token });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { emailOrUsername, password } = req.body;
    if (!emailOrUsername || !password) {
      return res.status(400).json({ error: 'emailOrUsername and password required' });
    }

    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: emailOrUsername }, { username: emailOrUsername }]
      }
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ userId: user.id, username: user.username });
    res.json({
      user: {
        id: user.id, username: user.username, email: user.email,
        fullName: user.fullName, role: user.role
      },
      token
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, username: true, email: true, fullName: true, phone: true, role: true, rating: true, createdAt: true }
  });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});


// PUT /api/auth/users/:id/role - promote/demote user (SUPER_ADMIN only)
router.put('/users/:id/role', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = ['BUYER', 'SELLER', 'BOTH', 'ADMIN', 'SUPER_ADMIN'];
    if (!allowed.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${allowed.join(', ')}` });
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, username: true, role: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      select: { id: true, username: true, email: true, role: true },
      data: { role }
    });
    res.json({ user: updated, message: `${updated.username} → ${updated.role}` });
  } catch (err) {
    console.error('[promote]', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// GET /api/auth/users - list all users (SUPER_ADMIN only)
router.get('/users', authMiddleware, requireSuperAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, email: true, fullName: true, role: true, rating: true, createdAt: true,
                _count: { select: { auctions: true, bids: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list users' });
  }
});

export default router;
