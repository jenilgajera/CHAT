const mongoose = require('mongoose');

async function connectDB(uri) {
  await mongoose.connect(uri);
  console.log('MongoDB connected successfully.');
}

module.exports = { connectDB };
