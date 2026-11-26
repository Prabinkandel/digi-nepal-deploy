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


function wrapEmail(heading, color, inner, opts) {
  opts = opts || {};
  const admin = !!opts.admin;
  const foot = admin
    ? (opts.adminButton === false ? '' : '<div style="margin-top:18px;text-align:center"><a href="https://www.diginepalnp.com/admin" style="display:inline-block;background:#17171c;color:#ffffff;text-decoration:none;font-weight:700;padding:10px 20px;border-radius:999px;font-size:13.5px">Open Admin Panel</a></div>')
      + '<p style="margin:16px 0 0;text-align:center;color:#8a8a93;font-size:12px">Digi Prime Nepal \u00B7 diginepalnp.com</p>'
    : '<p style="margin:18px 0 0;text-align:center;color:#8a8a93;font-size:12px">Digi Prime Nepal \u00B7 diginepalnp.com</p>';
  return '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#ffffff;color:#17171c;border:1px solid #e7e7ec;border-radius:14px;overflow:hidden">'
    + '<div style="padding:16px 24px;border-bottom:3px solid #e50914"><span style="color:#e50914;font-size:19px;font-weight:800">Digi</span> <span style="color:#17171c;font-size:19px;font-weight:800">Prime Nepal</span>' + (admin ? '<span style="float:right;color:#8a8a93;font-size:11px;letter-spacing:.08em;padding-top:5px">ADMIN</span>' : '') + '</div>'
    + '<div style="padding:20px 24px">'
    + (heading ? '<h2 style="margin:0 0 12px;font-size:17px;color:' + (color || '#17171c') + '">' + heading + '</h2>' : '')
    + inner
    + foot
    + '</div></div>';
}

function detailRows(rows) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f7f7f9;border:1px solid #ececf1;border-radius:10px;margin:14px 0">'
    + rows.map(function (r, i) {
        const top = i === 0 ? ';padding-top:10px' : '';
        const bot = i === rows.length - 1 ? ';padding-bottom:10px' : '';
        return '<tr><td style="padding:6px 14px;vertical-align:top;color:#8a8a93;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap' + top + bot + '">' + r[0] + '</td>'
          + '<td style="padding:6px 14px;vertical-align:top;font-size:14px;color:#17171c;font-weight:600;text-align:right' + top + bot + '">' + r[1] + '</td></tr>';
      }).join('')
    + '</table>';
}

async function sendMail(options) {
  const mailConfig = await getMailConfig();
  const to = options.to;
  const subject = options.subject || 'Digi Prime Nepal Notification';
  const html = options.html || wrapEmail('', null, '<p style="margin:0">' + (options.text || '') + '</p>');
  const text = options.text || html.replace(/<[^>]+>/g, '');

  if (mailConfig) {
    try {
      const info = await mailConfig.transporter.sendMail({
        from: mailConfig.from,
        to,
        subject,
        html,
        text,
        attachments: options.attachments || undefined
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

module.exports = { sendMail, configured, getMailConfig, getAdminEmail, wrapEmail, detailRows };
