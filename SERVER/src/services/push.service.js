const admin = require('firebase-admin');

let messaging = null;

function getMessaging() {
  if (messaging) return messaging;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const serviceAccount = JSON.parse(raw);
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    messaging = admin.messaging();
    return messaging;
  } catch (err) {
    console.error('Firebase push is disabled:', err.message);
    return null;
  }
}

async function notifyChatMembers({ chat, senderId, text, type }) {
  const service = getMessaging();
  if (!service) return;
  try {
    const { User } = require('../models');
    const members = await User.find({
      _id: { $in: chat.members.filter((id) => id !== senderId) },
      status: 'active',
      fcmTokens: { $exists: true, $ne: [] },
    }).select('fcmTokens name');
    const tokens = [...new Set(members.flatMap((user) => user.fcmTokens || []))].filter(Boolean);
    if (!tokens.length) return;
    const response = await service.sendEachForMulticast({
      tokens,
      notification: {
        title: chat.name || 'New message',
        body: type === 'image' ? text || 'Photo' : text || 'New message',
      },
      data: { chatId: String(chat._id), type: String(type || 'text') },
      android: { priority: 'high', notification: { channelId: 'friends-chat-messages' } },
    });
    if (response.failureCount) {
      console.warn(`Firebase push: ${response.failureCount} notification(s) failed.`);
    }
  } catch (err) {
    console.error('Firebase push failed:', err.message);
  }
}

module.exports = { notifyChatMembers };
