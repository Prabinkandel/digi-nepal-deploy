// One-off catalog migration: narrow the public catalog to a curated set,
// enrich details, and add new products. Safe to re-run (idempotent).
const dns = require('node:dns');
if (!process.env.VERCEL) {
  try { setImmediate(() => { try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) { void e; } }); } catch (e) { void e; }
}
const path = require('node:path');
require('dotenv').config({ path: [path.join(__dirname, '../../.env'), path.join(__dirname, '../.env')], quiet: true });
const mongoose = require('mongoose');
const { randomUUID: uuidv4 } = require('node:crypto');
const connectDB = require('../config/db');
const Product = require('../models/Product');
const Category = require('../models/Category');

const catName = async (name) => {
  const c = await Category.findOne({ name, is_active: 1 }).lean();
  if (!c) { console.error('Category not found:', name); process.exit(1); }
  return c.id;
};

async function findByName(name, duration, altNames = []) {
  const candidates = [name, ...altNames];
  for (const candidate of candidates) {
    const p = await Product.findOne({ name: candidate, duration });
    if (p) return p;
  }
  console.error('Existing product not found:', candidates.join(' | '), duration);
  process.exit(1);
}

async function main() {
  await connectDB();

  // 1) Netflix 4K (private profile) — update existing Netflix Premium 1 Month
  const netflix = await findByName('Netflix Premium', '1 Month', ['Netflix 4K']);
  await Product.updateOne({ _id: netflix._id }, {
    $set: {
      name: 'Netflix 4K',
      price: 350,
      original_price: 499,
      discount: 30,
      badge: 'hot',
      description: '4K/UHD Netflix Premium on a private profile under your own email. Up to 4 screens, offline downloads on mobile. Instant delivery (10-30 min after payment approval) with an activation warranty - free replacement if the profile is ever blocked.',
      features: [
        '4K Ultra HD + Dolby Atmos',
        'Private profile on your email - 100% yours to keep',
        'Up to 4 screens at once',
        'Offline downloads on mobile',
        'Instant delivery in 10-30 min after approval',
        'Activation warranty - replacement if blocked'
      ]
    }
  });
  console.log('Updated Netflix 4K ->', netflix.id);

  // 2) Spotify Premium 3 Months @ 350
  const spotify = await findByName('Spotify Premium', '3 Months');
  await Product.updateOne({ _id: spotify._id }, {
    $set: {
      price: 350,
      original_price: 550,
      discount: 36,
      badge: 'sale',
      description: 'Three full months of ad-free Spotify Premium on your own account. Offline downloads, unlimited skips and high audio quality. Delivered to your email with proof of activation. Activation warranty - free re-activation if access fails.',
      features: [
        'Ad-free listening',
        'Offline downloads',
        'Unlimited skips',
        'High audio quality',
        'Your own account - credentials on your email',
        'Activation warranty - free re-activation'
      ]
    }
  });

  // 3) ChatGPT Plus 1 Month - enriched details (price unchanged)
  const chatgpt = await findByName('ChatGPT Plus', '1 Month');
  await Product.updateOne({ _id: chatgpt._id }, {
    $set: {
      description: 'Pre-activated ChatGPT Plus under your own OpenAI email. GPT-4o, DALL-E 3, advanced data analysis and custom GPTs. Proof of purchase and activation is sent with your delivery. Activation warranty - free re-activation within 30 days if access ever fails.',
      features: [
        'GPT-4o access',
        'DALL-E 3 image generation',
        'Advanced data analysis',
        'Custom GPTs',
        'Pre-activated on your own OpenAI email',
        'Proof of purchase & activation with delivery',
        'Activation warranty - free re-activation within 30 days',
        'Priority access during peak hours'
      ]
    }
  });
  console.log('Updated ChatGPT 1 Month ->', chatgpt.id);

  // Added products below are collected into newIds so the keep-list
  // (applied after the adds) includes them and re-runs stay idempotent.
  const newIds = [];

  // 5) New products (created once, re-runs skip existing name+duration)
  const add = async (name, cat, o) => {
    const existing = await Product.findOne({ name, duration: o.duration }).lean();
    if (existing) {
      console.log('Already exists, skipping:', name, o.duration);
      newIds.push(existing.id);
      return;
    }
    const id = uuidv4();
    await Product.create({ id, name, category_id: cat, is_active: 1, sort_order: o.sort ?? 0, ...o });
    console.log('Created', name, '->', id);
    newIds.push(id);
  };

  await add('Gemini AI Pro', await catName('AI Tools'), {
    duration: '18 Months',
    price: 1499,
    original_price: 3599,
    discount: 58,
    badge: 'new',
    description: '18 months of Google One AI Premium - Gemini Advanced with Gemini 2.5 Pro, Deep Research, Veo and Flow. Pre-activated on your own Google email, delivered with proof of activation. Activation warranty only: if activation fails we replace or re-activate at no cost.',
    features: [
      'Google One AI Premium (Gemini Advanced)',
      '18-month activation',
      'Gemini 2.5 Pro, Deep Research, Veo & Flow',
      'Pre-activated on your Google email',
      'Proof of activation with delivery',
      'Activation warranty - replacement if blocked'
    ]
  });

  await add('Prime Video', await catName('Entertainment'), {
    duration: '1 Month',
    price: 99,
    original_price: 299,
    discount: 67,
    badge: 'cheap',
    description: 'One month of Amazon Prime Video - the full movies and series catalogue on a private account under your email. Instant delivery after payment approval. Activation warranty - free re-activation if access fails.',
    features: [
      'Full Prime Video movies & series catalogue',
      '1080p Full HD streaming',
      'Up to 6 profiles',
      'Private account on your email',
      'Instant delivery after approval',
      'Activation warranty - free re-activation'
    ]
  });

  await add('Prime Video', await catName('Entertainment'), {
    duration: '3 Months',
    price: 250,
    original_price: 897,
    discount: 72,
    badge: 'sale',
    description: 'Three months of Amazon Prime Video on a private account under your email - the best value. Instant delivery after payment approval. Activation warranty - free re-activation if access fails.',
    features: [
      '3-month Prime Video access',
      'Full movies & series catalogue',
      '1080p Full HD streaming',
      'Private account on your email',
      'Instant delivery after approval',
      'Activation warranty - free re-activation'
    ]
  });

  await add('CapCut Pro', await catName('Design & Media'), {
    duration: '1 Month',
    price: 450,
    original_price: 900,
    discount: 50,
    badge: 'sale',
    description: 'One month of CapCut Pro, delivered pre-activated on your email. AI tools, premium templates, effects and watermark-free 4K export. Login credentials sent instantly after approval. Activation warranty - free re-activation if blocked.',
    features: [
      'Pre-activated Pro account on your email',
      'AI tools, templates & premium effects',
      'Watermark-free export (4K)',
      '1-month Pro access',
      'Login credentials delivered instantly',
      'Activation warranty - free re-activation'
    ]
  });

  await add('CapCut Pro (Pre-activated, 2 Devices)', await catName('Design & Media'), {
    duration: '1 Month',
    price: 315,
    original_price: 620,
    discount: 49,
    badge: 'hot',
    description: 'Pre-activated CapCut Pro account, ready the moment it lands in your email - share across 2 devices. AI tools, premium templates and watermark-free export. Activation warranty - free re-activation if blocked.',
    features: [
      'Pre-activated account - ready instantly',
      'Use on 2 devices / 2 logins',
      'AI tools, templates & premium effects',
      'Watermark-free export',
      'Delivered to your email within minutes',
      'Activation warranty - free re-activation'
    ]
  });

  // 4) Keep-list: everything except these stays hidden from customers.
  const keep = [
    netflix.id,
    spotify.id,
    chatgpt.id,
    (await findByName('Canva Pro', '1 Month')).id,
    (await findByName('Canva Pro', '1 Year')).id,
    ...newIds
  ];
  const hidden = await Product.updateMany(
    { is_active: 1, id: { $nin: keep } },
    { $set: { is_active: 0 } }
  );
  console.log('Hidden products:', hidden.modifiedCount);
  // Self-heal: ensure the added products are visible even if a prior run hid them.
  await Product.updateMany({ id: { $in: newIds } }, { $set: { is_active: 1 } });

  // 6) Final report
  const visible = await Product.find({ is_active: 1 }).lean().sort({ price: 1 });
  console.log('\nVISIBLE CATALOG (' + visible.length + '):');
  visible.forEach((p) => {
    console.log('  ' + p.name + (p.duration ? ' (' + p.duration + ')' : '') + ' - NPR ' + p.price + (p.original_price ? ' (was ' + p.original_price + ')' : ''));
  });
  console.log('Done. Hidden: ' + hidden.modifiedCount);
  await mongoose.disconnect();
}

main().catch((err) => { console.error('MIGRATION FAILED:', err); process.exit(1); });
