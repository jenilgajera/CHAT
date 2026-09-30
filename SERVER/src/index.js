require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { mountRoutes } = require('./routes');
const { attachSockets } = require('./realtime');

const PORT = Number(process.env.PORT || 3000);
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const origins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

if (!MONGO_URI || !JWT_SECRET) {
  console.error('Set MONGO_URI and JWT_SECRET in the environment.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGO_URI);
  const app = express();
  app.use(
    cors({
      origin: origins.length ? origins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));

  mountRoutes(app, JWT_SECRET);

  const publicDir = path.join(__dirname, '../../app/www');
  app.use(express.static(publicDir));
  app.get(/^(?!\/api\/).*/, (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) {
        next();
      }
    });
  });

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: origins.length ? origins : true, credentials: true },
  });
  attachSockets(io, JWT_SECRET);

  server.listen(PORT, () => {
    console.log(`Friends Chat API listening on ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
