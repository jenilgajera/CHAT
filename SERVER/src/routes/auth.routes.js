const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { publicUser, error } = require('../utils/serialize');
const { getSettings } = require('../utils/helpers');

const router = express.Router();

function sign(user, secret) {
  return jwt.sign({ sub: String(user._id), role: user.role, status: user.status }, secret, {
    expiresIn: '30d',
  });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const inviteCode = String(req.body.inviteCode || '').trim();

    if (!/^[a-z0-9_]{3,20}$/.test(username)) {
      return error(res, 400, 'Username must be 3-20 characters: a-z, 0-9, underscore.');
    }
    if (password.length < 6) {
      return error(res, 400, 'Password must be at least 6 characters.');
    }
    if (!name) {
      return error(res, 400, 'Name is required.');
    }

    const settings = await getSettings();
    if (!settings.registrationOpen) {
      return error(res, 403, 'Registration is currently closed. Contact an admin.');
    }
    if (inviteCode !== settings.inviteCode) {
      return error(res, 400, 'Invite code is not valid.');
    }
    if (await User.findOne({ username })) {
      return error(res, 409, 'That username is already taken.');
    }

    const count = await User.countDocuments();
    const isFirst = count === 0;
    const user = await User.create({
      name,
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role: isFirst ? 'admin' : 'user',
      status: isFirst ? 'active' : 'pending',
    });

    const token = sign(user, req.jwtSecret);
    return res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return error(res, 409, 'That username is already taken.');
    }
    return error(res, 500, 'Could not register.');
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await User.findOne({ username });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return error(res, 401, 'Wrong username or password.');
  }
  return res.json({ token: sign(user, req.jwtSecret), user: publicUser(user) });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// POST /api/auth/password
router.post('/password', async (req, res) => {
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');
  if (next.length < 6) {
    return error(res, 400, 'New password must be at least 6 characters.');
  }
  if (!(await bcrypt.compare(current, req.user.passwordHash))) {
    return error(res, 400, 'Current password is wrong.');
  }
  req.user.passwordHash = await bcrypt.hash(next, 10);
  await req.user.save();
  return res.json({ ok: true });
});

module.exports = (jwtSecret) => {
  // Inject jwtSecret into req for sign()
  router.use((req, _res, next) => {
    req.jwtSecret = jwtSecret;
    next();
  });
  return router;
};
