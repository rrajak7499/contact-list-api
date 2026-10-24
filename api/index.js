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
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000
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

// Database Connection Middleware
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
    res.status(500).json({ success: false, error: "Database connection error: " + err.message });
  }
});

// Helper function to compare semantic version strings (returns true if v1 < v2)
function isVersionLower(v1, v2) {
  try {
    const p1 = String(v1 || '').replace(/v/gi, '').split('.').map(n => parseInt(n.trim(), 10) || 0);
    const p2 = String(v2 || '').replace(/v/gi, '').split('.').map(n => parseInt(n.trim(), 10) || 0);
    const maxLen = Math.max(p1.length, p2.length);
    for (let i = 0; i < maxLen; i++) {
      const c1 = p1[i] || 0;
      const c2 = p2[i] || 0;
      if (c1 < c2) return true;
      if (c1 > c2) return false;
    }
    return false;
  } catch (e) {
    return false;
  }
}

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
  sharedWith: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now }
});

const EntrySchema = new mongoose.Schema({
  entryId: Number,
  formatId: Number,
  userId: String,
  valuesJson: String,
  isCalled: Boolean,
  sharedWith: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now }
});

const AboutSchema = new mongoose.Schema({
  title: { type: String, default: "Student Directory App" },
  version: { type: String, default: "v1.0.0" },
  description: { type: String, default: "A modern, offline-first mobile solution for managing student contact records, dynamic form formats, and cloud sync." },
  features: { type: [String], default: ["Dynamic N-Section Form Builder", "Cloud Database Sync", "Caller ID Pop-Up", "Strict 10-Digit Phone Validation", "PDF Report Generation"] },
  contactEmail: { type: String, default: "rrajak7499@gmail.com" },
  donateUs: { type: String, default: "caneraupi@ybl" }
});

// Announcement Schema
const AnnouncementSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  title: { type: String, default: "" },
  message: { type: String, default: "" },
  buttonText: { type: String, default: "Got It" },
  actionUrl: { type: String, default: "" },
  minAppVersion: { type: mongoose.Schema.Types.Mixed, default: "1.0.0" },
  minVersionName: { type: String, default: "1.0.0" },
  latestAppVersion: { type: mongoose.Schema.Types.Mixed, default: "1.0.0" },
  latestVersionName: { type: String, default: "1.0.0" },
  forceUpdate: { type: Boolean, default: false },
  updateUrl: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Format = mongoose.models.Format || mongoose.model('Format', FormatSchema);
const Entry = mongoose.models.Entry || mongoose.model('Entry', EntrySchema);
const About = mongoose.models.About || mongoose.model('About', AboutSchema);
const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', AnnouncementSchema);

