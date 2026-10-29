const {z,text,image}=require('./validation');
const link=z.string().max(300).refine(v=>/^https:\/\/[^\s<>"']+$/.test(v)||/^\/(?!\/)[a-zA-Z0-9/#?=&_-]*$/.test(v),'Use an HTTPS link or local page link.');
const links=z.string().max(4000).transform((v,ctx)=>{try{return JSON.parse(v);}catch{ctx.addIssue({code:'custom',message:'Navigation must be valid JSON.'});return z.NEVER;}}).pipe(z.array(z.object({label:text(30).min(1),url:link}).strict()).max(6)).transform(v=>JSON.stringify(v));
const schemas={
 site_name:text(60).min(2),tagline:text(120),hero_title:text(150).min(5),hero_description:text(500),about_title:text(120),about_body:text(2000),footer_text:text(300),contact_email:z.union([z.literal(''),z.string().email().max(254)]),contact_phone:text(40),whatsapp_number:z.string().regex(/^\d{7,15}$|^$/),address:text(300),
 theme:z.enum(['terracotta','forest','plum']),logo_url:image,payment_qr_url:image,payment_instructions:text(1000),payment_methods:z.string().max(300).transform(v=>v.split(',').map(s=>s.trim()).filter(Boolean)).pipe(z.array(text(40).min(1)).min(1).max(8)).transform(v=>v.join(', ')),payment_account:z.string().regex(/^\d{7,15}$|^$/).max(15),
 smtp_host:text(150),smtp_port:text(10),smtp_user:text(150),smtp_pass:text(150),smtp_from:text(150),email_notifications:text(10),
 nav_links:links,footer_links:links,privacy:text(8000),terms:text(8000),refunds:text(8000)
};
const defaults={site_name:'Digi Prime Nepal',tagline:'Nepal\'s All-in-One Digital Subscription & Gaming Hub.',hero_title:'Good tools.\nGreater possibilities.',hero_description:'Discover digital tools for the way you create, work, and learn. Explore subscriptions, software, and game top-ups with local payment options and 24/7 support.',about_title:'Digital tools, a little closer to home.',about_body:'Digi Prime Nepal brings software, subscriptions, and gaming top-ups together in one place. Compare the details, place your order, and follow its progress from your account.',footer_text:'Nepal\'s All-in-One Digital Subscription & Gaming Hub.',contact_email:process.env.ADMIN_EMAIL||'prabink721@gmail.com',contact_phone:'',whatsapp_number:'9779705985657',address:'Nepal',theme:'terracotta',logo_url:'',payment_qr_url:'',payment_instructions:'Add your order reference to the transfer. Upload your receipt below for manual verification.',payment_methods:'eSewa, Khalti, Bank transfer',payment_account:'9705985657',smtp_host:'smtp.gmail.com',smtp_port:'465',smtp_user:process.env.ADMIN_EMAIL||'prabink721@gmail.com',smtp_pass:'',smtp_from:'',email_notifications:'1',nav_links:JSON.stringify([{label:'Explore tools',url:'/#catalog'},{label:'How it works',url:'/#how-it-works'},{label:'Our story',url:'/#about'}]),footer_links:JSON.stringify([{label:'Explore',url:'/#catalog'},{label:'Contact',url:'/#contact'}]),privacy:'',terms:'',refunds:''};
async function getSettings(){
 const entries=await require('../models/Setting').find({key:{$in:Object.keys(schemas)}}).lean();
 const result={...defaults};
 for(const entry of entries){const check=schemas[entry.key].safeParse(entry.value);if(check.success)result[entry.key]=check.data;}
 return result;
}
module.exports={schemas,defaults,getSettings};
