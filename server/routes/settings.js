const router=require('express').Router();
const Setting=require('../models/Setting');
const User=require('../models/User');
const admin=require('../middleware/adminAuth');
const {z,fail}=require('../utils/validation');
const {schemas,getSettings}=require('../utils/settings');
const {production}=require('../config/runtime');
// Keys safe to expose to anonymous visitors: public site content and checkout
// details only. SMTP credentials (smtp_*) and mail preferences must never be
// served publicly — they are only returned to a verified admin request below.
const PUBLIC_SETTING_KEYS=['site_name','tagline','hero_title','hero_description','about_title','about_body','footer_text','contact_email','contact_phone','whatsapp_number','address','theme','logo_url','payment_qr_url','payment_instructions','payment_methods','payment_account','nav_links','footer_links','privacy','terms','refunds'];
function publicSettings(all){
 const out={};
 for(const key of PUBLIC_SETTING_KEYS)out[key]=all[key];
 return out;
}
// The admin Settings screen loads through this same GET, so full settings are
// returned only when the request clears the same bar as the admin write
// routes: a valid signed-in session, the admin role, and (in production) a
// completed two-step verification. Anything else gets the public subset.
async function isAdminRequest(req){
 try{
  if(!req.session||!req.session.userId)return false;
  if(Date.now()-req.session.signedInAt>8*60*60*1000)return false;
  const user=await User.findOne({id:req.session.userId}).select('role is_active auth_version mfa_enabled').lean();
  if(!user||user.is_active!==1||(user.auth_version||0)!==req.session.authVersion)return false;
  if(user.role!=='admin')return false;
  if((production||process.env.REQUIRE_ADMIN_MFA==='true')&&(!user.mfa_enabled||!req.session.mfaVerified))return false;
  return true;
 }catch{return false;}
}
router.get('/',async(req,res)=>{
 const all=await getSettings();
 res.json(await isAdminRequest(req)?all:publicSettings(all));
});
router.put('/',admin,async(req,res)=>{
 const data=z.record(z.string(),z.string()).parse(req.body);
 if(Object.keys(data).length>30)fail(400,'Too many settings.');
 const updates=[];
 for(const [key,value]of Object.entries(data)){
  if(!schemas[key])fail(400,'Unknown setting: '+key);
  updates.push({key,value:schemas[key].parse(value)});
 }
 for(const item of updates){
  await Setting.findOneAndUpdate({key:item.key},{value:item.value},{upsert:true});
 }
 res.json(await getSettings());
});
router.post('/',admin,async(req,res)=>{
 const {key,value}=z.object({key:z.string(),value:z.string()}).strict().parse(req.body);
 if(!schemas[key])fail(400,'Unknown setting.');
 await Setting.findOneAndUpdate({key},{value:schemas[key].parse(value)},{upsert:true});
 res.json(await getSettings());
});
module.exports=router;
