const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  order_id: { type: String, default: null },
  user_id: { type: String, required: true },
  product_name: { type: String, required: true },
  amount: { type: Number, required: true },
  payer_name: { type: String, required: true },
  transaction_id: { type: String, required: true },
  payment_method: { type: String, required: true },
  phone: { type: String, default: '' },
  note: { type: String, default: '' },
  screenshot_url: { type: String, default: '' },
  status: { type: String, default: 'pending' },
  admin_note: { type: String, default: null },
  dedupe_key: { type: String, unique: true, sparse: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

paymentSchema.index({ order_id: 1 });
paymentSchema.index({ phone: 1 });
paymentSchema.index({ status: 1, created_at: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
