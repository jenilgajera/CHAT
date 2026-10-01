const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { error } = require('../utils/serialize');

function requireAuth(jwtSecret) {
  return async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) {
      return error(res, 401, 'Sign in required.');
    }
    try {
      const payload = jwt.verify(token, jwtSecret);
      const user = await User.findById(payload.sub);
      if (!user) {
        return error(res, 401, 'Sign in required.');
      }
      req.user = user;
      next();
    } catch {
      return error(res, 401, 'Session expired. Sign in again.');
    }
  };
}

function requireActive(req, res, next) {
  if (req.user.status !== 'active') {
    return error(res, 403, 'Account is not active.');
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (req.user.status !== 'active' || req.user.role !== 'admin') {
    return error(res, 403, 'Admin only.');
  }
  return next();
}

async function memberChat(req, res, next) {
  const { Chat } = require('../models');
  const chat = await Chat.findById(req.params.id);
  if (!chat) {
    return error(res, 404, 'Chat not found.');
  }
  if (!chat.members.includes(String(req.user._id))) {
    return error(res, 403, 'Not a member of this chat.');
  }
  req.chat = chat;
  return next();
}

module.exports = { requireAuth, requireActive, requireAdmin, memberChat };
