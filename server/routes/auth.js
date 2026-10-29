const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { randomUUID, randomInt, randomBytes } = require('node:crypto');
const User = require('../models/User');
const Challenge = require('../models/Challenge');
const Audit = require('../models/Audit');
const mailer = require('../utils/mailer');
const auth = require('../middleware/auth');
const limit = require('../middleware/limits');
const { generateToken } = require('../middleware/csrf');
const { z, email, password, text, fail } = require('../utils/validation');
const mfa = require('../utils/mfa');
const google = require('../utils/googleAuth');
const { production } = require('../config/runtime');
const localAutoVerify = !production && process.env.LOCAL_AUTH_AUTO_VERIFY === 'true';
const dummyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 12);
const safe = user => ({ id: user.id, name: user.name, email: user.email, role: user.role, mfa_enabled: !!user.mfa_enabled });
const credentials = z.object({ email, password: z.string().min(1).max(256), code: text(32).default('') }).strict();
const emailLimit = limit('auth-email', 10, 900, req => typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : req.ip);
const limited = [limit('auth-ip', 40, 900), emailLimit];
async function signIn(req, user, verified = false) {
  await new Promise((resolve,reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
  req.session.userId = user.id; req.session.authVersion = user.auth_version || 0;
  req.session.signedInAt = Date.now(); req.session.mfaVerified = verified;
  const csrf = generateToken(req);
  return { user: safe(user), token: csrf, csrf };
}
async function challenge(emailAddress, purpose, extra = {}) {
  if (!await mailer.configured()) fail(503, 'Email is not configured. Contact the site administrator.');
  const code = String(randomInt(10000000, 100000000));
  await Challenge.findOneAndUpdate({ email: emailAddress, purpose }, { ...extra, code_hash: await bcrypt.hash(code, 12), expires_at: new Date(Date.now()+10*60000), attempts: 0 }, { upsert: true });
  await mailer.sendMail({ to: emailAddress, subject: purpose === 'reset' ? 'Reset your Digi Prime Nepal password' : 'Verify your Digi Prime Nepal email', text: 'Your verification code is ' + code + '. It expires in 10 minutes. If you did not request this, ignore this email.' });
}
async function consume(emailAddress, purpose, code) {
  const record = await Challenge.findOneAndUpdate({ email: emailAddress, purpose, attempts: { $lt: 5 }, expires_at: { $gt: new Date() } }, { $inc: { attempts: 1 } }, { new: true });
  if (!record || !await bcrypt.compare(code, record.code_hash)) fail(400, 'The code is invalid or expired. Request a new code.');
  const claimed = await Challenge.findOneAndDelete({ _id: record._id, code_hash: record.code_hash });
  if (!claimed) fail(400, 'This code has already been used.');
  return claimed;
}
router.get('/csrf', (req,res) => res.json({ csrf: generateToken(req) }));
router.get('/providers', (req,res) => res.json({ google: google.configured() }));

router.post('/send-otp', limited, async (req, res) => {
  const data = z.object({ email }).strict().parse(req.body);
  const otpCode = String(randomInt(100000, 999999));
  const Otp = require('../models/Otp');
  await Otp.deleteMany({ email: data.email });
  await Otp.create({
    email: data.email,
    code: otpCode,
    expires_at: Date.now() + 10 * 60 * 1000
  });

  const mailResult = await mailer.sendMail({
    to: data.email,
    subject: `🔐 Your Digi Prime Nepal Login Verification Code: ${otpCode}`,
    html: `<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#141416;color:#ffffff;border-radius:16px;border:1px solid #2a2a30;">
      <div style="text-align:center;margin-bottom:20px;">
        <h2 style="color:#e50914;margin:0;font-size:24px;letter-spacing:-0.5px;">Digi Prime Nepal</h2>
        <p style="color:#a1a1aa;font-size:13px;margin-top:4px;">Secure Account Authentication</p>
      </div>
      <div style="background:#1c1c20;padding:20px;border-radius:12px;text-align:center;border:1px solid #33333d;">
        <p style="margin:0 0 10px;color:#d4d4d8;font-size:14px;">Your 6-digit Login OTP Code is:</p>
        <div style="font-size:36px;font-weight:900;letter-spacing:6px;color:#ffffff;background:#27272a;padding:12px 20px;border-radius:8px;display:inline-block;border:1px solid #3f3f46;">${otpCode}</div>
        <p style="margin:12px 0 0;color:#71717a;font-size:12px;">This code will expire in 10 minutes. Do not share this code with anyone.</p>
      </div>
      <p style="color:#52525b;font-size:11px;text-align:center;margin-top:20px;">If you didn't request this code, you can safely ignore this email.</p>
    </div>`
  });

  res.json({
    success: true,
    message: mailResult.sent ? `OTP verification code sent to ${data.email}` : `OTP code generated (Development Mode). Check console or toast.`,
    dev_otp: mailResult.devMode ? otpCode : undefined
  });
});

router.post('/login-otp', limited, async (req, res) => {
  const data = z.object({ email, otp: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit OTP code.') }).strict().parse(req.body);
  const Otp = require('../models/Otp');
  const record = await Otp.findOne({ email: data.email, code: data.otp, expires_at: { $gt: Date.now() } });
  if (!record) fail(400, 'Invalid or expired OTP code. Please request a new OTP.');

  await Otp.deleteMany({ email: data.email });

  let user = await User.findOne({ email: data.email }).select('+mfa_secret +recovery_codes');
  if (!user) {
    const namePart = data.email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ');
    const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
    user = await User.create({
      id: randomUUID(),
      name: formattedName || 'Customer',
      email: data.email,
      password: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
      role: 'user',
      is_active: 1,
      auth_version: 0,
      mfa_enabled: false
    });
  }

  if (user.is_active !== 1) fail(401, 'This account has been disabled.');

  await Audit.create({ actor_id: user.id, action: 'GMAIL_OTP_LOGIN', target: 'account', outcome: 'completed', status: 200 });
  res.json(await signIn(req, user, true));
});

router.post('/test-email', auth, async (req, res) => {
  if (req.user.role !== 'admin') fail(403, 'Admin authorization required.');
  const data = z.object({ to: email }).strict().parse(req.body);
  const result = await mailer.sendMail({
    to: data.to,
    subject: '🧪 Digi Prime Nepal Gmail SMTP Test Email',
    html: `<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #333;">
      <h2 style="color:#e50914;">Digi Prime Nepal SMTP Configuration</h2>
      <p style="font-size:15px;color:#e4e4e7;">Congratulations! Your Gmail SMTP email setup is working perfectly!</p>
      <p style="font-size:13px;color:#a1a1aa;">Sent at: ${new Date().toLocaleString()}</p>
    </div>`
  });
  if (result.sent) {
    res.json({ success: true, message: `Test email successfully sent to ${data.to}` });
  } else if (result.devMode) {
    res.json({ success: false, devMode: true, message: 'SMTP settings are empty. Configure Gmail SMTP credentials below to send live emails.' });
  } else {
    fail(400, `Email delivery failed: ${result.error}`);
  }
});
router.get('/google/start', limit('google-start', 12, 900), async (req,res,next) => {
  if (!google.configured()) return res.redirect('/?auth=google-unavailable');
  try { const url = google.start(req); await new Promise((resolve,reject) => req.session.save(error => error ? reject(error) : resolve())); res.redirect(url); } catch (error) { next(error); }
});
router.get('/google/callback', limit('google-callback', 12, 900), async (req,res,_next) => {
  if (!google.configured()) return res.redirect('/?auth=google-unavailable');
  try {
    const code = typeof req.query.code === 'string' ? req.query.code : ''; const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) fail(400, 'Google sign-in was cancelled or could not be completed.');
    const profile = await google.finish(req, code, state);
    let user = await User.findOne({ $or: [{ google_subject: profile.subject }, { email: profile.email }] }).select('+mfa_secret +recovery_codes');
    if (!user) user = await User.create({ id: randomUUID(), name: profile.name, email: profile.email, password: await bcrypt.hash(randomBytes(48).toString('base64url'), 12), google_subject: profile.subject, role: 'user', is_active: 1, auth_version: 0, mfa_enabled: false });
    else if (!user.google_subject) { user.google_subject = profile.subject; await user.save(); }
    if (user.is_active !== 1) fail(401, 'This account is not active.');
    if (user.mfa_enabled) fail(403, 'Use your password to sign in because two-step verification is enabled for this account.');
    await Audit.create({ actor_id: user.id, action: 'GOOGLE_SIGN_IN', target: 'account', outcome: 'completed', status: 200 });
    await signIn(req, user); res.redirect('/?auth=google');
  } catch (error) {
    return res.redirect('/?auth=google-failed&message=' + encodeURIComponent(error.message || 'Google sign-in could not be completed'));
  }
});
router.post('/login', limited, async (req, res, next) => {
  try {
    const data = credentials.parse(req.body);
    const user = await User.findOne({ email: data.email }).select('+mfa_secret +recovery_codes');
    const valid = await bcrypt.compare(data.password, user?.password || dummyHash);
    if (!valid || !user || user.is_active !== 1) fail(401, 'Invalid email or password.');
    if (user.mfa_enabled && !data.code) return res.status(200).json({ requires_mfa: true });
    if (user.mfa_enabled && !await mfa.verify(user, data.code)) fail(401, 'Invalid or already used verification code.');
    await Audit.create({ actor_id: user.id, action: 'SIGN_IN', target: 'account', outcome: 'completed', status: 200 });
    res.json(await signIn(req, user, user.mfa_enabled));
  } catch (err) {
    next(err);
  }
});
router.post('/register', limited, async (req,res) => {
  const data = z.object({ name: text(100).min(2), email, password }).strict().parse(req.body);
  if (localAutoVerify) {
    if (await User.exists({ email: data.email })) fail(409, 'An account with these details already exists. Try signing in instead.');
    const user = await User.create({ id: randomUUID(), name: data.name, email: data.email, password: await bcrypt.hash(data.password,12), role: 'user', is_active: 1, auth_version: 0, mfa_enabled: false });
    await Audit.create({ actor_id: user.id, action: 'REGISTER', target: 'account', outcome: 'completed', status: 201 });
    return res.status(201).json({ ...await signIn(req,user), local_auto_verified: true });
  }
  if (!await mailer.configured()) fail(503,'Email is not configured. Contact the site administrator.');
  const hash = await bcrypt.hash(data.password,12);
  if (!await User.exists({ email: data.email })) await challenge(data.email,'register',{ name: data.name, password_hash: hash });
  res.json({ requires_otp: true, message: 'If this address can be registered, a verification code has been sent. Existing members can sign in.' });
});
router.post('/verify-otp', limited, async (req,res) => {
  const data = z.object({ email, otp: z.string().regex(/^\d{8}$/) }).strict().parse(req.body);
  const record = await consume(data.email,'register',data.otp);
  if (await User.exists({ email: data.email })) fail(400,'Unable to register. Try signing in.');
  const user = await User.create({ id: randomUUID(), name: record.name, email: data.email, password: record.password_hash, role: 'user' });
  res.status(201).json(await signIn(req,user));
});
router.post('/forgot-password', limited, async (req,res) => {
  const data = z.object({ email }).strict().parse(req.body);
  if (!await mailer.configured()) fail(503,'Email is not configured. Contact the site administrator.');
  const user = await User.findOne({ email: data.email, is_active: 1 });
  if (user) await challenge(data.email,'reset');
  else await bcrypt.hash(randomBytes(12).toString('hex'),12);
  res.json({ message: 'If an active account exists, a reset code has been sent.' });
});
router.post('/reset-password', limited, async (req,res) => {
  const data = z.object({ email, otp: z.string().regex(/^\d{8}$/), password }).strict().parse(req.body);
  await consume(data.email,'reset',data.otp);
  const user = await User.findOneAndUpdate({ email: data.email, is_active: 1 }, { password: await bcrypt.hash(data.password,12), $inc: { auth_version: 1 } });
  if (!user) fail(400,'Unable to reset this account.');
  await Audit.create({ actor_id:user.id, action:'PASSWORD_RESET', target:'account', outcome:'completed', status:200 });
  res.json({ message:'Password updated. Sign in with your new password; two-step verification remains enabled if previously configured.' });
});
router.get('/me',auth,(req,res) => res.json({ ...safe(req.user), csrf: generateToken(req) }));
router.post('/logout',(req,res,next) => req.session.destroy(error => { if(error) return next(error); res.clearCookie(production ? '__Host-dn.sid' : 'dn.sid',{ path:'/', httpOnly:true, sameSite:'lax', secure:production }); res.json({ message:'Signed out.' }); }));
router.post('/password',auth,limit('password',6,900,req=>req.user.id),async(req,res)=>{
  const data=z.object({ current_password:z.string().max(256), password }).strict().parse(req.body);
  const user=await User.findOne({id:req.user.id});
  if(!await bcrypt.compare(data.current_password,user.password)) fail(400,'Current password is incorrect.');
  await User.updateOne({id:user.id},{password:await bcrypt.hash(data.password,12),$inc:{auth_version:1}});
  await Audit.create({actor_id:user.id,action:'PASSWORD_CHANGE',target:'account',outcome:'completed',status:200});
  await new Promise((resolve,reject)=>req.session.destroy(e=>e?reject(e):resolve()));
  res.json({message:'Password changed. Please sign in again.'});
});
router.post('/mfa/setup',auth,limit('mfa-setup',5,900,req=>req.user.id),async(req,res)=>{
  const data=z.object({ password:z.string().max(256) }).strict().parse(req.body);
  const user=await User.findOne({id:req.user.id});
  if(user.mfa_enabled) fail(409,'Two-step verification is already enabled.');
  if(!await bcrypt.compare(data.password,user.password)) fail(400,'Password is incorrect.');
  const secret=new mfa.OTPAuth.Secret({size:20}).base32;
  req.session.mfaPending=await mfa.seal(secret);req.session.mfaExpires=Date.now()+10*60000;
  res.json({secret,uri:mfa.totp(secret,user.email).toString()});
});
router.post('/mfa/confirm',auth,limit('mfa-confirm',10,900,req=>req.user.id),async(req,res)=>{
  const data=z.object({code:z.string().regex(/^\d{6}$/)}).strict().parse(req.body);
  if(!req.session.mfaPending || req.session.mfaExpires<Date.now()) fail(400,'Start two-step verification setup again.');
  const secret=await mfa.unseal(req.session.mfaPending);
  const instance=mfa.totp(secret,req.user.email);
  const delta=instance.validate({token:data.code,window:1});
  if(delta===null) fail(400,'Verification code is incorrect.');
  const recovery=Array.from({length:8},()=>randomBytes(12).toString('hex'));
  const updated=await User.findOneAndUpdate({id:req.user.id,mfa_enabled:{$ne:true}},{mfa_enabled:true,mfa_secret:req.session.mfaPending,mfa_step:instance.counter()+delta,recovery_codes:recovery.map(mfa.digest),$inc:{auth_version:1}},{new:true});
  if(!updated) fail(409,'Two-step verification is already enabled.');
  const signed=await signIn(req,updated,true);
  await Audit.create({actor_id:req.user.id,action:'MFA_ENABLED',target:'account',outcome:'completed',status:200});
  res.json({...signed,recovery_codes:recovery});
});
module.exports=router;
