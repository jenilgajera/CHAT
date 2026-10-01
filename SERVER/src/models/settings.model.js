const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  _id: { type: String },
  inviteCode: { type: String, default: 'FRIENDS' },
  registrationOpen: { type: Boolean, default: true },
  messageCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
});

const Settings = mongoose.model('Settings', settingsSchema);
module.exports = Settings;
