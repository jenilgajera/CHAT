function iso(d) {
  if (!d) return null;
  return new Date(d).toISOString();
}

function publicUser(user) {
  if (!user) return null;
  const id = String(user._id);
  return {
    uid: id,
    id,
    name: user.name,
    username: user.username,
    role: user.role,
    status: user.status,
    about: user.about || '',
    avatar: user.avatar || '',
    lastSeen: iso(user.lastSeen),
    createdAt: iso(user.createdAt),
    fcmTokens: user.fcmTokens || [],
    mutedChats: user.mutedChats || [],
    theme: user.theme || 'system',
  };
}

function publicChat(chat) {
  const unread = chat.unread && typeof chat.unread === 'object' ? chat.unread : {};
  return {
    id: String(chat._id),
    type: chat.type,
    name: chat.name || '',
    avatar: chat.avatar || '',
    members: chat.members || [],
    admins: chat.admins || [],
    lastMessage: chat.lastMessage
      ? {
          text: chat.lastMessage.text || '',
          type: chat.lastMessage.type || 'text',
          senderId: chat.lastMessage.senderId || '',
          at: iso(chat.lastMessage.at),
        }
      : null,
    unread,
    createdAt: iso(chat.createdAt),
    updatedAt: iso(chat.updatedAt),
  };
}

function publicMessage(msg) {
  return {
    id: String(msg._id),
    senderId: msg.senderId,
    type: msg.type,
    text: msg.deletedForAll ? '' : msg.text || '',
    image: msg.deletedForAll ? '' : msg.image || '',
    replyTo: msg.replyTo || null,
    createdAt: iso(msg.createdAt),
    deliveredTo: msg.deliveredTo || [],
    readBy: msg.readBy || [],
    deletedFor: msg.deletedFor || [],
    deletedForAll: Boolean(msg.deletedForAll),
    clientId: msg.clientId || String(msg._id),
  };
}

function publicAudit(log) {
  return {
    id: String(log._id),
    adminId: log.adminId,
    action: log.action,
    targetId: log.targetId,
    meta: log.meta || {},
    createdAt: iso(log.createdAt),
  };
}

function error(res, status, message) {
  return res.status(status).json({ error: message });
}

module.exports = { publicUser, publicChat, publicMessage, publicAudit, error, iso };
