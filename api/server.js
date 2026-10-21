const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://rrajak8806_db_user:CLrNapjCVuipXpqz@cluster0.s3h68ti.mongodb.net/my_school_db";

mongoose.connect(MONGODB_URI)
  .then(() => console.log("Connected to MongoDB Atlas: my_school_db"))
  .catch(err => console.error("MongoDB Connection Error:", err));

// Schemas
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

const User = mongoose.model('User', UserSchema);
const Format = mongoose.model('Format', FormatSchema);
const Entry = mongoose.model('Entry', EntrySchema);

// Ping / Health Check
app.get('/', (req, res) => res.json({ status: 'active', database: 'MongoDB Atlas: my_school_db' }));

// User Profile Sync
app.post('/api/users', async (req, res) => {
  try {
    const { userId, displayName, email, photoUrl } = req.body;
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

// Formats Sync
app.post('/api/formats', async (req, res) => {
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

// Entries Sync
app.post('/api/entries', async (req, res) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
