const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Chat, Message, Settings, AuditLog } = require('./models');
const { publicUser, publicChat, publicMessage, publicAudit, error } = require('./serialize');
const { emitChatToMembers, emitChats, emitMessage, emitProfile } = require('./realtime');

const MAX_IMAGE = 150000;
const ANNOUNCEMENTS = 'announcements';
const PAGE_SIZE = 30;

function sign(user, secret) {
  return jwt.sign({ sub: String(user._id), role: user.role, status: user.status }, secret, {
    expiresIn: '30d',
  });
}

async function getSettings() {
  let doc = await Settings.findById('app');
  if (!doc) {
    doc = await Settings.create({
      _id: 'app',
      inviteCode: process.env.INVITE_CODE || 'FRIENDS',
      registrationOpen: true,
      messageCounts: {},
    });
  }
  return doc;
}

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

async function bumpDaily() {
  const settings = await getSettings();
  const day = new Date().toISOString().slice(0, 10);
  const counts = settings.messageCounts || {};
  counts[day] = Number(counts[day] || 0) + 1;
  settings.messageCounts = counts;
  settings.markModified('messageCounts');
  await settings.save();
}

async function audit(adminId, action, targetId, meta = {}) {
  await AuditLog.create({ adminId, action, targetId, meta });
}

async function sendMessage({ chat, senderId, type, text, image, replyTo, clientId }) {
  if (chat.type === 'broadcast' && type !== 'system') {
    const sender = await User.findById(senderId);
    if (!sender || sender.role !== 'admin') {
      throw Object.assign(new Error('Only admins can post announcements.'), { status: 403 });
    }
  }
  if (type === 'system' && !(chat.admins || []).includes(senderId) && chat.type !== 'broadcast') {
    throw Object.assign(new Error('Only group admins can post system messages.'), { status: 403 });
  }
  if (image && image.length > MAX_IMAGE) {
    throw Object.assign(new Error('Image is too large.'), { status: 400 });
  }
  const msg = await Message.create({
    chatId: String(chat._id),
    senderId,
    type,
    text: text || '',
    image: image || '',
    replyTo: replyTo || null,
    deliveredTo: [senderId],
    readBy: [senderId],
    deletedFor: [],
    deletedForAll: false,
    clientId: clientId || randomUUID(),
  });
  const unread = { ...(chat.unread || {}) };
  for (const uid of chat.members) {
    if (uid !== senderId) {
      unread[uid] = Number(unread[uid] || 0) + 1;
    }
  }
  chat.unread = unread;
  chat.markModified('unread');
  chat.lastMessage = {
    text: type === 'image' ? text || 'Photo' : text,
    type,
    senderId,
    at: new Date(),
  };
  chat.updatedAt = new Date();
  await chat.save();
  await bumpDaily();
  const payload = publicMessage(msg);
  emitMessage(chat, payload);
  await emitChatToMembers(chat);
  return payload;
}

