const {z,text,money,id,flag,image,fail}=require('../utils/validation');
const Product=require('../models/Product');
const Category=require('../models/Category');
const {decorate}=require('../utils/catalog');
const DURATIONS=['1 Month','2 Months','3 Months','6 Months','1 Year','2 Years','Lifetime'];
const schema=z.object({
  name:text(120).min(2),
  category_id:id,
  price:money,
  original_price:money.nullable().default(null),
  badge:text(30).default(''),
  image_url:image.default(''),
  description:text(4000).default(''),
  features:z.array(text(250)).max(30).default([]),
  duration:z.enum([...DURATIONS,'']).nullable().optional().default(null).transform(v=>v||null),
  stock:z.number().int().min(0).nullable().optional().default(null),
  brand_color:text(30).nullable().optional().default(null),
  sort_order:z.number().int().min(0).max(9999).default(0),
  is_active:flag.default(1)
}).strict();
module.exports=require('./catalogFactory')(Product,schema,{decorate,validate:async data=>{if(data.category_id&&!await Category.exists({id:data.category_id,is_active:1}))fail(400,'Choose an active category.');}});
