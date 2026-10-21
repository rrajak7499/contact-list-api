const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rrajak8806_db_user:CLrNapjCVuipXpqz@cluster0.s3h68ti.mongodb.net/my_school_db";

let isConnected = false;

async function connectDB() {
  if (isConnected && mongoose.connection.readyState === 1) return;
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    isConnected = true;
    console.log("Connected to MongoDB Atlas: my_school_db");
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    throw err;
  }
}

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Schemas & Models
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  displayName: String,
  email: String,
  photoUrl: String,
  updatedAt: { type: Date, default: Date.now }
});

const FormatSchema = new mongoose.Schema({
  formatId: Number,
  userId: String,
  title: String,
  isDefault: Boolean,
  updatedAt: { type: Date, default: Date.now }
});

const EntrySchema = new mongoose.Schema({
  entryId: Number,
  formatId: Number,
  userId: String,
  valuesJson: String,
  isCalled: Boolean,
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Format = mongoose.models.Format || mongoose.model('Format', FormatSchema);
const Entry = mongoose.models.Entry || mongoose.model('Entry', EntrySchema);

app.get(['/', '/api'], (req, res) => res.json({ status: 'active', database: 'MongoDB Atlas: my_school_db' }));

// User Profile Sync (Supports both /users and /api/users)
app.post(['/users', '/api/users'], async (req, res) => {
  try {
    const { userId, displayName, email, photoUrl } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: "userId is required" });
    const user = await User.findOneAndUpdate(
      { userId },
      { displayName, email, photoUrl, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Formats Sync (Supports both /formats and /api/formats)
app.post(['/formats', '/api/formats'], async (req, res) => {
  try {
    const formats = Array.isArray(req.body) ? req.body : [req.body];
    for (const fmt of formats) {
      await Format.findOneAndUpdate(
        { formatId: fmt.formatId, userId: fmt.userId },
        { ...fmt, updatedAt: new Date() },
        { upsert: true }
      );
    }
    res.json({ success: true, count: formats.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Entries Sync (Supports both /entries and /api/entries)
app.post(['/entries', '/api/entries'], async (req, res) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : [req.body];
    for (const ent of entries) {
      await Entry.findOneAndUpdate(
        { entryId: ent.entryId, userId: ent.userId },
        { ...ent, updatedAt: new Date() },
        { upsert: true }
      );
    }
    res.json({ success: true, count: entries.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;
