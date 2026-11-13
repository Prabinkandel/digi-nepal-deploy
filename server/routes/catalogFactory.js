const routerFactory=require('express').Router;
const {randomUUID}=require('node:crypto');
const access=require('../middleware/access');
const {query,page,searchFilter,fail,id,z}=require('../utils/validation');
/* Public catalogue responses are identical for every visitor (active items
   only, no per-user data), so the CDN may cache them briefly. Set only on the
   public GET handlers below — never on the staff-only /all route. The header
   replaces the blanket no-store set earlier in server.js, and function
   response headers take priority over the vercel.json /api rule. */
const PUBLIC_CACHE='public, s-maxage=60, stale-while-revalidate=300';
module.exports=function catalogRouter(Model,schema,{fields=['name'],decorate=async x=>x,validate=async()=>{}}={}){
  const router=routerFactory();const staff=access('admin','editor');
  router.get('/all',staff,async(req,res)=>{
    const q=query(req);const filter={...searchFilter(q.search,fields)};
    if(q.status==='active')filter.is_active=1;
    if(q.status==='archived')filter.is_active=0;
    const result=await page(Model,filter,q);result.items=await decorate(result.items);res.json(result);
  });
  router.get('/',async(req,res)=>{
    const q=query(req);const filter={is_active:1,...searchFilter(q.search,fields)};
    if(q.category)filter.category_id=id.parse(q.category);
    const result=await page(Model,filter,q);result.items=await decorate(result.items);res.set('Cache-Control',PUBLIC_CACHE);res.json(result);
  });
  router.get('/:id',async(req,res)=>{
    const record=await Model.findOne({id:id.parse(req.params.id),is_active:1}).select('-_id -__v').lean();
    if(!record)fail(404,'This item is unavailable.');res.set('Cache-Control',PUBLIC_CACHE);res.json((await decorate([record]))[0]);
  });
  router.post('/',staff,async(req,res)=>{
    const data=schema.parse(req.body);await validate(data);
    res.status(201).json(await Model.create({...data,id:randomUUID()}));
  });
  router.put('/:id',staff,async(req,res)=>{
    const data=schema.partial().strict().parse(req.body);await validate(data);
    const record=await Model.findOneAndUpdate({id:id.parse(req.params.id)},{$set:data},{new:true,runValidators:true});
    if(!record)fail(404,'This record no longer exists.');res.json(record);
  });
  router.delete('/:id',staff,async(req,res)=>{
    const record=await Model.findOneAndUpdate({id:id.parse(req.params.id)},{is_active:0},{new:true});
    if(!record)fail(404,'This record no longer exists.');res.json({message:'Archived. You can restore it from the archive.'});
  });
  router.post('/:id/restore',staff,async(req,res)=>{
    z.object({}).strict().parse(req.body||{});
    const record=await Model.findOneAndUpdate({id:id.parse(req.params.id)},{is_active:1},{new:true});
    if(!record)fail(404,'This record no longer exists.');res.json(record);
  });
  return router;
};
