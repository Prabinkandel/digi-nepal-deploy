require('./dns')();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('node:crypto');

// Load .env as a safety net in case this module is required before dotenv ran.
try {
  const path = require('node:path');
  require('dotenv').config({ path: [path.join(__dirname, '../../.env'), path.join(__dirname, '../.env')], quiet: true });
} catch (e) { void e; }
const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');

let connecting;
let memoryServer;

mongoose.connection.on('error', err => {
  console.error('[MongoDB Connection Error]', err.message || err);
});

mongoose.connection.on('disconnected', () => {
  connecting = null;
});

async function seedAdminIfNeeded() {
  const admins = [
    { email: 'admin@diginepal.com', name: 'Admin' },
    { email: 'prabink721@gmail.com', name: 'Prabin' }
  ];
  for (const item of admins) {
    const existing = await User.findOne({ email: item.email }).lean();
    if (!existing) {
      await User.create({
        id: randomUUID(),
        name: item.name,
        email: item.email,
        password: await bcrypt.hash('admin123', 12),
        role: 'admin',
        is_active: 1,
        auth_version: 0,
        mfa_enabled: false
      });
    }
  }
}

async function seedCatalogIfEmpty() {
  if (await Product.exists({})) return;
  const categories = [
    { id: randomUUID(), name: 'AI Tools', icon: '✦', color: '#B91C1C', sort_order: 1, is_active: 1 },
    { id: randomUUID(), name: 'Design & Media', icon: '◈', color: '#DC2626', sort_order: 2, is_active: 1 },
    { id: randomUUID(), name: 'Cloud & Office', icon: '◇', color: '#991B1B', sort_order: 3, is_active: 1 },
    { id: randomUUID(), name: 'Entertainment', icon: '●', color: '#7F1D1D', sort_order: 4, is_active: 1 },
    { id: randomUUID(), name: 'Security & VPN', icon: '◆', color: '#EF4444', sort_order: 5, is_active: 1 },
    { id: randomUUID(), name: 'Gaming', icon: '🎮', color: '#DC2626', sort_order: 6, is_active: 1 }
  ];
  const existing = await Category.find({}).lean();
  const byName = new Map(existing.map(category => [category.name, category]));
  const catalog = [];
  for (const category of categories) {
    const current = byName.get(category.name);
    if (current) catalog.push(current);
    else { const [created] = await Category.create([category]); catalog.push(created); }
  }
  const idFor = name => catalog.find(category => category.name === name).id;
  await Product.insertMany([
    { id: randomUUID(), name: 'ChatGPT Plus — 1 Month', category_id: idFor('AI Tools'), price: 1200, original_price: 2500, badge: 'Popular', description: 'Advanced AI tools for writing, research, and everyday work.', features: ['Priority access', 'Advanced models', 'Image generation'], sort_order: 1, is_active: 1 },
    { id: randomUUID(), name: 'Canva Pro — 1 Year', category_id: idFor('Design & Media'), price: 1500, original_price: 3000, badge: 'Save 50%', description: 'Design tools and premium templates for your next project.', features: ['Premium templates', 'Brand tools', 'Background remover'], sort_order: 2, is_active: 1 },
    { id: randomUUID(), name: 'Microsoft 365 Personal — 1 Year', category_id: idFor('Cloud & Office'), price: 2200, original_price: 3500, badge: '', description: 'Everyday productivity apps and cloud storage.', features: ['Office apps', 'Cloud storage', 'Multi-device access'], sort_order: 3, is_active: 1 },
    { id: randomUUID(), name: 'Netflix Premium — 1 Month', category_id: idFor('Entertainment'), price: 550, original_price: 800, badge: '', description: 'Premium entertainment access with clear order tracking.', features: ['High quality streaming', 'Simple setup', 'Order updates'], sort_order: 4, is_active: 1 },
    { id: randomUUID(), name: 'ExpressVPN — 1 Year', category_id: idFor('Security & VPN'), price: 1800, original_price: 4000, badge: 'Best value', description: 'Private, reliable access for your connected devices.', features: ['Global locations', 'Device protection', 'Support included'], sort_order: 5, is_active: 1 },
    { id: randomUUID(), name: 'Free Fire Diamonds', category_id: idFor('Gaming'), price: 30, original_price: 35, badge: '🔥 Hot', description: 'Official Free Fire Diamond top-up in Nepal. Direct in-game delivery via Player ID (UID). 25 to 5060 Diamonds, Weekly & Monthly Membership.', features: ['Instant delivery after payment', '100% safe & official top-up (UID only)', 'eSewa, Khalti & Bank QR accepted', '24/7 WhatsApp support in Nepal'], sort_order: 6, is_active: 1 }
  ]);
}

