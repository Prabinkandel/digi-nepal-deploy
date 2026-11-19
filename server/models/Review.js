const mongoose = require('mongoose');

/* Customer review submitted from the storefront. Reviews start as
   'pending' and only appear on the site after a staff member approves
   them in Admin → Reviews. The optional WhatsApp number is private:
   it is never returned by the public endpoint. */
const reviewSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  product_name: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  message: { type: String, required: true },
  whatsapp: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

module.exports = mongoose.model('Review', reviewSchema);
