const mongoose = require('mongoose');

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

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;
