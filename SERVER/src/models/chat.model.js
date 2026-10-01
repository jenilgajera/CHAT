const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    _id: { type: String },
    type: { type: String, enum: ['private', 'group', 'broadcast'], required: true },
    name: { type: String, default: '' },
    avatar: { type: String, default: '' },
    members: { type: [String], default: [] },
    admins: { type: [String], default: [] },
    lastMessage: {
      text: String,
      type: { type: String },
      senderId: String,
      at: Date,
    },
    unread: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

chatSchema.index({ members: 1, updatedAt: -1 });

const Chat = mongoose.model('Chat', chatSchema);
module.exports = Chat;
