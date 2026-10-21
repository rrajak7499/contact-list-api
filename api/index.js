const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rrajak8806_db_user:CLrNapjCVuipXpqz@cluster0.s3h68ti.mongodb.net/my_school_db";

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

app.get(['/', '/api'], (req, res) => res.json({ status: 'active', database: 'MongoDB Atlas: my_school_db' }));

// User Profile Sync
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

// GET Formats by User ID
app.get(['/formats', '/api/formats'], async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: "userId query param required" });
    const formats = await Format.find({ $or: [{ userId }, { isDefault: true }] });
    res.json(formats);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync Formats
app.post(['/formats', '/api/formats'], async (req, res) => {
  try {
    const rawFormats = Array.isArray(req.body.formats || req.body) ? (req.body.formats || req.body) : [req.body];
    for (const fmt of rawFormats) {
      if (fmt && fmt.formatId) {
        await Format.findOneAndUpdate(
          { formatId: fmt.formatId, userId: fmt.userId },
          { ...fmt, updatedAt: new Date() },
          { upsert: true }
        );
      }
    }
    res.json({ success: true, count: rawFormats.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE Format by User ID
app.delete(['/formats/:formatId', '/api/formats/:formatId'], async (req, res) => {
  try {
    const { formatId } = req.params;
    const { userId } = req.query;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized. userId required" });

    const deletedFormat = await Format.findOneAndDelete({ formatId: Number(formatId), userId });
    await Entry.deleteMany({ formatId: Number(formatId), userId });

    res.json({ success: true, deleted: !!deletedFormat });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET Entries by User ID
app.get(['/entries', '/api/entries'], async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ success: false, error: "userId query param required" });
    const entries = await Entry.find({ userId });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sync Entries
app.post(['/entries', '/api/entries'], async (req, res) => {
  try {
    const rawEntries = Array.isArray(req.body.entries || req.body) ? (req.body.entries || req.body) : [req.body];
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
    res.json({ success: true, count: rawEntries.length, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE Entry by User ID
app.delete(['/entries/:entryId', '/api/entries/:entryId'], async (req, res) => {
  try {
    const { entryId } = req.params;
    const { userId } = req.query;
    if (!userId) return res.status(401).json({ success: false, error: "Unauthorized. userId required" });

    const deletedEntry = await Entry.findOneAndDelete({ entryId: Number(entryId), userId });
    res.json({ success: true, deleted: !!deletedEntry });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = app;
