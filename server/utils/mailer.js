const nodemailer = require('nodemailer');

let cachedTransporter = null;
let cachedKey = '';

async function getMailConfig() {
  // Tests must never send real mail: force the dev-mode (console log) path.
  if (process.env.NODE_ENV === 'test') return null;
  let host = process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com';
  let port = Number(process.env.SMTP_PORT || process.env.EMAIL_PORT || 465);
  let user = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || '';
  let pass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.GMAIL_PASS || '';
  let from = process.env.SMTP_FROM || process.env.EMAIL_FROM || (user ? `Digi Prime Nepal <${user}>` : 'Digi Prime Nepal <no-reply@diginepal.com>');

  try {
    const Setting = require('../models/Setting');
    const dbSettings = await Setting.find({ key: { $in: ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'email_notifications'] } }).lean();
    const map = {};
    for (const s of dbSettings) map[s.key] = s.value;
    
    if (map.smtp_user && map.smtp_pass) {
      host = map.smtp_host || host;
      port = Number(map.smtp_port || port);
      user = map.smtp_user;
      pass = map.smtp_pass;
      from = map.smtp_from || `Digi Prime Nepal <${user}>`;
    }
  } catch (err) {
    void err;
  }

  if (!user || !pass) return null;

  const key = `${host}:${port}:${user}:${pass}:${from}`;
  if (cachedTransporter && cachedKey === key) return { transporter: cachedTransporter, from };

  const isSecure = port === 465;
  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: isSecure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });
  cachedKey = key;
  return { transporter: cachedTransporter, from };
}

async function configured() {
  const cfg = await getMailConfig();
  return !!cfg;
}

async function sendMail(options) {
  const mailConfig = await getMailConfig();
  const to = options.to;
  const subject = options.subject || 'Digi Prime Nepal Notification';
  const html = options.html || `<div style="font-family:sans-serif;padding:20px;background:#141416;color:#ffffff;border-radius:10px;"><h2 style="color:#e50914;">Digi Prime Nepal</h2><p>${options.text || ''}</p></div>`;
  const text = options.text || html.replace(/<[^>]+>/g, '');

  if (mailConfig) {
    try {
      const info = await mailConfig.transporter.sendMail({
        from: mailConfig.from,
        to,
        subject,
        html,
        text
      });
      console.log(`[GMAIL MAILER] Email successfully sent to ${to}. MessageId: ${info.messageId}`);
      return { sent: true, messageId: info.messageId };
    } catch (err) {
      console.error(`[GMAIL MAILER ERROR] Could not send email to ${to}:`, err.message);
      return { sent: false, error: err.message };
    }
  } else {
    console.log(`\n======================================================`);
    console.log(`[DEV MAILER LOG - SMTP NOT CONFIGURED]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Text: ${text}`);
    console.log(`======================================================\n`);
    return { sent: false, devMode: true };
  }
}

async function getAdminEmail() {
  try {
    const Setting = require('../models/Setting');
    const settings = await Setting.find({ key: { $in: ['contact_email', 'smtp_user'] } }).lean();
    const map = {};
    for (const s of settings) map[s.key] = s.value;
    if (map.contact_email && map.contact_email.includes('@')) return map.contact_email;
    if (map.smtp_user && map.smtp_user.includes('@')) return map.smtp_user;
  } catch { void 0; }
  return process.env.ADMIN_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER || 'admin@diginepal.com';
}

module.exports = { sendMail, configured, getMailConfig, getAdminEmail };
