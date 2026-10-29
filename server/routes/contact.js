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
      html: `<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
        <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal — Contact Form</h2>
        <h3 style="margin:0 0 10px;color:#60a5fa;">New Message Received</h3>
        <div style="background:#1c1c20;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #333;">
          <p style="margin:4px 0;">From: <strong>${data.name}</strong></p>
          <p style="margin:4px 0;">Email: <strong><a href="mailto:${data.email}" style="color:#60a5fa;">${data.email}</a></strong></p>
          <p style="margin:4px 0;">Subject: <strong>${subjectLabels[data.subject]}</strong></p>
          <p style="margin:12px 0 0;padding-top:12px;border-top:1px solid #333;color:#d4d4d8;white-space:pre-wrap;">${data.message}</p>
        </div>
        <p style="color:#a1a1aa;font-size:13px;margin-top:16px;">Reply directly to <a href="mailto:${data.email}" style="color:#60a5fa;">${data.email}</a> to respond to this inquiry.</p>
      </div>`
    });
  }

  // Send confirmation to the user
  await mailer.sendMail({
    to: data.email,
    subject: `✅ We received your message — Digi Prime Nepal`,
    html: `<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
      <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal</h2>
      <h3 style="margin:0 0 10px;color:#4ade80;">Message Received!</h3>
      <p>Hello <strong>${data.name}</strong>,</p>
      <p>Thank you for reaching out. We've received your message and will get back to you within 24 hours during business days.</p>
      <div style="background:#1c1c20;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #333;">
        <p style="margin:4px 0;">Subject: <strong>${subjectLabels[data.subject]}</strong></p>
        <p style="margin:8px 0 0;padding-top:8px;border-top:1px solid #333;color:#d4d4d8;white-space:pre-wrap;font-size:13px;">${data.message}</p>
      </div>
      <p style="color:#a1a1aa;font-size:13px;margin-top:16px;">If you have an urgent matter, please reach us on WhatsApp for a quicker response.</p>
    </div>`
  });

  res.json({ success: true, message: 'Your message has been sent. We will respond within 24 hours.' });
});

module.exports = router;
