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

const User = mongoose.model('User', userSchema);
module.exports = User;
