const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rrajak8806_db_user:CLrNapjCVuipXpqz@cluster0.s3h68ti.mongodb.net/my_school_db";

// Serverless Mongoose connection caching
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000
    }).then((mongooseInstance) => mongooseInstance);
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("DB Connection Error:", err);
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

// 1. Health Check
app.get(['/', '/api'], (req, res) => res.json({ status: 'active', database: 'MongoDB Atlas: my_school_db' }));

// 2. Sync Users Route
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
    console.error("User sync error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Sync Formats Route
app.post(['/formats', '/api/formats'], async (req, res) => {
  try {
    const rawFormats = Array.isArray(req.body) ? req.body : [req.body];
    if (rawFormats.length === 0) return res.json({ success: true, count: 0 });

    const bulkOps = rawFormats.map(fmt => ({
      updateOne: {
        filter: { formatId: Number(fmt.formatId), userId: String(fmt.userId) },
        update: { $set: { ...fmt, updatedAt: new Date() } },
        upsert: true
      }
    }));
    const result = await Format.bulkWrite(bulkOps);
    res.json({ success: true, count: rawFormats.length, result });
  } catch (err) {
    console.error("Formats sync error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Sync Entries Route
app.post(['/entries', '/api/entries'], async (req, res) => {
  try {
    const rawEntries = Array.isArray(req.body) ? req.body : [req.body];
    if (rawEntries.length === 0) return res.json({ success: true, count: 0 });

    const bulkOps = rawEntries.map(ent => ({
      updateOne: {
        filter: { entryId: Number(ent.entryId), userId: String(ent.userId) },
        update: {
          $set: {
            entryId: Number(ent.entryId),
            formatId: Number(ent.formatId),
            userId: String(ent.userId),
            valuesJson: typeof ent.valuesJson === 'string' ? ent.valuesJson : JSON.stringify(ent.valuesJson || {}),
            isCalled: Boolean(ent.isCalled),
            updatedAt: new Date()
          }
        },
        upsert: true
      }
    }));

    const result = await Entry.bulkWrite(bulkOps);
    res.json({
      success: true,
      count: rawEntries.length,
      upserted: result.upsertedCount,
      modified: result.modifiedCount
    });
  } catch (err) {
    console.error("Entries sync error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;
