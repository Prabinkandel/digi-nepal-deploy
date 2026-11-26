const router=require('express').Router();
const {randomUUID}=require('node:crypto');
const auth=require('../middleware/auth'),admin=require('../middleware/adminAuth'),limit=require('../middleware/limits');
const {z,id,text,fail,query,page,searchFilter}=require('../utils/validation');
const Order=require('../models/Order'),Product=require('../models/Product'),User=require('../models/User'),Payment=require('../models/Payment');
const Audit=require('../models/Audit');
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
 Audit.create({actor_id:req.user.id,action:'ORDER_PLACED',target:'order',outcome:'completed',status:201,detail:'#'+refCode+' '+order.product_name+' Rs '+Number(order.price).toLocaleString()}).catch(()=>{});
 const adminEmail = await mailer.getAdminEmail();

 // 1. Notify Customer
 if(req.user && req.user.email){
   mailer.sendMail({
     to:req.user.email,
     subject:`🛒 Order Confirmation - Ref #${refCode}`,
     html: mailer.wrapEmail('Order placed successfully!', '#15803d', `<p style="margin:0 0 10px">Hello <strong>${req.user.name || 'Customer'}</strong>,</p><p style="margin:0 0 10px">Thank you for your order of <strong>${order.product_name}</strong>.</p><div style="background:#f6f6f8;padding:14px 16px;border-radius:10px;margin:14px 0"><p style="margin:3px 0">Order Ref: <strong>#${refCode}</strong></p><p style="margin:3px 0">Product: <strong>${order.product_name}</strong></p><p style="margin:3px 0">Total: <strong>Rs ${Number(order.price).toLocaleString()}</strong></p><p style="margin:3px 0">Status: <strong style="color:#b45309">PENDING PAYMENT</strong></p></div><p style="color:#55555e;font-size:13px;margin:0">Complete your payment by QR scan on the website to activate your subscription.</p>`)
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
   const matchingPayments=await Payment.find({phone:searchRegex}).select('order_id').lean();
   filter.$or=[
     { product_name: searchRegex },
     { id: searchRegex },
     { user_id: { $in: userIds } },
     { id: { $in: matchingPayments.map(p=>p.order_id) } }
   ];
 }
 if(q.status)filter.status=z.enum(['pending','verified','rejected','delivered']).parse(q.status);
 const result=await page(Order,filter,q);
 const users=await User.find({id:{$in:result.items.map(o=>o.user_id)}}).select('id name email').lean();
 const orderIds=result.items.map(o=>o.id);
 const payments=orderIds.length?await Payment.find({order_id:{$in:orderIds}}).sort({created_at:-1}).lean():[];
 const payByOrder={};
 for(const p of payments){if(!payByOrder[p.order_id])payByOrder[p.order_id]=p;}
 result.items=result.items.map(o=>{const p=payByOrder[o.id];return {...o,user_name:users.find(u=>u.id===o.user_id)?.name||'Unknown',user_email:users.find(u=>u.id===o.user_id)?.email||'',payment_phone:p?.phone||'',payment_screenshot:p?.screenshot_url||'',payment_method:p?.payment_method||'',payment_txn:p?.transaction_id||'',payment_status:p?.status||'',payer_name:p?.payer_name||''};});
 const [cAll,cPending,cVerified,cDelivered,cRejected]=await Promise.all([Order.countDocuments({}),Order.countDocuments({status:'pending'}),Order.countDocuments({status:'verified'}),Order.countDocuments({status:'delivered'}),Order.countDocuments({status:'rejected'})]);
 result.counts={all:cAll,pending:cPending,verified:cVerified,delivered:cDelivered,rejected:cRejected};
 res.json(result);
});


router.post('/deliver-all',admin,async(req,res)=>{
 const open=await Order.find({status:{$nin:['delivered','rejected']}});
 let delivered=0;
 for(const order of open){
  order.status='delivered'; await order.save(); delivered++;
  const user=await User.findOne({id:order.user_id}).lean();
  if(user&&user.email){
   mailer.sendMail({to:user.email,subject:'\u{1F389} Your Subscription is DELIVERED & Active!',html:mailer.wrapEmail('Order DELIVERED', '#15803d', '<p style="margin:0 0 10px">Hello <strong>'+user.name+'</strong>,</p><p style="margin:0 0 10px">Your order for <strong>'+order.product_name+'</strong> has been <strong style="color:#15803d">DELIVERED</strong>. Enjoy!</p><p style="margin:3px 0">Order Ref: <strong>#'+String(order.id).slice(0,8).toUpperCase()+'</strong></p>')}).catch(()=>{});
  }
 }
 res.json({delivered});
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
     html: mailer.wrapEmail(statusTitles[data.status] || `Order ${data.status}`, ({delivered:'#15803d',verified:'#1d4ed8',rejected:'#dc2626',pending:'#b45309'})[data.status] || '#17171c', `<p style="margin:0 0 10px">Hello <strong>${user.name}</strong>,</p><p style="margin:0 0 10px">Your order for <strong>${order.product_name}</strong> is now <strong>${data.status.toUpperCase()}</strong>.</p><div style="background:#f6f6f8;padding:14px 16px;border-radius:10px;margin:14px 0"><p style="margin:3px 0">Order Ref: <strong>#${refCode}</strong></p><p style="margin:3px 0">Product: <strong>${order.product_name}</strong></p>${data.note ? `<p style="margin:8px 0 0;padding-top:8px;border-top:1px solid #e2e2e8;color:#33333a">Note: ${data.note}</p>` : ''}</div><p style="color:#55555e;font-size:13px;margin:0">You can view your order history anytime by signing into your account.</p>`)
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

router.delete('/bulk-all',admin,async(req,res)=>{
 const result=await Order.deleteMany({});
 res.json({deleted:result.deletedCount||0});
});

router.delete('/:id',admin,async(req,res)=>{
 const orderId=id.parse(req.params.id);
 const order=await Order.findOneAndDelete({id:orderId});
 if(!order)fail(404,'Order not found.');
 res.json({message:'Order deleted'});
});

module.exports=router;