// Universal Master Handler for Vercel Serverless Function Routing
app.all('*', async (req, res) => {
  const method = req.method.toUpperCase();
  const urlPath = req.path || req.url || '';
  const body = req.body || {};
  const query = req.query || {};
  const action = body.action || query.action || '';

  // 1. HEALTH PING
  if (method === 'GET' && action === 'ping') {
    return res.json({ status: 'active', database: 'MongoDB Atlas: my_school_db' });
  }

  // 2. READ OPERATIONS
  if (method === 'GET') {
    if (action === 'getAnnouncement' || urlPath.includes('announcement')) {
      const clientVersion = String(query.clientVersion || query.version || '1.0.1').trim();

      // 1. Check if there is an active FORCED UPDATE document for clients running an OUTDATED version
      const allForcedUpdates = await Announcement.find({ forceUpdate: true }).sort({ _id: -1 });
      let announcementData = allForcedUpdates.find(a => {
        const minVer = String(a.minAppVersion || a.minVersionName || '').trim();
        return minVer && isVersionLower(clientVersion, minVer);
      });

      // 2. If client is up-to-date (clientVersion >= minAppVersion), fetch active general announcement (enabled: true, forceUpdate: false)
      if (!announcementData) {
        announcementData = await Announcement.findOne({ enabled: true, forceUpdate: false }).sort({ _id: -1 });
      }

      // 3. Fallback to any enabled announcement document
      if (!announcementData) {
        announcementData = await Announcement.findOne({ enabled: true }).sort({ _id: -1 });
      }

      // 4. Fallback to latest document
      if (!announcementData) {
        announcementData = await Announcement.findOne({}).sort({ _id: -1 });
      }

      // If no announcement document exists in DB at all, return disabled state cleanly
      if (!announcementData) {
        return res.json({
          enabled: false,
          title: "",
          message: "",
          buttonText: "Got It",
          actionUrl: "",
          minAppVersion: 1,
          minVersionName: "1.0.0",
          latestAppVersion: 1,
          latestVersionName: "1.0.0",
          forceUpdate: false,
          updateUrl: ""
        });
      }

      const rawMin = announcementData.minAppVersion || announcementData.minVersionName || "";
      const minVersionStr = String(rawMin).trim();
      const minVersionInt = parseInt(minVersionStr, 10) || 1;

      return res.json({
        enabled: Boolean(announcementData.enabled),
        title: announcementData.title || "",
        message: announcementData.message || "",
        buttonText: announcementData.buttonText || "Got It",
        actionUrl: announcementData.actionUrl || "",
        minAppVersion: minVersionInt,
        minVersionName: minVersionStr,
        latestAppVersion: Number(announcementData.latestAppVersion) || 1,
        latestVersionName: String(announcementData.latestVersionName || announcementData.latestAppVersion || ""),
        forceUpdate: Boolean(announcementData.forceUpdate),
        updateUrl: announcementData.updateUrl || announcementData.actionUrl || ""
      });
    }

    if (action === 'getAbout' || urlPath.includes('about')) {
      let aboutData = await About.findOne();
      if (!aboutData) {
        aboutData = await About.create({});
      }
      return res.json(aboutData);
    }

    // GET SHARED FORMATS
    if (action === 'getSharedFormats') {
      const email = (query.email || query.userId || body.email || body.userId || '').toLowerCase().trim();
      if (!email) return res.status(400).json({ success: false, error: "email parameter required" });

      const sharedEntries = await Entry.find({ sharedWith: email });
      const sharedFormatIds = sharedEntries.map(e => Number(e.formatId));

      const sharedFormats = await Format.find({
        $or: [
          { sharedWith: email },
          { formatId: { $in: sharedFormatIds } }
        ]
      });
      return res.json({ success: true, count: sharedFormats.length, formats: sharedFormats });
    }

    // GET SHARED ENTRIES
    if (action === 'getSharedEntries') {
      const email = (query.email || query.userId || body.email || body.userId || '').toLowerCase().trim();
      if (!email) return res.status(400).json({ success: false, error: "email parameter required" });
      const sharedEntries = await Entry.find({ sharedWith: email });
      return res.json({ success: true, count: sharedEntries.length, entries: sharedEntries });
    }

    // GET OWNED & SHARED FORMATS
    if (urlPath.includes('formats') || action === 'getFormats') {
      const userId = (query.userId || body.userId || '').trim();
      const email = (query.email || body.email || userId).toLowerCase().trim();
      if (!userId && !email) return res.status(400).json({ success: false, error: "userId or email query parameter required" });

      const formats = await Format.find({
        $or: [
          { userId: userId },
          { userId: email },
          { sharedWith: email },
          { isDefault: true }
        ]
      });
      return res.json({ success: true, count: formats.length, formats });
    }

    // GET OWNED & SHARED ENTRIES
    if (urlPath.includes('entries') || action === 'getEntries') {
      const userId = (query.userId || body.userId || '').trim();
      const email = (query.email || body.email || userId).toLowerCase().trim();
      if (!userId && !email) return res.status(400).json({ success: false, error: "userId or email query parameter required" });

      const entries = await Entry.find({
        $or: [
          { userId: userId },
          { userId: email },
          { sharedWith: email }
        ]
      });
      return res.json({ success: true, count: entries.length, entries });
    }

    if (urlPath.includes('users') || action === 'getUsers') {
      const userId = query.userId || body.userId;
      if (!userId) return res.status(400).json({ success: false, error: "userId query parameter required" });
      const user = await User.findOne({ userId });
      return res.json({ success: true, user });
    }

    if (urlPath === '/' || urlPath === '/api') {
      return res.json({ status: 'active', database: 'MongoDB Atlas: my_school_db' });
    }
  }

  // 3. USER-AUTHENTICATED DELETE OPERATIONS
  if (method === 'DELETE' || action === 'deleteFormat' || action === 'deleteEntry') {
    if (action === 'deleteFormat' || urlPath.includes('formats')) {
      const formatId = query.formatId !== undefined ? query.formatId : body.formatId;
      if (formatId === undefined || formatId === null) return res.status(400).json({ success: false, error: "formatId required" });

      const deletedFormat = await Format.findOneAndDelete({ formatId: Number(formatId) });
      await Entry.deleteMany({ formatId: Number(formatId) });
      return res.json({ success: true, deleted: !!deletedFormat });
    }

    if (action === 'deleteEntry' || urlPath.includes('entries')) {
      const entryId = query.entryId !== undefined ? query.entryId : body.entryId;
      if (entryId === undefined || entryId === null) return res.status(400).json({ success: false, error: "entryId required" });

      const deletedEntry = await Entry.findOneAndDelete({ entryId: Number(entryId) });
      return res.json({ success: true, deleted: !!deletedEntry });
    }
  }

  // 4. CREATE, UPDATE, SHARING & REVOCATION OPERATIONS
  if (method === 'POST' || method === 'PUT') {
    // Share Entire Format with Target Email
    if (action === 'shareFormat') {
      const { formatId, targetEmail } = body;
      if (formatId === undefined || formatId === null || !targetEmail) {
        return res.status(400).json({ success: false, error: "formatId and targetEmail required" });
      }

      const cleanEmail = targetEmail.trim().toLowerCase();
      await Format.updateOne(
        { formatId: Number(formatId) },
        { $addToSet: { sharedWith: cleanEmail } }
      );
      await Entry.updateMany(
        { formatId: Number(formatId) },
        { $addToSet: { sharedWith: cleanEmail } }
      );
      return res.json({ success: true, message: `Format and all entries shared with ${cleanEmail}` });
    }

    // Revoke Format Share
    if (action === 'revokeFormatShare') {
      const { formatId, targetEmail } = body;
      if (formatId === undefined || formatId === null || !targetEmail) {
        return res.status(400).json({ success: false, error: "formatId and targetEmail required" });
      }

      const cleanEmail = targetEmail.trim().toLowerCase();
      await Format.updateOne(
        { formatId: Number(formatId) },
        { $pull: { sharedWith: cleanEmail } }
      );
      await Entry.updateMany(
        { formatId: Number(formatId) },
        { $pull: { sharedWith: cleanEmail } }
      );
      return res.json({ success: true, message: `Access revoked for ${cleanEmail}` });
    }

    // Share Single Contact Entry
    if (action === 'shareEntry') {
      const { entryId, targetEmail } = body;
      if (entryId === undefined || entryId === null || !targetEmail) {
        return res.status(400).json({ success: false, error: "entryId and targetEmail required" });
      }

      const cleanEmail = targetEmail.trim().toLowerCase();
      const targetEntry = await Entry.findOne({ entryId: Number(entryId) });
      if (targetEntry) {
        await Format.updateOne(
          { formatId: Number(targetEntry.formatId) },
          { $addToSet: { sharedWith: cleanEmail } }
        );
      }
      await Entry.updateOne(
        { entryId: Number(entryId) },
        { $addToSet: { sharedWith: cleanEmail } }
      );
      return res.json({ success: true, message: `Entry shared with ${cleanEmail}` });
    }

    // Revoke Entry Share
    if (action === 'revokeEntryShare') {
      const { entryId, targetEmail } = body;
      if (entryId === undefined || entryId === null || !targetEmail) {
        return res.status(400).json({ success: false, error: "entryId and targetEmail required" });
      }

      const cleanEmail = targetEmail.trim().toLowerCase();
      const targetEntry = await Entry.findOne({ entryId: Number(entryId) });

      await Entry.updateOne(
        { entryId: Number(entryId) },
        { $pull: { sharedWith: cleanEmail } }
      );

      if (targetEntry) {
        const remainingEntriesCount = await Entry.countDocuments({
          formatId: Number(targetEntry.formatId),
          sharedWith: cleanEmail
        });

        if (remainingEntriesCount === 0) {
          await Format.updateOne(
            { formatId: Number(targetEntry.formatId) },
            { $pull: { sharedWith: cleanEmail } }
          );
        }
      }

      return res.json({ success: true, message: `Entry access revoked for ${cleanEmail}` });
    }

    // Sync User Profile
    if (action === 'syncUser' || urlPath.includes('users')) {
      const { userId, displayName, email, photoUrl } = body;
      if (!userId) return res.status(400).json({ success: false, error: "userId is required" });
      const user = await User.findOneAndUpdate(
        { userId },
        { displayName, email, photoUrl, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      return res.json({ success: true, user });
    }

    // Sync Formats
    if (action === 'syncFormats' || urlPath.includes('formats')) {
      const rawFormats = Array.isArray(body.formats || body) ? (body.formats || body) : [body];
      if (rawFormats.length === 0) return res.json({ success: true, count: 0 });

      const bulkOps = rawFormats.filter(fmt => fmt && fmt.formatId !== undefined && fmt.formatId !== null).map(fmt => {
        const updateFields = {
          formatId: Number(fmt.formatId),
          userId: String(fmt.userId),
          title: String(fmt.title),
          isDefault: Boolean(fmt.isDefault),
          updatedAt: new Date()
        };
        if (Array.isArray(fmt.sharedWith) && fmt.sharedWith.length > 0) {
          updateFields.sharedWith = fmt.sharedWith;
        } else if (Array.isArray(fmt.sharedWithEmails) && fmt.sharedWithEmails.length > 0) {
          updateFields.sharedWith = fmt.sharedWithEmails;
        }

        return {
          updateOne: {
            filter: { formatId: Number(fmt.formatId) },
            update: { $set: updateFields },
            upsert: true
          }
        };
      });

      if (bulkOps.length === 0) return res.json({ success: true, count: 0 });
      const result = await Format.bulkWrite(bulkOps);
      return res.json({ success: true, count: rawFormats.length, result });
    }

    // Sync Entries
    if (action === 'syncEntries' || urlPath.includes('entries')) {
      const rawEntries = Array.isArray(body.entries || body) ? (body.entries || body) : [body];
      if (rawEntries.length === 0) return res.json({ success: true, count: 0 });

      const bulkOps = rawEntries.map(ent => {
        const updateFields = {
          entryId: Number(ent.entryId),
          formatId: Number(ent.formatId),
          userId: String(ent.userId),
          isCalled: Boolean(ent.isCalled),
          updatedAt: new Date()
        };
        if (ent.valuesJson) {
          updateFields.valuesJson = typeof ent.valuesJson === 'string' ? ent.valuesJson : JSON.stringify(ent.valuesJson);
        }
        if (Array.isArray(ent.sharedWith) && ent.sharedWith.length > 0) {
          updateFields.sharedWith = ent.sharedWith;
        } else if (Array.isArray(ent.sharedWithEmails) && ent.sharedWithEmails.length > 0) {
          updateFields.sharedWith = ent.sharedWithEmails;
        }

        return {
          updateOne: {
            filter: { entryId: Number(ent.entryId) },
            update: { $set: updateFields },
            upsert: true
          }
        };
      });

      const result = await Entry.bulkWrite(bulkOps);
      return res.json({ success: true, count: rawEntries.length, result });
    }
  }

  return res.status(400).json({ success: false, error: "Invalid action or route" });
});

module.exports = app;




// git add .
// git commit -m "sldfasdjf;as"
// git push origin main