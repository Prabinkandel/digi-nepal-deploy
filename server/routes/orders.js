const router=require('express').Router();
const {randomUUID}=require('node:crypto');
const auth=require('../middleware/auth'),admin=require('../middleware/adminAuth'),limit=require('../middleware/limits');
const {z,id,text,fail,query,page,searchFilter}=require('../utils/validation');
const Order=require('../models/Order'),Product=require('../models/Product'),User=require('../models/User');
const {decorate}=require('../utils/catalog');
const mailer=require('../utils/mailer');

router.post('/',auth,limit('orders',20,3600,req=>req.user.id),async(req,res)=>{
 const data=z.object({product_id:id,request_key:z.string().uuid()}).strict().parse(req.body);
 const existing=await Order.findOne({request_key:data.request_key,user_id:req.user.id}).lean();
 if(existing)return res.json(existing);
 const product=await Product.findOne({id:data.product_id,is_active:1}).lean();
 if(!product)fail(404,'This product is unavailable.');
 const current=(await decorate([product]))[0];
 const order=await Order.create({id:randomUUID(),user_id:req.user.id,product_id:product.id,product_name:product.name,price:current.price,status:'pending',request_key:data.request_key});
 
 const refCode = String(order.id).slice(0, 8).toUpperCase();
 const adminEmail = await mailer.getAdminEmail();

 // 1. Notify Customer
 if(req.user && req.user.email){
   mailer.sendMail({
     to:req.user.email,
     subject:`🛒 Order Confirmation - Ref #${refCode}`,
     html:`<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
       <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal</h2>
       <h3 style="margin:0 0 10px;color:#4ade80;">Order Placed Successfully!</h3>
       <p>Hello <strong>${req.user.name || 'Customer'}</strong>,</p>
       <p>Thank you for your order of <strong>${order.product_name}</strong>.</p>
       <div style="background:#1c1c20;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #333;">
         <p style="margin:4px 0;">Order Ref: <strong>#${refCode}</strong></p>
         <p style="margin:4px 0;">Product: <strong>${order.product_name}</strong></p>
         <p style="margin:4px 0;">Total Amount: <strong>Rs ${Number(order.price).toLocaleString()}</strong></p>
         <p style="margin:4px 0;">Status: <span style="color:#fbbf24;font-weight:bold;">PENDING PAYMENT</span></p>
       </div>
       <p style="color:#a1a1aa;font-size:13px;margin-top:16px;">Complete your payment via WhatsApp or QR Code scan to activate your subscription.</p>
     </div>`
   }).catch(()=>{});
 }

 // 2. Notify Admin Gmail
 if(adminEmail){
   mailer.sendMail({
     to:adminEmail,
     subject:`🚨 NEW ORDER PLACED: ${order.product_name} (Ref #${refCode})`,
     html:`<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
       <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal Admin Alert</h2>
       <h3 style="margin:0 0 10px;color:#38bdf8;">New Customer Order Placed!</h3>
       <div style="background:#1c1c20;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #333;">
         <p style="margin:4px 0;">Customer: <strong>${req.user.name} (${req.user.email})</strong></p>
         <p style="margin:4px 0;">Product: <strong>${order.product_name}</strong></p>
         <p style="margin:4px 0;">Price: <strong>Rs ${Number(order.price).toLocaleString()}</strong></p>
         <p style="margin:4px 0;">Ref Code: <strong>#${refCode}</strong></p>
       </div>
       <p><a href="${process.env.APP_URL || ''}/admin" style="display:inline-block;padding:10px 18px;background:#e50914;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Open Admin Dashboard →</a></p>
     </div>`
   }).catch(()=>{});
 }

 res.status(201).json(order);
});

router.get('/my',auth,async(req,res)=>res.json(await page(Order,{user_id:req.user.id},query(req))));

