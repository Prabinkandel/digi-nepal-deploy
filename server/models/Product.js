const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  category_id: { type: String, required: true },
  price: { type: Number, required: true },
  original_price: { type: Number, default: null },
  discount: { type: Number, default: 0 },
  badge: { type: String, default: null },
  image_url: { type: String, default: null },
  description: { type: String, default: '' },
  features: { type: [String], default: [] },
  duration: { type: String, default: null }, // e.g. '1 Month', '3 Months', '6 Months', '1 Year', 'Lifetime'
  stock: { type: Number, default: null },
  rating: { type: Number, default: 4.8 },
  brand_color: { type: String, default: null }, // Optional explicit hex (e.g. #E50914)
  is_active: { type: Number, default: 1 },
  sort_order: { type: Number, default: 0 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Product', productSchema);
