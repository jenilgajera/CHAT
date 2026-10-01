require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { connectDB } = require('./config/db');
const { attachSockets } = require('./realtime/socket');
const { requireAuth } = require('./middleware/auth.middleware');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const chatRoutes = require('./routes/chat.routes');
const adminRoutes = require('./routes/admin.routes');

const PORT = Number(process.env.PORT || 3000);
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

const origins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const localAppOrigins = new Set([
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
]);

if (!MONGO_URI || !JWT_SECRET) {
  console.error('Set MONGO_URI and JWT_SECRET in the environment.');
  process.exit(1);
}

async function main() {
  await connectDB(MONGO_URI);

  const app = express();

  // CORS
  const corsOptions = {
    origin: (requestOrigin, callback) => {
      if (!requestOrigin || !origins.length || origins.includes(requestOrigin) || localAppOrigins.has(requestOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  };
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.use(express.json({ limit: '2mb' }));

  // Health check
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Auth routes (login/register don't need auth middleware)
  app.use('/api/auth', (req, _res, next) => {
    req.jwtSecret = JWT_SECRET;
    next();
  }, authRoutes(JWT_SECRET));

  // Protected routes
  const auth = requireAuth(JWT_SECRET);
  app.use('/api/users', auth, userRoutes);
  app.use('/api/chats', auth, chatRoutes);
  app.use('/api/admin', auth, adminRoutes);

  // Serve frontend static files
  const publicDir = path.join(__dirname, '../../app/www');
  app.use(express.static(publicDir));
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) next();
    });
  });

  // Socket.IO
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: origins.length ? origins : true, credentials: true },
  });
  attachSockets(io, JWT_SECRET);

  server.listen(PORT, () => {
    console.log(`Friends Chat API listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
