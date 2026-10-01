const { randomUUID } = require('crypto');
const { Settings, Message, Chat, User } = require('../models');
const { publicMessage, publicChat } = require('./serialize');
const { emitMessage, emitChatToMembers } = require('../realtime/socket');

const MAX_IMAGE = 150000;
const ANNOUNCEMENTS = 'announcements';
const PAGE_SIZE = 30;

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

async function bumpDaily() {
  const settings = await getSettings();
  const day = new Date().toISOString().slice(0, 10);
  const counts = settings.messageCounts || {};
  counts[day] = Number(counts[day] || 0) + 1;
  settings.messageCounts = counts;
  settings.markModified('messageCounts');
  await settings.save();
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

module.exports = { getSettings, bumpDaily, sendMessage, MAX_IMAGE, ANNOUNCEMENTS, PAGE_SIZE };
