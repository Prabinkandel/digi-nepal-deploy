const router=require('express').Router();
const {randomUUID}=require('node:crypto');
const auth=require('../middleware/auth'),admin=require('../middleware/adminAuth'),limit=require('../middleware/limits');
const {z,id,text,fail,query,page,searchFilter}=require('../utils/validation');
const Payment=require('../models/Payment'),Order=require('../models/Order'),Media=require('../models/Media'),User=require('../models/User');
const database=require('mongoose').connection;
const mailer=require('../utils/mailer');

const unsupportedTransaction=error=>/Transaction numbers are only allowed|replica set|transactions are not supported/i.test(String(error?.message||''));

async function submitPayment(data,media,userId){
 const fallback=async()=>{
  const paymentId=randomUUID();
  const order=await Order.findOneAndUpdate({id:data.order_id,user_id:userId,status:'pending',payment_id:null},{$set:{payment_id:paymentId}},{returnDocument:'after'});
  if(!order)fail(409,'This order already has a payment or is no longer pending.');
  try{
    const [record]=await Payment.create([{...data,id:paymentId,user_id:userId,product_name:order.product_name,amount:order.price,screenshot_url:'/api/media/'+media.id,dedupe_key:data.payment_method.toLowerCase()+':'+data.transaction_id.toLowerCase().replace(/\s+/g,'')}]);
    return record;
  }catch(error){
    await Order.updateOne({id:order.id,payment_id:paymentId},{$set:{payment_id:null}});
    throw error;
  }
 };
 try{
  return await database.transaction(async session=>{
   const order=await Order.findOne({id:data.order_id,user_id:userId}).session(session);
   if(!order)fail(404,'Order not found.');
   if(order.status!=='pending'||order.payment_id)fail(409,'This order already has a payment or is no longer pending.');
   const paymentId=randomUUID();
   const [record]=await Payment.create([{...data,id:paymentId,user_id:userId,product_name:order.product_name,amount:order.price,screenshot_url:'/api/media/'+media.id,dedupe_key:data.payment_method.toLowerCase()+':'+data.transaction_id.toLowerCase().replace(/\s+/g,'')}],{session});
   order.payment_id=paymentId;
   await order.save({session});
   return record;
  });
 }catch(error){
  if(unsupportedTransaction(error))return fallback();
  throw error;
 }
}

router.post('/',auth,limit('payments',15,3600,req=>req.user.id),async(req,res)=>{
 const data=z.object({order_id:id,payer_name:text(100).min(2),transaction_id:text(100).min(3).regex(/^[a-zA-Z0-9 _-]+$/),payment_method:text(40).min(2),phone:text(40).default(''),note:text(1000).default(''),media_id:id}).strict().parse(req.body);
 const settings=await require('../utils/settings').getSettings();
 if(!settings.payment_methods.split(',').map(s=>s.trim()).includes(data.payment_method))fail(400,'Choose an available payment method.');
 const media=await Media.findOne({id:data.media_id,owner_id:req.user.id,purpose:'receipt',is_active:1});
 if(!media)fail(400,'Upload a receipt belonging to your account.');
 
 const payment=await submitPayment(data,media,req.user.id);
 const refCode = String(payment.order_id).slice(0, 8).toUpperCase();
 const adminEmail = await mailer.getAdminEmail();

 // 1. Notify Customer
 if(req.user && req.user.email){
   mailer.sendMail({
     to: req.user.email,
     subject: `💳 Payment Receipt Submitted - Ref #${refCode}`,
     html: `<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
       <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal</h2>
       <h3 style="margin:0 0 10px;color:#60a5fa;">Payment Proof Received!</h3>
       <p>Hello <strong>${req.user.name}</strong>,</p>
       <p>We received your payment proof for <strong>${payment.product_name}</strong>.</p>
       <div style="background:#1c1c20;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #333;">
         <p style="margin:4px 0;">Order Ref: <strong>#${refCode}</strong></p>
         <p style="margin:4px 0;">Payment Method: <strong>${payment.payment_method}</strong></p>
         <p style="margin:4px 0;">Txn ID: <strong>${payment.transaction_id}</strong></p>
         <p style="margin:4px 0;">Amount: <strong>Rs ${Number(payment.amount).toLocaleString()}</strong></p>
         <p style="margin:4px 0;">Status: <span style="color:#fbbf24;font-weight:bold;">AWAITING VERIFICATION</span></p>
       </div>
       <p style="color:#a1a1aa;font-size:13px;margin-top:16px;">Our verification team will review your transaction and activate your subscription shortly.</p>
     </div>`
   }).catch(()=>{});
 }

 // 2. Notify Admin Gmail
 if(adminEmail){
   mailer.sendMail({
     to: adminEmail,
     subject: `🚨 NEW PAYMENT PROOF SUBMITTED: Rs ${payment.amount} (Ref #${refCode})`,
     html: `<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
       <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal Admin Alert</h2>
       <h3 style="margin:0 0 10px;color:#fbbf24;">New Payment Submitted for Review!</h3>
       <div style="background:#1c1c20;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #333;">
         <p style="margin:4px 0;">Customer: <strong>${req.user.name} (${req.user.email})</strong></p>
         <p style="margin:4px 0;">Product: <strong>${payment.product_name}</strong></p>
         <p style="margin:4px 0;">Amount: <strong>Rs ${Number(payment.amount).toLocaleString()}</strong></p>
         <p style="margin:4px 0;">Method: <strong>${payment.payment_method}</strong></p>
         <p style="margin:4px 0;">Txn ID: <strong>${payment.transaction_id}</strong></p>
       </div>
       <p><a href="${process.env.APP_URL || ''}/admin" style="display:inline-block;padding:10px 18px;background:#e50914;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Verify Payment in Admin Panel →</a></p>
     </div>`
   }).catch(()=>{});
 }

 res.status(201).json({payment_id:payment.id,message:'Receipt saved. Payment is awaiting manual verification.'});
});