function mountRoutes(app, jwtSecret) {
  const auth = requireAuth(jwtSecret);

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.post('/api/auth/register', async (req, res) => {
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
      const token = sign(user, jwtSecret);
      return res.status(201).json({ token, user: publicUser(user) });
    } catch (err) {
      if (err.code === 11000) {
        return error(res, 409, 'That username is already taken.');
      }
      return error(res, 500, 'Could not register.');
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return error(res, 401, 'Wrong username or password.');
    }
    return res.json({ token: sign(user, jwtSecret), user: publicUser(user) });
  });

  app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

  app.post('/api/auth/password', auth, async (req, res) => {
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

  app.get('/api/users', auth, requireActive, async (_req, res) => {
    const users = await User.find({ status: 'active' }).sort({ name: 1 });
    res.json({ users: users.map(publicUser) });
  });

  app.get('/api/users/:id', auth, requireActive, async (req, res) => {
    if (String(req.user._id) !== req.params.id && req.user.status !== 'active') {
      return error(res, 403, 'Forbidden.');
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return error(res, 404, 'User not found.');
    }
    if (String(user._id) !== String(req.user._id) && user.status !== 'active' && req.user.role !== 'admin') {
      return error(res, 404, 'User not found.');
    }
    res.json({ user: publicUser(user) });
  });

  app.patch('/api/users/me', auth, async (req, res) => {
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

  app.post('/api/users/me/heartbeat', auth, requireActive, async (req, res) => {
    req.user.lastSeen = new Date();
    await req.user.save();
    emitProfile(req.user);
    res.json({ lastSeen: req.user.lastSeen.toISOString() });
  });

  app.post('/api/users/me/mute', auth, requireActive, async (req, res) => {
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

  app.post('/api/users/me/fcm', auth, async (req, res) => {
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

  app.get('/api/chats', auth, requireActive, async (req, res) => {
    const chats = await Chat.find({ members: String(req.user._id) }).sort({ updatedAt: -1 });
    res.json({ chats: chats.map(publicChat) });
  });

  app.post('/api/chats/private', auth, requireActive, async (req, res) => {
    const otherId = String(req.body.otherId || '');
    const me = String(req.user._id);
    if (!otherId || otherId === me) {
      return error(res, 400, 'Pick someone to chat with.');
    }
    const other = await User.findById(otherId);
    if (!other || other.status !== 'active') {
      return error(res, 404, 'User not found.');
    }
    const id = [me, otherId].sort().join('_');
    let chat = await Chat.findById(id);
    if (!chat) {
      chat = await Chat.create({
        _id: id,
        type: 'private',
        name: '',
        avatar: '',
        members: [me, otherId],
        admins: [],
        lastMessage: null,
        unread: { [me]: 0, [otherId]: 0 },
      });
      await emitChatToMembers(chat);
    }
    res.json({ chat: publicChat(chat) });
  });

  app.post('/api/chats/groups', auth, requireActive, async (req, res) => {
    const me = String(req.user._id);
    const name = String(req.body.name || '').trim();
    const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds.map(String) : [];
    if (!name) {
      return error(res, 400, 'Group name is required.');
    }
    const members = Array.from(new Set([me, ...memberIds]));
    if (members.length < 2) {
      return error(res, 400, 'A group needs at least two people.');
    }
    const unread = {};
    for (const id of members) {
      unread[id] = 0;
    }
    const chat = await Chat.create({
      _id: randomUUID(),
      type: 'group',
      name,
      avatar: String(req.body.avatar || ''),
      members,
      admins: [me],
      lastMessage: null,
      unread,
    });
    await sendMessage({
      chat,
      senderId: me,
      type: 'system',
      text: `${name} created`,
      clientId: `sys-${Date.now()}`,
    });
    res.status(201).json({ chat: publicChat(chat) });
  });

  app.get('/api/chats/:id', auth, requireActive, memberChat, (req, res) => {
    res.json({ chat: publicChat(req.chat) });
  });

  app.get('/api/chats/:id/messages', auth, requireActive, memberChat, async (req, res) => {
    const before = req.query.before ? String(req.query.before) : '';
    const limit = Math.min(Number(req.query.limit) || PAGE_SIZE, 50);
    const filter = { chatId: String(req.chat._id) };
    if (before) {
      const cursor = await Message.findById(before);
      if (cursor) {
        filter.createdAt = { $lt: cursor.createdAt };
      }
    }
    const docs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit);
    const messages = docs.map(publicMessage).reverse();
    const oldestId = docs.length ? String(docs[docs.length - 1]._id) : null;
    res.json({ messages, oldestId });
  });

  app.post('/api/chats/:id/messages', auth, requireActive, memberChat, async (req, res) => {
    try {
      const payload = await sendMessage({
        chat: req.chat,
        senderId: String(req.user._id),
        type: req.body.type === 'image' ? 'image' : req.body.type === 'system' ? 'system' : 'text',
        text: String(req.body.text || ''),
        image: req.body.image || '',
        replyTo: req.body.replyTo || null,
        clientId: req.body.clientId || randomUUID(),
      });
      res.status(201).json({ message: payload });
    } catch (err) {
      return error(res, err.status || 500, err.message || 'Could not send.');
    }
  });

  app.post('/api/chats/:id/read', auth, requireActive, memberChat, async (req, res) => {
    const uid = String(req.user._id);
    const ids = Array.isArray(req.body.messageIds) ? req.body.messageIds.map(String) : [];
    if (ids.length) {
      await Message.updateMany(
        { _id: { $in: ids }, chatId: String(req.chat._id) },
        { $addToSet: { deliveredTo: uid, readBy: uid } },
      );
    }
    const unread = { ...(req.chat.unread || {}), [uid]: 0 };
    req.chat.unread = unread;
    req.chat.markModified('unread');
    await req.chat.save();
    await emitChatToMembers(req.chat);
    res.json({ ok: true });
  });

  app.post('/api/chats/:id/delivered', auth, requireActive, memberChat, async (req, res) => {
    const uid = String(req.user._id);
    const ids = Array.isArray(req.body.messageIds) ? req.body.messageIds.map(String) : [];
    if (ids.length) {
      await Message.updateMany(
        { _id: { $in: ids }, chatId: String(req.chat._id) },
        { $addToSet: { deliveredTo: uid } },
      );
    }
    res.json({ ok: true });
  });

  app.post('/api/chats/:id/messages/:mid/delete-me', auth, requireActive, memberChat, async (req, res) => {
    const msg = await Message.findOne({ _id: req.params.mid, chatId: String(req.chat._id) });
    if (!msg) {
      return error(res, 404, 'Message not found.');
    }
    await Message.updateOne({ _id: msg._id }, { $addToSet: { deletedFor: String(req.user._id) } });
    res.json({ ok: true });
  });

  app.post('/api/chats/:id/messages/:mid/delete-all', auth, requireActive, memberChat, async (req, res) => {
    const msg = await Message.findOne({ _id: req.params.mid, chatId: String(req.chat._id) });
    if (!msg) {
      return error(res, 404, 'Message not found.');
    }
    if (msg.senderId !== String(req.user._id)) {
      return error(res, 403, 'Only the sender can delete for everyone.');
    }
    msg.deletedForAll = true;
    msg.text = '';
    msg.image = '';
    await msg.save();
    emitMessage(req.chat, publicMessage(msg));
    res.json({ message: publicMessage(msg) });
  });

  app.patch('/api/chats/:id', auth, requireActive, memberChat, async (req, res) => {
    const chat = req.chat;
    const me = String(req.user._id);
    if (req.body.leave) {
      chat.members = chat.members.filter((id) => id !== me);
      chat.admins = chat.admins.filter((id) => id !== me);
      await chat.save();
      await emitChatToMembers(chat);
      await emitChats(me);
      return res.json({ ok: true });
    }
    if (chat.type !== 'group' || !chat.admins.includes(me)) {
      return error(res, 403, 'Only group admins can edit this chat.');
    }
    if (req.body.name) {
      chat.name = String(req.body.name).trim();
    }
    if (req.body.avatar !== undefined) {
      chat.avatar = String(req.body.avatar);
    }
    if (Array.isArray(req.body.members)) {
      chat.members = req.body.members.map(String);
    }
    if (Array.isArray(req.body.admins)) {
      chat.admins = req.body.admins.map(String);
    }
    await chat.save();
    if (req.body.system) {
      await sendMessage({
        chat,
        senderId: me,
        type: 'system',
        text: String(req.body.system),
        clientId: `sys-${Date.now()}`,
      });
    } else {
      await emitChatToMembers(chat);
    }
    res.json({ chat: publicChat(chat) });
  });

  app.get('/api/chats/:id/messages/latest', auth, requireActive, memberChat, async (req, res) => {
    const msg = await Message.findOne({ chatId: String(req.chat._id) }).sort({ createdAt: -1 });
    res.json({ message: msg ? publicMessage(msg) : null });
  });

  app.get('/api/admin/pending', auth, requireAdmin, async (_req, res) => {
    const users = await User.find({ status: 'pending' }).sort({ createdAt: -1 });
    res.json({ users: users.map(publicUser) });
  });

  app.get('/api/admin/users', auth, requireAdmin, async (_req, res) => {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ users: users.map(publicUser) });
  });

  app.get('/api/admin/groups', auth, requireAdmin, async (_req, res) => {
    const groups = await Chat.find({ type: 'group' }).sort({ updatedAt: -1 });
    res.json({ groups: groups.map(publicChat) });
  });

  app.get('/api/admin/stats', auth, requireAdmin, async (_req, res) => {
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

  app.get('/api/admin/audit', auth, requireAdmin, async (_req, res) => {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(50);
    res.json({ logs: logs.map(publicAudit) });
  });

  app.get('/api/admin/settings', auth, requireAdmin, async (_req, res) => {
    const settings = await getSettings();
    res.json({
      inviteCode: settings.inviteCode,
      registrationOpen: settings.registrationOpen,
    });
  });

  app.patch('/api/admin/settings', auth, requireAdmin, async (req, res) => {
    const settings = await getSettings();
    if (req.body.inviteCode) {
      settings.inviteCode = String(req.body.inviteCode).trim();
    }
    if (req.body.registrationOpen !== undefined) {
      settings.registrationOpen = Boolean(req.body.registrationOpen);
    }
    await settings.save();
    await audit(String(req.user._id), 'update_settings', 'settings/app', {
      inviteCode: settings.inviteCode,
      registrationOpen: String(settings.registrationOpen),
    });
    res.json({
      inviteCode: settings.inviteCode,
      registrationOpen: settings.registrationOpen,
    });
  });

  app.post('/api/admin/users/:id/approve', auth, requireAdmin, async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
      return error(res, 404, 'User not found.');
    }
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

  app.post('/api/admin/users/:id/reject', auth, requireAdmin, async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
      return error(res, 404, 'User not found.');
    }
    user.status = 'disabled';
    await user.save();
    emitProfile(user);
    await audit(String(req.user._id), 'reject_user', String(user._id), { name: user.name });
    res.json({ user: publicUser(user) });
  });

  app.post('/api/admin/users/:id/status', auth, requireAdmin, async (req, res) => {
    if (String(req.user._id) === req.params.id) {
      return error(res, 400, 'You cannot change your own status.');
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return error(res, 404, 'User not found.');
    }
    const status = req.body.status === 'disabled' ? 'disabled' : 'active';
    user.status = status;
    await user.save();
    emitProfile(user);
    await audit(String(req.user._id), status === 'disabled' ? 'disable_user' : 'enable_user', String(user._id), {});
    res.json({ user: publicUser(user) });
  });

  app.post('/api/admin/users/:id/role', auth, requireAdmin, async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
      return error(res, 404, 'User not found.');
    }
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    if (role === 'user' && user.role === 'admin') {
      const count = await User.countDocuments({ role: 'admin' });
      if (count <= 1) {
        return error(res, 400, 'The last admin cannot be demoted.');
      }
    }
    user.role = role;
    await user.save();
    emitProfile(user);
    await audit(String(req.user._id), role === 'admin' ? 'promote_admin' : 'demote_admin', String(user._id), {});
    res.json({ user: publicUser(user) });
  });

  app.post('/api/admin/users/:id/delete', auth, requireAdmin, async (req, res) => {
    if (String(req.user._id) === req.params.id) {
      return error(res, 400, 'You cannot delete your own account.');
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return error(res, 404, 'User not found.');
    }
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

  app.delete('/api/admin/groups/:id', auth, requireAdmin, async (req, res) => {
    const chat = await Chat.findById(req.params.id);
    if (!chat || chat.type !== 'group') {
      return error(res, 404, 'Group not found.');
    }
    const members = [...chat.members];
    await Message.deleteMany({ chatId: String(chat._id) });
    await Chat.deleteOne({ _id: chat._id });
    for (const uid of members) {
      await emitChats(uid);
    }
    await audit(String(req.user._id), 'delete_group', String(chat._id), { name: chat.name });
    res.json({ ok: true });
  });

  app.post('/api/admin/broadcast', auth, requireAdmin, async (req, res) => {
    const text = String(req.body.text || '').trim();
    if (!text) {
      return error(res, 400, 'Message is required.');
    }
    const actives = await User.find({ status: 'active' });
    const memberIds = actives.map((u) => String(u._id));
    let chat = await Chat.findById(ANNOUNCEMENTS);
    const unread = {};
    for (const id of memberIds) {
      unread[id] = 0;
    }
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
}

module.exports = { mountRoutes };
