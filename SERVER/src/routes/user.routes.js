const express = require('express');
const { User } = require('../models');
const { publicUser, error } = require('../utils/serialize');
const { requireActive } = require('../middleware/auth.middleware');
const { emitProfile } = require('../realtime/socket');

const router = express.Router();

// GET /api/users
router.get('/', requireActive, async (_req, res) => {
  const users = await User.find({ status: 'active' }).sort({ name: 1 });
  res.json({ users: users.map(publicUser) });
});

// GET /api/users/:id
router.get('/:id', requireActive, async (req, res) => {
  if (String(req.user._id) !== req.params.id && req.user.status !== 'active') {
    return error(res, 403, 'Forbidden.');
  }
  const user = await User.findById(req.params.id);
  if (!user) return error(res, 404, 'User not found.');
  if (
    String(user._id) !== String(req.user._id) &&
    user.status !== 'active' &&
    req.user.role !== 'admin'
  ) {
    return error(res, 404, 'User not found.');
  }
  res.json({ user: publicUser(user) });
});

// PATCH /api/users/me
router.patch('/me', async (req, res) => {
  const allowed = ['name', 'about', 'avatar', 'theme'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      req.user[key] = req.body[key];
    }
  }
  if (req.body.avatar && String(req.body.avatar).length > 50000) {
    return error(res, 400, 'Avatar is too large.');
  }
  await req.user.save();
  emitProfile(req.user);
  res.json({ user: publicUser(req.user) });
});

// POST /api/users/me/heartbeat
router.post('/me/heartbeat', requireActive, async (req, res) => {
  req.user.lastSeen = new Date();
  await req.user.save();
  emitProfile(req.user);
  res.json({ lastSeen: req.user.lastSeen.toISOString() });
});

// POST /api/users/me/mute
router.post('/me/mute', requireActive, async (req, res) => {
  const chatId = String(req.body.chatId || '');
  const muted = Boolean(req.body.muted);
  const set = new Set(req.user.mutedChats || []);
  if (muted) {
    set.add(chatId);
  } else {
    set.delete(chatId);
  }
  req.user.mutedChats = [...set];
  await req.user.save();
  emitProfile(req.user);
  res.json({ user: publicUser(req.user) });
});

// POST /api/users/me/fcm
router.post('/me/fcm', async (req, res) => {
  const token = String(req.body.token || '');
  const remove = Boolean(req.body.remove);
  const set = new Set(req.user.fcmTokens || []);
  if (remove) {
    set.delete(token);
  } else if (token) {
    set.add(token);
  }
  req.user.fcmTokens = [...set];
  await req.user.save();
  res.json({ ok: true });
});

module.exports = router;
