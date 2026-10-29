const router = require('express').Router();
const { randomUUID } = require('node:crypto');
const access = require('../middleware/access');
const { z, text, id, flag, image, fail, query, page, searchFilter } = require('../utils/validation');
const Campaign = require('../models/Campaign');
const Product = require('../models/Product');
const { decorate } = require('../utils/catalog');
const { statusOf } = require('../models/Campaign');

const staff = access('admin', 'editor');

const slugify = name => String(name || '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'sale';

async function uniqueSlug(base, ignoreId) {
  let slug = base, n = 1;
  while (await Campaign.exists({ slug, ...(ignoreId ? { id: { $ne: ignoreId } } : {}) })) {
    n += 1;
    slug = `${base}-${n}`.slice(0, 100);
  }
  return slug;
}

const dateField = z.string().datetime({ offset: true }).nullable().default(null);
const hexColor = z.union([z.literal(''), z.string().regex(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Use a hex color like #B8482A or #B8482A11.')]).optional().default('');
const schema = z.object({
  name: text(120).min(2),
  slug: z.string().regex(/^[a-z0-9-]{1,100}$/, 'Use lowercase letters, numbers, and hyphens.').optional(),
  short_label: text(40).default('ON SALE'),
  subtitle: text(200).default(''),
  banner_image_url: image.default(''),
  banner_mobile_url: image.default(''),
  theme_variant: z.enum(['default', 'festive-red', 'gold-red', 'dark-premium', 'neon-offer']).default('default'),
  accent_color: hexColor,
  bg_color: hexColor,
  is_active: flag.default(1),
  start_date: dateField,
  end_date: dateField,
  display_order: z.number().int().min(0).max(9999).default(0),
  auto_rotate: flag.default(1),
  rotation_interval_seconds: z.number().int().min(2).max(30).default(5),
  marquee_enabled: flag.default(1),
  marquee_speed: z.enum(['slow', 'normal', 'fast']).default('normal'),
  marquee_direction: z.enum(['left', 'right']).default('left'),
  pause_on_hover: flag.default(1),
  show_progress_indicators: flag.default(1),
  show_navigation_arrows: flag.default(1),
  show_sale_badge_on_cards: flag.default(1),
  badge_text: text(40).default('-{pct}'),
  cta_text: text(40).default('View all'),
  product_ids: z.array(id).max(50).default([]),
  max_products: z.number().int().min(1).max(24).default(8),
  fallback_to_discounts: flag.default(1),
}).strict();

async function validate(data) {
  if (data.start_date && data.end_date && new Date(data.end_date) <= new Date(data.start_date)) {
    fail(400, 'The end date must be after the start date.');
  }
  if (data.product_ids && data.product_ids.length) {
    const found = await Product.find({ id: { $in: data.product_ids }, is_active: 1 }).select('id').lean();
    const missing = data.product_ids.filter(pid => !found.some(p => p.id === pid));
    if (missing.length) fail(400, 'Some selected products are unavailable.');
  }
}

function decorateCampaign(c) {
  return { ...c, status: statusOf(c), product_count: (c.product_ids || []).length };
}

/* Resolve a campaign's products: explicit admin selection first (kept in
   admin order), then discounted catalogue products when the campaign allows
   fallback. Only active, in-stock-visible products; priced via the shared
   catalogue decorator so discounts match the rest of the store. */
async function resolveProducts(campaign) {
  let items = [];
  if (campaign.product_ids && campaign.product_ids.length) {
    const found = await Product.find({ id: { $in: campaign.product_ids }, is_active: 1 }).lean();
    const order = new Map(campaign.product_ids.map((pid, i) => [pid, i]));
    items = found.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }
  if (!items.length && campaign.fallback_to_discounts) {
    const all = await Product.find({ is_active: 1 }).lean();
    const decorated = await decorate(all);
    items = decorated
      .filter(p => Number(p.original_price || 0) > Number(p.price || 0))
      .sort((a, b) => (Number(b.original_price) - Number(b.price)) - (Number(a.original_price) - Number(a.price)));
  }
  return decorate(items.slice(0, campaign.max_products || 8));
}

/* ── Public: featured live campaign ─────────────────────────────────────
   Priority rule: live (enabled + inside date window) campaigns ordered by
   display_order ascending, then newest first — the first one wins. When no
   campaign is live, the section falls back to discount-derived deals. */
router.get('/active', async (req, res) => {
  const now = new Date();
  const candidates = await Campaign.find({ is_active: 1 })
    .select('-_id -__v')
    .sort({ display_order: 1, created_at: -1 })
    .lean();
  const live = candidates.filter(c => statusOf(c, now) === 'live');
  if (!live.length) return res.json({ campaign: null, items: [] });
  const winner = live[0];
  const items = await resolveProducts(winner);
  if (!items.length) return res.json({ campaign: null, items: [] });
  res.json({ campaign: decorateCampaign(winner), items });
});

/* ── Public: single campaign by id or slug (live only) ── */
router.get('/:id', async (req, res) => {
  const key = String(req.params.id);
  const campaign = await Campaign.findOne({
    $or: [{ id: key }, { slug: key }],
  }).select('-_id -__v').lean();
  if (!campaign || statusOf(campaign) !== 'live') fail(404, 'This campaign is unavailable.');
  res.json({ campaign: decorateCampaign(campaign), items: await resolveProducts(campaign) });
});

/* ── Admin ── */
router.get('/all', staff, async (req, res) => {
  const q = query(req);
  const result = await page(Campaign, { ...searchFilter(q.search, ['name', 'slug']) }, q);
  result.items = result.items.map(decorateCampaign);
  res.json(result);
});

router.post('/', staff, async (req, res) => {
  const data = schema.parse(req.body);
  await validate(data);
  const slug = data.slug || await uniqueSlug(slugify(data.name));
  if (data.slug && await Campaign.exists({ slug: data.slug })) fail(400, 'That URL slug is already used.');
  const record = await Campaign.create({ ...data, slug, id: randomUUID() });
  res.status(201).json(decorateCampaign(record.toObject()));
});

router.put('/:id', staff, async (req, res) => {
  const data = schema.partial().strict().parse(req.body);
  await validate(data);
  const existing = await Campaign.findOne({ id: id.parse(req.params.id) });
  if (!existing) fail(404, 'This campaign no longer exists.');
  if (data.slug && data.slug !== existing.slug && await Campaign.exists({ slug: data.slug, id: { $ne: existing.id } })) {
    fail(400, 'That URL slug is already used.');
  }
  if (data.name && !data.slug && !req.body.slug) data.slug = await uniqueSlug(slugify(data.name), existing.id);
  Object.assign(existing, data);
  await existing.save();
  res.json(decorateCampaign(existing.toObject()));
});

router.delete('/:id', staff, async (req, res) => {
  const record = await Campaign.findOneAndUpdate({ id: id.parse(req.params.id) }, { is_active: 0 }, { new: true });
  if (!record) fail(404, 'This campaign no longer exists.');
  res.json({ message: 'Campaign disabled.' });
});

router.post('/:id/restore', staff, async (req, res) => {
  z.object({}).strict().parse(req.body || {});
  const record = await Campaign.findOneAndUpdate({ id: id.parse(req.params.id) }, { is_active: 1 }, { new: true });
  if (!record) fail(404, 'This campaign no longer exists.');
  res.json(decorateCampaign(record.toObject()));
});

module.exports = router;
