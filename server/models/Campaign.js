const mongoose = require('mongoose');

const THEMES = ['default', 'festive-red', 'gold-red', 'dark-premium', 'neon-offer'];

const campaignSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  short_label: { type: String, default: 'ON SALE' },
  subtitle: { type: String, default: '' },
  banner_image_url: { type: String, default: '' },
  banner_mobile_url: { type: String, default: '' },
  theme_variant: { type: String, enum: THEMES, default: 'default' },
  accent_color: { type: String, default: '' },
  bg_color: { type: String, default: '' },
  is_active: { type: Number, default: 1 },
  start_date: { type: Date, default: null },
  end_date: { type: Date, default: null },
  display_order: { type: Number, default: 0 },
  auto_rotate: { type: Number, default: 1 },
  rotation_interval_seconds: { type: Number, default: 5 },
  marquee_enabled: { type: Number, default: 1 },
  marquee_speed: { type: String, enum: ['slow', 'normal', 'fast'], default: 'normal' },
  marquee_direction: { type: String, enum: ['left', 'right'], default: 'left' },
  pause_on_hover: { type: Number, default: 1 },
  show_progress_indicators: { type: Number, default: 1 },
  show_navigation_arrows: { type: Number, default: 1 },
  show_sale_badge_on_cards: { type: Number, default: 1 },
  badge_text: { type: String, default: '-{pct}' },
  cta_text: { type: String, default: 'View all' },
  product_ids: { type: [String], default: [] },
  max_products: { type: Number, default: 8 },
  fallback_to_discounts: { type: Number, default: 1 },
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

/* Live-status of a campaign at a given moment.
   live: enabled and inside its date window. scheduled: enabled but starts
   in the future. expired: enabled but the end date passed.
   draft: disabled by admin. */
function statusOf(campaign, now = new Date()) {
  if (!campaign || !campaign.is_active) return 'draft';
  if (campaign.start_date && new Date(campaign.start_date) > now) return 'scheduled';
  if (campaign.end_date && new Date(campaign.end_date) < now) return 'expired';
  return 'live';
}

module.exports = mongoose.model('Campaign', campaignSchema);
module.exports.THEMES = THEMES;
module.exports.statusOf = statusOf;
