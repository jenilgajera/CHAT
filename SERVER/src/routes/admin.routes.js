const express = require('express');
const { User, Chat, Message, AuditLog } = require('../models');
const { publicUser, publicChat, publicAudit, error } = require('../utils/serialize');
const { requireAdmin } = require('../middleware/auth.middleware');
const { emitChatToMembers, emitChats, emitProfile } = require('../realtime/socket');
const { getSettings, sendMessage } = require('../utils/helpers');

const router = express.Router();
const ANNOUNCEMENTS = 'announcements';

async function audit(adminId, action, targetId, meta = {}) {
  await AuditLog.create({ adminId, action, targetId, meta });
}

// GET /api/admin/pending
router.get('/pending', requireAdmin, async (_req, res) => {
  const users = await User.find({ status: 'pending' }).sort({ createdAt: -1 });
  res.json({ users: users.map(publicUser) });
});

// GET /api/admin/users
router.get('/users', requireAdmin, async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ users: users.map(publicUser) });
});

// GET /api/admin/groups
router.get('/groups', requireAdmin, async (_req, res) => {
  const groups = await Chat.find({ type: 'group' }).sort({ updatedAt: -1 });
  res.json({ groups: groups.map(publicChat) });
});

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (_req, res) => {
  const settings = await getSettings();
  const day = new Date().toISOString().slice(0, 10);
  const [users, pending, groups] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: 'pending' }),
    Chat.countDocuments({ type: 'group' }),
  ]);
  res.json({
    users,
    pending,
    groups,
    messagesToday: Number(settings.messageCounts?.[day] || 0),
  });
});

// GET /api/admin/audit
router.get('/audit', requireAdmin, async (_req, res) => {
  const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(50);
  res.json({ logs: logs.map(publicAudit) });
});

// GET /api/admin/settings
router.get('/settings', requireAdmin, async (_req, res) => {
  const settings = await getSettings();
  res.json({ inviteCode: settings.inviteCode, registrationOpen: settings.registrationOpen });
});

// PATCH /api/admin/settings
router.patch('/settings', requireAdmin, async (req, res) => {
  const settings = await getSettings();
  if (req.body.inviteCode) settings.inviteCode = String(req.body.inviteCode).trim();
  if (req.body.registrationOpen !== undefined)
    settings.registrationOpen = Boolean(req.body.registrationOpen);
  await settings.save();
  await audit(String(req.user._id), 'update_settings', 'settings/app', {
    inviteCode: settings.inviteCode,
    registrationOpen: String(settings.registrationOpen),
  });
  res.json({ inviteCode: settings.inviteCode, registrationOpen: settings.registrationOpen });
});

// POST /api/admin/users/:id/approve
router.post('/users/:id/approve', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return error(res, 404, 'User not found.');
  user.status = 'active';
  await user.save();
  const announcements = await Chat.findById(ANNOUNCEMENTS);
  if (announcements && !announcements.members.includes(String(user._id))) {
    announcements.members.push(String(user._id));
    announcements.unread = { ...(announcements.unread || {}), [String(user._id)]: 0 };
    announcements.markModified('unread');
    await announcements.save();
    await emitChatToMembers(announcements);
  }
  emitProfile(user);
  await audit(String(req.user._id), 'approve_user', String(user._id), { name: user.name });
  res.json({ user: publicUser(user) });
});

// POST /api/admin/users/:id/reject
router.post('/users/:id/reject', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return error(res, 404, 'User not found.');
  user.status = 'disabled';
  await user.save();
  emitProfile(user);
  await audit(String(req.user._id), 'reject_user', String(user._id), { name: user.name });
  res.json({ user: publicUser(user) });
});

// POST /api/admin/users/:id/status
router.post('/users/:id/status', requireAdmin, async (req, res) => {
  if (String(req.user._id) === req.params.id)
    return error(res, 400, 'You cannot change your own status.');
  const user = await User.findById(req.params.id);
  if (!user) return error(res, 404, 'User not found.');
  const status = req.body.status === 'disabled' ? 'disabled' : 'active';
  user.status = status;
  await user.save();
  emitProfile(user);
  await audit(
    String(req.user._id),
    status === 'disabled' ? 'disable_user' : 'enable_user',
    String(user._id),
    {},
  );
  res.json({ user: publicUser(user) });
});

// POST /api/admin/users/:id/role
router.post('/users/:id/role', requireAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return error(res, 404, 'User not found.');
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  if (role === 'user' && user.role === 'admin') {
    const count = await User.countDocuments({ role: 'admin' });
    if (count <= 1) return error(res, 400, 'The last admin cannot be demoted.');
  }
  user.role = role;
  await user.save();
  emitProfile(user);
  await audit(
    String(req.user._id),
    role === 'admin' ? 'promote_admin' : 'demote_admin',
    String(user._id),
    {},
  );
  res.json({ user: publicUser(user) });
});

// POST /api/admin/users/:id/delete
router.post('/users/:id/delete', requireAdmin, async (req, res) => {
  if (String(req.user._id) === req.params.id)
    return error(res, 400, 'You cannot delete your own account.');
  const user = await User.findById(req.params.id);
  if (!user) return error(res, 404, 'User not found.');
  user.status = 'disabled';
  await user.save();
  const chats = await Chat.find({ members: String(user._id) });
  for (const chat of chats) {
    chat.members = chat.members.filter((id) => id !== String(user._id));
    chat.admins = chat.admins.filter((id) => id !== String(user._id));
    await chat.save();
    await emitChatToMembers(chat);
  }
  emitProfile(user);
  await audit(String(req.user._id), 'delete_user', String(user._id), {
    note: 'disabled and removed from chats',
  });
  res.json({ user: publicUser(user) });
});

// DELETE /api/admin/groups/:id
router.delete('/groups/:id', requireAdmin, async (req, res) => {
  const chat = await Chat.findById(req.params.id);
  if (!chat || chat.type !== 'group') return error(res, 404, 'Group not found.');
  const members = [...chat.members];
  await Message.deleteMany({ chatId: String(chat._id) });
  await Chat.deleteOne({ _id: chat._id });
  for (const uid of members) await emitChats(uid);
  await audit(String(req.user._id), 'delete_group', String(chat._id), { name: chat.name });
  res.json({ ok: true });
});

// POST /api/admin/broadcast
router.post('/broadcast', requireAdmin, async (req, res) => {
  const text = String(req.body.text || '').trim();
  if (!text) return error(res, 400, 'Message is required.');
  const actives = await User.find({ status: 'active' });
  const memberIds = actives.map((u) => String(u._id));
  let chat = await Chat.findById(ANNOUNCEMENTS);
  const unread = {};
  for (const id of memberIds) unread[id] = 0;
  if (!chat) {
    chat = await Chat.create({
      _id: ANNOUNCEMENTS,
      type: 'broadcast',
      name: 'Announcements',
      avatar: '',
      members: memberIds,
      admins: [String(req.user._id)],
      lastMessage: null,
      unread,
    });
  } else {
    chat.members = memberIds;
    chat.unread = { ...(chat.unread || {}), ...unread };
    chat.markModified('unread');
    await chat.save();
  }
  const message = await sendMessage({
    chat,
    senderId: String(req.user._id),
    type: 'text',
    text,
    clientId: `bc-${Date.now()}`,
  });
  await audit(String(req.user._id), 'broadcast', ANNOUNCEMENTS, { text: text.slice(0, 80) });
  res.json({ message });
});

module.exports = router;