router.get('/all',admin,async(req,res)=>{
 const q=query(req);let filter={};
 if(q.search){
   const matchingUsers=await User.find(searchFilter(q.search,['name','email'])).select('id').lean();
   const userIds=matchingUsers.map(u=>u.id);
   const searchRegex={ $regex: q.search.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'), $options: 'i' };
   filter.$or=[
     { product_name: searchRegex },
     { id: searchRegex },
     { user_id: { $in: userIds } }
   ];
 }
 if(q.status)filter.status=z.enum(['pending','verified','rejected','delivered']).parse(q.status);
 const result=await page(Order,filter,q);
 const users=await User.find({id:{$in:result.items.map(o=>o.user_id)}}).select('id name email').lean();
 result.items=result.items.map(o=>({...o,user_name:users.find(u=>u.id===o.user_id)?.name||'Unknown',user_email:users.find(u=>u.id===o.user_id)?.email||''}));
 res.json(result);
});

router.put('/:id/status',admin,async(req,res)=>{
 const data=z.object({status:z.enum(['pending','verified','rejected','delivered']),note:text(1000).default('')}).strict().parse(req.body);
 const orderId=id.parse(req.params.id);
 let order;
 try {
  order=await require('mongoose').connection.transaction(async session=>{
   const current=await Order.findOne({id:orderId}).session(session);
   if(!current)fail(404,'Order not found.');
   current.status=data.status;if(data.note)current.note=data.note;await current.save({session});return current;
  });
 } catch(err) {
  if(/Transaction numbers are only allowed|replica set|transactions are not supported/i.test(String(err?.message||''))){
   const current=await Order.findOne({id:orderId});
   if(!current)fail(404,'Order not found.');
   current.status=data.status;if(data.note)current.note=data.note;await current.save();
   order=current;
  } else { throw err; }
 }

 const user = await User.findOne({ id: order.user_id }).lean();
 const adminEmail = await mailer.getAdminEmail();
 const refCode = String(order.id).slice(0, 8).toUpperCase();

 const statusTitles = {
   delivered: '🎉 Your Subscription is DELIVERED & Active!',
   verified: '✅ Order & Payment VERIFIED!',
   rejected: '❌ Order Update: REJECTED',
   pending: '⏳ Order Status Updated to PENDING'
 };

 const statusColors = {
   delivered: '#4ade80',
   verified: '#60a5fa',
   rejected: '#f87171',
   pending: '#fbbf24'
 };

 // 1. Send Email to Customer
 if(user && user.email){
   mailer.sendMail({
     to: user.email,
     subject: `📦 Order ${data.status.toUpperCase()}: ${order.product_name} (Ref #${refCode})`,
     html: `<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
       <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal</h2>
       <h3 style="margin:0 0 10px;color:${statusColors[data.status]};">${statusTitles[data.status] || `Order ${data.status}`}</h3>
       <p>Hello <strong>${user.name}</strong>,</p>
       <p>Your order for <strong>${order.product_name}</strong> has been updated to <strong style="color:${statusColors[data.status]}">${data.status.toUpperCase()}</strong>.</p>
       <div style="background:#1c1c20;padding:16px;border-radius:8px;margin:16px 0;border:1px solid #333;">
         <p style="margin:4px 0;">Order Ref: <strong>#${refCode}</strong></p>
         <p style="margin:4px 0;">Product: <strong>${order.product_name}</strong></p>
         <p style="margin:4px 0;">Status: <strong style="color:${statusColors[data.status]}">${data.status.toUpperCase()}</strong></p>
         ${data.note ? `<p style="margin:8px 0 0;padding-top:8px;border-top:1px solid #333;color:#d4d4d8;">Note: ${data.note}</p>` : ''}
       </div>
       <p style="color:#a1a1aa;font-size:13px;margin-top:16px;">You can view your order history anytime by signing into your account on Digi Prime Nepal.</p>
     </div>`
   }).catch(()=>{});
 }

 // 2. Send Email to Admin Gmail
 if(adminEmail){
   mailer.sendMail({
     to: adminEmail,
     subject: `🔔 Admin Update: Order #${refCode} set to ${data.status.toUpperCase()}`,
     html: `<div style="font-family:sans-serif;padding:24px;background:#141416;color:#ffffff;border-radius:12px;border:1px solid #2a2a30;">
       <h2 style="color:#e50914;margin:0 0 16px;">Digi Prime Nepal Admin Log</h2>
       <h3 style="margin:0 0 10px;">Order Status Changed</h3>
       <p>Order Reference: <strong>#${refCode}</strong></p>
       <p>Customer: <strong>${user?.name || 'Customer'} (${user?.email || ''})</strong></p>
       <p>Product: <strong>${order.product_name}</strong></p>
       <p>New Status: <strong style="color:${statusColors[data.status]}">${data.status.toUpperCase()}</strong></p>
       ${data.note ? `<p>Note: ${data.note}</p>` : ''}
     </div>`
   }).catch(()=>{});
 }

 res.json(order);
});

module.exports=router;