async function healMediaPurposes() {
  try {
    const Media = require('../models/Media');
    const Setting = require('../models/Setting');

    const products = await Product.find({ image_url: { $regex: '/api/media/' } }, 'image_url').lean();
    const mediaIds = products.map(p => {
      const match = p.image_url && p.image_url.match(/\/api\/media\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    }).filter(Boolean);

    const settings = await Setting.find({ key: 'payment_qr_url' }).lean();
    settings.forEach(s => {
      const match = s.value && s.value.match(/\/api\/media\/([a-zA-Z0-9_-]+)/);
      if (match) mediaIds.push(match[1]);
    });

    if (mediaIds.length > 0) {
      await Media.updateMany(
        { id: { $in: mediaIds } },
        { $set: { purpose: 'catalog' } }
      );
    }
  } catch (err) {
    void err;
  }
}

function connectDB() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose.connection);
  if (connecting) return connecting;

  function startLocalMemory() {
    let MongoMemoryServer;
    try {
      MongoMemoryServer = require('mongodb-memory-server').MongoMemoryServer;
    } catch {
      connecting = Promise.reject(new Error(
        'MONGO_URI is not set and mongodb-memory-server is not available. ' +
        'Set MONGO_URI for production or install devDependencies for local dev.'
      ));
      return connecting;
    }

    const fs = require('node:fs');
    const path = require('node:path');
    const databasePath = process.env.NODE_ENV === 'test'
      ? path.join(__dirname, '../../.local-data/test-mongodb-' + process.pid)
      : path.join(__dirname, '../../.local-data/mongodb');
    try { fs.mkdirSync(databasePath, { recursive: true }); } catch (e) { void e; }
    connecting = MongoMemoryServer.create({
      instance: { dbPath: databasePath, dbName: 'digi-nepal' }
    })
      .then(server => {
        memoryServer = server;
        return mongoose.connect(server.getUri(), { serverSelectionTimeoutMS: 8000 });
      })
      .then(async () => {
        await seedAdminIfNeeded();
        await seedCatalogIfEmpty();
        await healMediaPurposes();
      })
      .catch(error => {
        connecting = null;
        memoryServer = null;
        throw error;
      });

    return connecting;
  }

  if (process.env.MONGO_URI && process.env.NODE_ENV !== 'test') {
    connecting = mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 })
      .then(async conn => {
        await seedAdminIfNeeded();
        await seedCatalogIfEmpty();
        await healMediaPurposes();
        return conn;
      })
      .catch(async error => {
        connecting = null;
        if (process.env.NODE_ENV === 'production') throw error;
        if (error.message && error.message.includes('querySrv')) {
          // ISP DNS often refuses SRV lookups. Switch DNS servers and retry
          // once before falling back to the local database.
          console.warn('[MongoDB] SRV lookup failed (' + error.message + '). Retrying with 8.8.8.8 / 1.1.1.1 DNS...');
          try {
            const dns = require('node:dns');
            dns.setServers(['8.8.8.8', '1.1.1.1']);
            await new Promise(resolve => setImmediate(resolve));
            const retry = await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
            await seedAdminIfNeeded();
            await seedCatalogIfEmpty();
            await healMediaPurposes();
            return retry;
          } catch (retryError) {
            connecting = null;
            console.warn('[MongoDB] Retry failed (' + retryError.message + '). Falling back to local database...');
            return startLocalMemory();
          }
        }
        console.warn(`[MongoDB] Remote connection failed (${error.message}). Falling back to local database...`);
        return startLocalMemory();
      });
    return connecting;
  }

  return startLocalMemory();
}

connectDB.close = async function close() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
  memoryServer = null;
  connecting = null;
};

connectDB.connectDatabase = connectDB;
module.exports = connectDB;
module.exports.connectDatabase = connectDB;
