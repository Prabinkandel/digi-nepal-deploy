const router = require('express').Router();
const limit = require('../middleware/limits');
const { z, text } = require('../utils/validation');
const mailer = require('../utils/mailer');

// Rate limit contact form: 5 messages per 15 minutes per IP
router.post('/', limit('contact', 5, 900), async (req, res) => {
  const data = z.object({
    name: text(100).min(2),
    email: z.string().email().max(254),
    subject: z.enum(['general', 'order', 'payment', 'product', 'other']),
    message: text(2000).min(10)
  }).strict().parse(req.body);

  const subjectLabels = {
    general: 'General Inquiry',
    order: 'Order Support',
    payment: 'Payment Issue',
    product: 'Product Question',
    other: 'Other'
  };

  const adminEmail = await mailer.getAdminEmail();

  // Send notification to admin
  if (adminEmail) {
    await mailer.sendMail({
      to: adminEmail,
      subject: `📩 New Contact Message: ${subjectLabels[data.subject]} — from ${data.name}`,
      html: mailer.wrapEmail('New contact message', '#1d4ed8', mailer.detailRows([['From', data.name],['Email', '<a href="mailto:' + data.email + '" style="color:#1d4ed8">' + data.email + '</a>'],['Subject', subjectLabels[data.subject]]]) + '<div style="background:#f7f7f9;border:1px solid #ececf1;border-radius:10px;padding:12px 14px;font-size:14px;color:#33333a;white-space:pre-wrap">' + data.message + '</div><p style="margin:12px 0 0;color:#55555e;font-size:13px">Reply directly to ' + data.email + ' to respond.</p>', { admin: true })
    });
  }

  // Send confirmation to the user
  await mailer.sendMail({
    to: data.email,
    subject: `✅ We received your message — Digi Prime Nepal`,
    html: mailer.wrapEmail('Message received', '#15803d', '<p style="margin:0 0 6px">Hello <strong>' + data.name + '</strong>,</p><p style="margin:0">Thank you for reaching out. We have received your message and will get back to you within 24 hours on business days.</p>' + mailer.detailRows([['Subject', subjectLabels[data.subject]]]) + '<div style="background:#f7f7f9;border:1px solid #ececf1;border-radius:10px;padding:12px 14px;font-size:13px;color:#33333a;white-space:pre-wrap">' + data.message + '</div>')
  });

  res.json({ success: true, message: 'Your message has been sent. We will respond within 24 hours.' });
});

module.exports = router;
