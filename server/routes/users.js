const router=require('express').Router();
const admin=require('../middleware/adminAuth');
const User=require('../models/User'),Order=require('../models/Order'),Product=require('../models/Product'),Payment=require('../models/Payment'),Audit=require('../models/Audit');
const {z,id,flag,fail,query,page,searchFilter}=require('../utils/validation');
router.use(admin);
router.get('/stats',async(req,res)=>{
 const [totalUsers,totalOrders,pendingOrders,totalProducts,verified,pendingPayments,recentOrders]=await Promise.all([User.countDocuments(),Order.countDocuments(),Order.countDocuments({status:'pending'}),Product.countDocuments({is_active:1}),Payment.aggregate([{$match:{status:'verified'}},{$group:{_id:null,total:{$sum:'$amount'}}}]),Payment.countDocuments({status:'pending'}),Order.find().sort({created_at:-1}).limit(5).select('-_id -__v').lean()]);
 const settings=await require('../utils/settings').getSettings();
 res.json({totalUsers,totalOrders,pendingOrders,totalProducts,revenue:verified[0]?.total||0,pendingPayments,recentOrders,setup:{email:require('../utils/mailer').configured(),payment_qr:!!settings.payment_qr_url,policies:!!(settings.terms&&settings.privacy&&settings.refunds),mfa:req.user.mfa_enabled}});
});
router.get('/audit',async(req,res)=>{
 const q=query(req);res.json(await page(Audit,{...searchFilter(q.search,['actor_id','action','target'])},q));
});
router.get('/',async(req,res)=>{
 const q=query(req),filter={...searchFilter(q.search,['name','email'])};
 if(q.status)filter.is_active=q.status==='active'?1:0;
 const result=await page(User,filter,q,'id name email role is_active mfa_enabled created_at');
 if(result.items.length){
  const pays=await Payment.find({user_id:{$in:result.items.map(u=>u.id)}}).sort({created_at:-1}).select('user_id phone').lean();
  const latest={};
  for(const pay of pays){ if(pay.phone&&!latest[pay.user_id])latest[pay.user_id]=pay.phone; }
  result.items=result.items.map(u=>({...u,phone:latest[u.id]||''}));
 }
 res.json(result);
});
router.get('/:id/activity',async(req,res)=>{
 const user=await User.findOne({id:id.parse(req.params.id)}).select('id name email role is_active created_at').lean();
 if(!user)fail(404,'Account not found.');
 const [orders,payments,events]=await Promise.all([
  Order.find({user_id:user.id}).sort({created_at:-1}).limit(20).select('id product_name price status created_at').lean(),
  Payment.find({user_id:user.id}).sort({created_at:-1}).limit(20).select('id product_name amount payment_method status phone created_at').lean(),
  Audit.find({actor_id:user.id}).sort({created_at:-1}).limit(50).select('action target outcome detail created_at').lean()
 ]);
 const lastSignIn=events.find(e=>['SIGN_IN','GOOGLE_SIGN_IN','GMAIL_OTP_LOGIN'].includes(e.action));
 res.json({user,last_sign_in:lastSignIn?lastSignIn.created_at:null,orders,payments,events});
});
router.post('/:id/email',async(req,res)=>{
 const data=z.object({subject:z.string().trim().min(2).max(150),message:z.string().trim().min(2).max(4000)}).strict().parse(req.body);
 const user=await User.findOne({id:id.parse(req.params.id)}).select('name email').lean();
 if(!user)fail(404,'Account not found.');
 const mailer=require('../utils/mailer');
 const esc=t=>t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
 let msgHtml=esc(data.message).replace(/\n/g,'<br>');
 msgHtml=msgHtml.replace(/https:\/\/wa\.me\/\d+/g,function(u){return '<a href="'+u+'" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;font-weight:700;padding:9px 18px;border-radius:999px;font-size:13.5px">\u{1F4AC} Chat on WhatsApp</a>';});
 const bodyHtml='<p style="margin:0 0 10px">Hello <strong>'+esc(user.name)+'</strong>,</p><p style="margin:0;line-height:1.65">'+msgHtml+'</p>';
 const result=await mailer.sendMail({to:user.email,subject:data.subject,html:mailer.wrapEmail('', '', bodyHtml)});
 if(!result.sent)fail(502,'Email could not be sent. Check the store email settings.');
 res.json({sent:true});
});
router.put('/:id',async(req,res)=>{
 const data=z.object({role:z.enum(['user','editor','admin']).optional(),is_active:flag.optional()}).strict().parse(req.body);
 const userId=id.parse(req.params.id);
 const user=await User.findOne({id:userId});
 if(!user)fail(404,'Account not found.');
 if(user.id===req.user.id)fail(403,'You cannot change your own role or disable your own account.');
 // Other administrator accounts are intentionally protected from demotion/disable.
 if(user.role==='admin'&&(data.role&&data.role!=='admin'||data.is_active===0))fail(403,'Administrator recovery requires the server operator.');
 const result=await User.findOneAndUpdate({id:userId},{$set:data,$inc:{auth_version:1}},{new:true}).select('id name email role is_active mfa_enabled');
 res.json(result);
});
module.exports=router;
