const express = require('express');
const { randomUUID } = require('crypto');
const { Chat, Message, User } = require('../models');
const { publicChat, publicMessage, error } = require('../utils/serialize');
const { requireActive, memberChat } = require('../middleware/auth.middleware');
const { emitChatToMembers, emitChats } = require('../realtime/socket');
const { sendMessage, PAGE_SIZE } = require('../utils/helpers');

const router = express.Router();

// GET /api/chats
router.get('/', requireActive, async (req, res) => {
  const chats = await Chat.find({ members: String(req.user._id) }).sort({ updatedAt: -1 });
  res.json({ chats: chats.map(publicChat) });
});

// POST /api/chats/private
router.post('/private', requireActive, async (req, res) => {
  const otherId = String(req.body.otherId || '');
  const me = String(req.user._id);
  if (!otherId || otherId === me) return error(res, 400, 'Pick someone to chat with.');
  const other = await User.findById(otherId);
  if (!other || other.status !== 'active') return error(res, 404, 'User not found.');
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

// POST /api/chats/groups
router.post('/groups', requireActive, async (req, res) => {
  const me = String(req.user._id);
  const name = String(req.body.name || '').trim();
  const memberIds = Array.isArray(req.body.memberIds) ? req.body.memberIds.map(String) : [];
  if (!name) return error(res, 400, 'Group name is required.');
  const members = Array.from(new Set([me, ...memberIds]));
  if (members.length < 2) return error(res, 400, 'A group needs at least two people.');
  const unread = {};
  for (const id of members) unread[id] = 0;
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

// GET /api/chats/:id
router.get('/:id', requireActive, memberChat, (req, res) => {
  res.json({ chat: publicChat(req.chat) });
});

// GET /api/chats/:id/messages/latest  — must be before /:id/messages
router.get('/:id/messages/latest', requireActive, memberChat, async (req, res) => {
  const msg = await Message.findOne({ chatId: String(req.chat._id) }).sort({ createdAt: -1 });
  res.json({ message: msg ? publicMessage(msg) : null });
});

// GET /api/chats/:id/messages
router.get('/:id/messages', requireActive, memberChat, async (req, res) => {
  const before = req.query.before ? String(req.query.before) : '';
  const limit = Math.min(Number(req.query.limit) || PAGE_SIZE, 50);
  const filter = { chatId: String(req.chat._id) };
  if (before) {
    const cursor = await Message.findById(before);
    if (cursor) filter.createdAt = { $lt: cursor.createdAt };
  }
  const docs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit);
  const messages = docs.map(publicMessage).reverse();
  const oldestId = docs.length ? String(docs[docs.length - 1]._id) : null;
  res.json({ messages, oldestId });
});

// POST /api/chats/:id/messages
router.post('/:id/messages', requireActive, memberChat, async (req, res) => {
  try {
    const payload = await sendMessage({
      chat: req.chat,
      senderId: String(req.user._id),
      type:
        req.body.type === 'image' ? 'image' : req.body.type === 'system' ? 'system' : 'text',
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

// POST /api/chats/:id/read
router.post('/:id/read', requireActive, memberChat, async (req, res) => {
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

// POST /api/chats/:id/delivered
router.post('/:id/delivered', requireActive, memberChat, async (req, res) => {
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

// POST /api/chats/:id/messages/:mid/delete-me
router.post('/:id/messages/:mid/delete-me', requireActive, memberChat, async (req, res) => {
  const msg = await Message.findOne({ _id: req.params.mid, chatId: String(req.chat._id) });
  if (!msg) return error(res, 404, 'Message not found.');
  await Message.updateOne({ _id: msg._id }, { $addToSet: { deletedFor: String(req.user._id) } });
  res.json({ ok: true });
});

// POST /api/chats/:id/messages/:mid/delete-all
router.post('/:id/messages/:mid/delete-all', requireActive, memberChat, async (req, res) => {
  const { emitMessage } = require('../realtime/socket');
  const msg = await Message.findOne({ _id: req.params.mid, chatId: String(req.chat._id) });
  if (!msg) return error(res, 404, 'Message not found.');
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

// PATCH /api/chats/:id
router.patch('/:id', requireActive, memberChat, async (req, res) => {
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
  if (req.body.name) chat.name = String(req.body.name).trim();
  if (req.body.avatar !== undefined) chat.avatar = String(req.body.avatar);
  if (Array.isArray(req.body.members)) chat.members = req.body.members.map(String);
  if (Array.isArray(req.body.admins)) chat.admins = req.body.admins.map(String);
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

module.exports = router;
