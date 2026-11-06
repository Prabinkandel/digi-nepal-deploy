const { z } = require('zod');
const text = (max = 200) => z.string().trim().max(max);
const email = z.string().trim().email().max(254).transform(v => v.toLowerCase());
const password = z.string().min(12, 'Use at least 12 characters.').max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Use at most 72 UTF-8 bytes.').refine(v => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v) && /[^A-Za-z0-9]/.test(v), 'Use upper- and lower-case letters, a number, and a symbol.');
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/, 'Invalid record ID.');
const money = z.number().finite().min(0).max(10000000);
const flag = z.number().int().min(0).max(1);
const image = text(4000).refine(v => !v || /^\/[a-zA-Z0-9_./-]+$/.test(v) || /^https?:\/\/[^\s<>"']+$/.test(v) || /^data:image\/[a-zA-Z+]+;base64,/.test(v), 'Use an uploaded image, local image path, or valid image URL.');
function fail(status, message) { const err = new Error(message); err.status = status; throw err; }
function query(req) {
  return z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(12), search: text(100).default(''), sort: z.enum(['newest','oldest','name','price-asc','price-desc']).default('newest'), status: text(30).default(''), category: text(100).default('') }).parse(req.query);
}
const sorts = { newest: { featured: -1, created_at: -1, id: 1 }, oldest: { featured: -1, created_at: 1, id: 1 }, name: { featured: -1, name: 1, id: 1 }, 'price-asc': { featured: -1, price: 1, id: 1 }, 'price-desc': { featured: -1, price: -1, id: 1 } };
function searchFilter(value, fields) { return value ? { $or: fields.map(field => ({ [field]: { $regex: value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'), $options: 'i' } })) } : {}; }
async function page(Model, filter, q, projection) {
  const [items,total] = await Promise.all([Model.find(filter).select(projection || '-__v -_id').sort(sorts[q.sort]).skip((q.page-1)*q.limit).limit(q.limit).lean(), Model.countDocuments(filter)]);
  return { items, total, page: q.page, pages: Math.max(1, Math.ceil(total/q.limit)) };
}
module.exports = { z, text, email, password, id, money, flag, image, fail, query, page, searchFilter };
