const router = require('express').Router();
const { randomUUID } = require('node:crypto');
const access = require('../middleware/access');
const limit = require('../middleware/limits');
const { z, text, id, fail, query, page, searchFilter } = require('../utils/validation');
const Review = require('../models/Review');

const staff = access('admin', 'editor');

const createSchema = z.object({
  name: text(60).min(2),
  product_name: text(80).min(2),
  rating: z.number().int().min(1).max(5),
  message: text(600).min(5),
  whatsapp: text(20).default(''),
}).strict();

const statusSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']),
}).strict();

/* Fields the public may see — whatsapp is private and never leaves
   through the public endpoint. */
const PUBLIC_FIELDS = '-_id -__v -whatsapp';

function summarize(items) {
  const count = items.length;
  const average = count ? Math.round((items.reduce((sum, r) => sum + Number(r.rating || 0), 0) / count) * 10) / 10 : 0;
  return { count, average };
}

/* ── Public: approved reviews only, newest first ── */
router.get('/', async (req, res) => {
  res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  const items = await Review.find({ status: 'approved' })
    .select(PUBLIC_FIELDS)
    .sort({ created_at: -1 })
    .limit(50)
    .lean();
  res.json({ items, summary: summarize(items) });
});

/* ── Public: submit a review (goes to Admin for approval) ──
   Rate-limited like the contact form so the queue cannot be flooded. */
router.post('/', limit('reviews', 5, 3600), async (req, res) => {
  const data = createSchema.parse(req.body);
  const record = await Review.create({ ...data, id: randomUUID(), status: 'pending' });
  res.status(201).json({
    id: record.id,
    message: 'Thank you! Your review was received and will appear here after a quick check by Digi Nepal.',
  });
});

/* ── Staff ──
   NOTE: '/all' MUST be registered before '/:id' — Express matches in
   order, and '/:id' would otherwise swallow '/all' as a review id
   (the same bug that hid Sale Campaigns until 2026-11-19). */
router.get('/all', staff, async (req, res) => {
  const q = query(req);
  const filter = { ...searchFilter(q.search, ['name', 'product_name', 'message']) };
  if (['pending', 'approved', 'rejected'].includes(q.status)) filter.status = q.status;
  const result = await page(Review, filter, { ...q, sort: 'newest' }, '-__v -_id');
  const pending = await Review.countDocuments({ status: 'pending' });
  res.json({ ...result, pending });
});

router.put('/:id', staff, async (req, res) => {
  const data = statusSchema.parse(req.body);
  const record = await Review.findOneAndUpdate(
    { id: id.parse(req.params.id) },
    { status: data.status },
    { new: true },
  ).select('-__v -_id').lean();
  if (!record) fail(404, 'This review no longer exists.');
  res.json(record);
});

router.delete('/:id', staff, async (req, res) => {
  const record = await Review.findOneAndDelete({ id: id.parse(req.params.id) });
  if (!record) fail(404, 'This review no longer exists.');
  res.json({ message: 'Review deleted.' });
});

module.exports = router;
