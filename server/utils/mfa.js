const OTPAuth = require('otpauth');
const Iron = require('@hapi/iron');
const { createHash } = require('node:crypto');
const User = require('../models/User');
const key = () => process.env.MFA_ENCRYPTION_KEY || process.env.SESSION_SECRET;
const seal = value => Iron.seal(value, key(), Iron.defaults);
const unseal = value => Iron.unseal(value, key(), Iron.defaults);
const digest = value => createHash('sha256').update(value).digest('hex');
function totp(secret, email) { return new OTPAuth.TOTP({ issuer: 'Digi Prime Nepal', label: email, secret }); }
async function verify(user, token) {
  if (!user.mfa_enabled) return false;
  if (/^[a-f0-9]{24}$/.test(token)) {
    const result = await User.updateOne({ id: user.id, recovery_codes: digest(token) }, { $pull: { recovery_codes: digest(token) } });
    return result.modifiedCount === 1;
  }
  if (!/^\d{6}$/.test(token)) return false;
  const instance = totp(await unseal(user.mfa_secret), user.email);
  const delta = instance.validate({ token, window: 1 });
  if (delta === null) return false;
  const step = instance.counter() + delta;
  const result = await User.updateOne({ id: user.id, $or: [{ mfa_step: { $lt: step } }, { mfa_step: { $exists: false } }] }, { mfa_step: step });
  return result.modifiedCount === 1;
}
module.exports = { seal, unseal, totp, verify, digest, OTPAuth };
