const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['pending', 'active', 'disabled'], default: 'pending' },
    about: { type: String, default: 'Hey there! I am using Friends Chat.' },
    avatar: { type: String, default: '' },
    lastSeen: { type: Date, default: null },
    fcmTokens: { type: [String], default: [] },
    mutedChats: { type: [String], default: [] },
    theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
  },
  { timestamps: true },
);

const chatSchema = new mongoose.Schema(
  {
    _id: { type: String },
    type: { type: String, enum: ['private', 'group', 'broadcast'], required: true },
    name: { type: String, default: '' },
    avatar: { type: String, default: '' },
    members: { type: [String], default: [] },
    admins: { type: [String], default: [] },
    lastMessage: {
      type: {
        text: String,
        type: { type: String },
        senderId: String,
        at: Date,
      },
      default: null,
    },
    unread: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

chatSchema.index({ members: 1, updatedAt: -1 });

const messageSchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    type: { type: String, enum: ['text', 'image', 'system'], required: true },
    text: { type: String, default: '' },
    image: { type: String, default: '' },
    replyTo: {
      type: { id: String, text: String, senderName: String },
      default: null,
    },
    deliveredTo: { type: [String], default: [] },
    readBy: { type: [String], default: [] },
    deletedFor: { type: [String], default: [] },
    deletedForAll: { type: Boolean, default: false },
    clientId: { type: String, default: '' },
  },
  { timestamps: true },
);

messageSchema.index({ chatId: 1, createdAt: -1 });

const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String },
    inviteCode: { type: String, default: 'FRIENDS' },
    registrationOpen: { type: Boolean, default: true },
    messageCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
);

const auditSchema = new mongoose.Schema(
  {
    adminId: String,
    action: String,
    targetId: String,
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const User = mongoose.model('User', userSchema);
const Chat = mongoose.model('Chat', chatSchema);
const Message = mongoose.model('Message', messageSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const AuditLog = mongoose.model('AuditLog', auditSchema);

module.exports = { User, Chat, Message, Settings, AuditLog };