router.get('/my',auth,async(req,res)=>res.json(await page(Payment,{user_id:req.user.id},query(req))));

router.get('/all',admin,async(req,res)=>{
 const q=query(req),filter={...searchFilter(q.search,['transaction_id','product_name','payer_name'])};
 if(q.status)filter.status=z.enum(['pending','verified','rejected']).parse(q.status);
 const result=await page(Payment,filter,q);
 const users=await User.find({id:{$in:result.items.map(p=>p.user_id)}}).select('id name email').lean();
 result.items=result.items.map(p=>({...p,user_email:users.find(u=>u.id===p.user_id)?.email||''}));
 res.json(result);
});

router.put('/:id/status',admin,async(req,res)=>{
 const data=z.object({status:z.enum(['verified','rejected']),admin_note:text(1000).default('')}).strict().parse(req.body);
  const updatePaymentStatus = async (session) => {
    const payment = session ? await Payment.findOne({id:id.parse(req.params.id)}).session(session) : await Payment.findOne({id:id.parse(req.params.id)});
    if(!payment)fail(404,'Payment not found.');
    if(payment.status!=='pending')fail(409,'This payment has already been reviewed.');
    const order = session ? await Order.findOne({id:payment.order_id,user_id:payment.user_id}).session(session) : await Order.findOne({id:payment.order_id,user_id:payment.user_id});
    if(!order||order.status!=='pending'||payment.amount!==order.price)fail(409,'The payment does not match a pending order. Resolve the legacy record before proceeding.');
    payment.status=data.status;payment.admin_note=data.admin_note;
    if (session) await payment.save({session}); else await payment.save();
    order.status=data.status==='verified'?'verified':'pending';order.payment_id=data.status==='verified'?payment.id:null;
    if (session) await order.save({session}); else await order.save();
    return payment;
  };
  let result;
  try {
    result = await require('mongoose').connection.transaction(session => updatePaymentStatus(session));
  } catch(err) {
    if (unsupportedTransaction(err)) result = await updatePaymentStatus(null);
    else throw err;
  }

 const user = await User.findOne({ id: result.user_id }).lean();
 const adminEmail = await mailer.getAdminEmail();
 const refCode = String(result.order_id).slice(0, 8).toUpperCase();

 // 1. Notify Customer
 if(user && user.email){
   mailer.sendMail({
     to: user.email,
     subject: `💳 Payment Update: ${data.status.toUpperCase()} - ${result.product_name}`,
     html: `<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
       <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal</h2>
       <h3 style="margin:0 0 10px;color:${data.status==='verified'?'#4ade80':'#f87171'};">Payment ${data.status.toUpperCase()}</h3>
       <p>Hello <strong>${user.name}</strong>,</p>
       <p>Your payment of <strong>Rs ${Number(result.amount).toLocaleString()}</strong> for <strong>${result.product_name}</strong> has been <strong style="color:${data.status==='verified'?'#4ade80':'#f87171'}">${data.status.toUpperCase()}</strong>.</p>
       <div style="background:#1c1c20;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #333;">
         <p style="margin:4px 0;">Order Ref: <strong>#${refCode}</strong></p>
         <p style="margin:4px 0;">Txn ID: <strong>${result.transaction_id}</strong></p>
         <p style="margin:4px 0;">Status: <strong style="color:${data.status==='verified'?'#4ade80':'#f87171'}">${data.status.toUpperCase()}</strong></p>
         ${data.admin_note ? `<p style="margin:8px 0 0;padding-top:8px;border-top:1px solid #333;color:#d4d4d8;">Admin Note: ${data.admin_note}</p>` : ''}
       </div>
     </div>`
   }).catch(()=>{});
 }

 // 2. Notify Admin Gmail
 if(adminEmail){
   mailer.sendMail({
     to: adminEmail,
     subject: `🔔 Admin Log: Payment #${refCode} ${data.status.toUpperCase()}`,
     html: `<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
       <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal Admin Log</h2>
       <h3 style="margin:0 0 10px;">Payment Status Reviewed</h3>
       <p>Order Reference: <strong>#${refCode}</strong></p>
       <p>Customer: <strong>${user?.name || 'Customer'} (${user?.email || ''})</strong></p>
       <p>Product: <strong>${result.product_name}</strong></p>
       <p>New Status: <strong style="color:${data.status==='verified'?'#4ade80':'#f87171'}">${data.status.toUpperCase()}</strong></p>
       ${data.admin_note ? `<p>Note: ${data.admin_note}</p>` : ''}
     </div>`
   }).catch(()=>{});
 }

 res.json(result);
});

module.exports=router;
