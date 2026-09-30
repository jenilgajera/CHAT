const jwt = require('jsonwebtoken');
const { User, Chat } = require('./models');
const { publicChat, publicUser } = require('./serialize');

let ioRef = null;

function setIo(io) {
  ioRef = io;
}

function io() {
  return ioRef;
}

function userRoom(uid) {
  return `user:${uid}`;
}

function chatRoom(chatId) {
  return `chat:${chatId}`;
}

async function emitChats(uid) {
  if (!ioRef) {
    return;
  }
  const chats = await Chat.find({ members: uid }).sort({ updatedAt: -1 });
  ioRef.to(userRoom(uid)).emit(
    'chats:updated',
    chats.map((c) => publicChat(c)),
  );
}

async function emitChatToMembers(chat) {
  if (!ioRef || !chat) {
    return;
  }
  const payload = publicChat(chat);
  for (const uid of chat.members || []) {
    ioRef.to(userRoom(uid)).emit('chat:updated', payload);
    await emitChats(uid);
  }
  ioRef.to(chatRoom(String(chat._id))).emit('chat:updated', payload);
}

function emitMessage(chat, message) {
  if (!ioRef) {
    return;
  }
  ioRef.to(chatRoom(String(chat._id))).emit('message:new', {
    chatId: String(chat._id),
    message,
  });
}

function emitProfile(user) {
  if (!ioRef || !user) {
    return;
  }
  ioRef.to(userRoom(String(user._id))).emit('profile', publicUser(user));
}

function attachSockets(io, jwtSecret) {
  setIo(io);
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Unauthorized'));
      }
      const payload = jwt.verify(String(token), jwtSecret);
      const user = await User.findById(payload.sub);
      if (!user) {
        return next(new Error('Unauthorized'));
      }
      socket.user = user;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const uid = String(socket.user._id);
    socket.join(userRoom(uid));

    socket.on('join:chat', async (chatId, ack) => {
      const chat = await Chat.findById(String(chatId));
      if (!chat || !chat.members.includes(uid) || socket.user.status !== 'active') {
        if (typeof ack === 'function') {
          ack({ ok: false });
        }
        return;
      }
      socket.join(chatRoom(String(chatId)));
      if (typeof ack === 'function') {
        ack({ ok: true });
      }
    });

    socket.on('leave:chat', (chatId) => {
      socket.leave(chatRoom(String(chatId)));
    });

    socket.on('typing', async (chatId) => {
      const chat = await Chat.findById(String(chatId));
      if (!chat || !chat.members.includes(uid)) {
        return;
      }
      socket.to(chatRoom(String(chatId))).emit('typing', { chatId: String(chatId), uid });
    });
  });
}

module.exports = {
  attachSockets,
  emitChats,
  emitChatToMembers,
  emitMessage,
  emitProfile,
  io,
};
