const API='/api';
let csrf='',adminUser=null;

const $=id=>document.getElementById(id);
const fmt=n=>`Rs ${Number(n).toLocaleString()}`;

const list=result=>Array.isArray(result)?result:(result.items||[]);
function getErrorMessage(data, fallback = 'Error') {
  if (!data) return fallback;
  if (typeof data === 'string') return data === '[object Object]' ? fallback : data;
  if (typeof data.error === 'string') return data.error;
  if (data.error && typeof data.error.message === 'string') return data.error.message;
  if (typeof data.message === 'string') return data.message;
  if (Array.isArray(data.errors) && data.errors[0]) {
    const first = data.errors[0];
    return typeof first === 'string' ? first : (first.message || fallback);
  }
  return fallback;
}

async function api(path,opts={}){
  const h={Accept:'application/json'};
  if(opts.body && !(opts.body instanceof FormData))h['Content-Type']='application/json';
  if(csrf)h['x-csrf-token']=csrf;
  const r=await fetch(API+path,{credentials:'same-origin',...opts,headers:{...h,...(opts.headers||{})}});
  
  const contentType = r.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const d = await r.json();
    if(!r.ok) throw new Error(getErrorMessage(d));
    return d;
  } else {
    const text = await r.text();
    if (!r.ok) throw new Error(`Server Error (${r.status}): ${text.substring(0, 50)}...`);
    return text;
  }
}

function toast(msg,type='success'){
  const t=$('a-toast');t.textContent=msg;t.className=`toast ${type} show`;
  setTimeout(()=>t.classList.remove('show'),3000);
}

function confirm(msg,cb){
  $('confirm-overlay').hidden=false;
  $('confirm-msg').textContent=msg;
  $('confirm-yes').onclick=()=>{$('confirm-overlay').hidden=true;cb();};
  $('confirm-no').onclick=()=>$('confirm-overlay').hidden=true;
}

function openDrawer(title,html,onSave){
  $('drawer-title').textContent=title;
  $('drawer-body').innerHTML=html;
  $('drawer-overlay').hidden=false;
  const saveBtn=$('drawer-save');
  if(saveBtn)saveBtn.onclick=onSave;
}
function closeDrawer(){$('drawer-overlay').hidden=true;}
$('drawer-close').onclick=closeDrawer;
$('drawer-overlay').addEventListener('click',e=>{if(e.target===$('drawer-overlay'))closeDrawer();});

// LOGIN
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const btn=$('login-btn');btn.disabled=true;btn.textContent='Signing in...';
  try{
    const d=await api('/auth/login',{method:'POST',body:JSON.stringify({email:$('l-email').value,password:$('l-pass').value})});
    if(d.user.role!=='admin')throw new Error('Admin access required');
    csrf=d.csrf||d.token||'';adminUser=d.user;
    $('login-screen').hidden=true;$('admin-app').hidden=false;
    $('admin-name-display').textContent=`👤 ${adminUser.name}`;
    navigate('dashboard');
  }catch(err){
    $('login-error').textContent=err.message;$('login-error').hidden=false;
    btn.disabled=false;btn.textContent='Login to Admin';
  }
});

$('admin-logout').onclick=async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'});}catch(e){void e;}csrf='';location.reload();};
$('sidebar-toggle').onclick=()=>$('sidebar').classList.toggle('open');

// NAV
document.querySelectorAll('.nav-item').forEach(a=>{
  a.addEventListener('click',e=>{
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
    a.classList.add('active');
    navigate(a.dataset.page);
  });
});

const pageTitles={dashboard:'Dashboard',products:'Products',categories:'Categories',orders:'Orders',offers:'Flash Offers',campaigns:'Sale Campaigns',payments:'Payments',users:'Users',settings:'Settings'};
function navigate(page){
  $('page-title').textContent=pageTitles[page]||page;
  const pages={dashboard:renderDashboard,products:renderProducts,categories:renderCategories,orders:renderOrders,offers:renderOffers,campaigns:renderCampaigns,payments:renderPayments,users:renderUsers,settings:renderSettings};
  if(pages[page])pages[page]();
}

// DASHBOARD
async function renderDashboard(){
  $('page-content').innerHTML=`<div style="color:var(--text3);text-align:center;padding:40px">Loading...</div>`;
  try{
    const s=await api('/users/stats');
    $('page-content').innerHTML=`
      <div class="stats-grid">
        <div class="stat-card blue"><div class="stat-card-icon">📦</div><div class="stat-card-val">${s.totalProducts}</div><div class="stat-card-label">Active Products</div></div>
        <div class="stat-card green"><div class="stat-card-icon">✅</div><div class="stat-card-val">${s.totalOrders}</div><div class="stat-card-label">Total Orders</div></div>
        <div class="stat-card orange"><div class="stat-card-icon">⏳</div><div class="stat-card-val">${s.pendingOrders}</div><div class="stat-card-label">Pending Orders</div></div>
        <div class="stat-card violet"><div class="stat-card-icon">👥</div><div class="stat-card-val">${s.totalUsers}</div><div class="stat-card-label">Customers</div></div>
        <div class="stat-card green"><div class="stat-card-icon">💰</div><div class="stat-card-val">${fmt(s.revenue)}</div><div class="stat-card-label">Verified Revenue</div></div>
      </div>
      <div class="recent-orders">
        <h3>Recent Orders</h3>
        ${s.recentOrders.map(o=>`
          <div class="order-row">
            <div class="order-info"><div class="name">${o.product_name}</div><div class="sub">${o.user_name||'Unknown'} · ${new Date(o.created_at).toLocaleDateString()}</div></div>
            <div style="display:flex;align-items:center;gap:12px">
              <span class="order-price">${fmt(o.price)}</span>
              <span class="badge badge-${o.status}">${o.status}</span>
            </div>
          </div>`).join('')}
      </div>`;
  }catch(e){$('page-content').innerHTML=`<div style="color:var(--sale);padding:20px">${e.message}</div>`;}
}

// PRODUCTS
async function renderProducts(){
  $('page-content').innerHTML=`<div style="color:var(--text3);text-align:center;padding:40px">Loading...</div>`;
  const [productResult,categoryResult]=await Promise.all([api('/products/all?limit=100'),api('/categories/all?limit=100')]);
  const products=list(productResult),cats=list(categoryResult);
  const catMap={};cats.forEach(c=>catMap[c.id]=c);
  $('page-content').innerHTML=`
    <div class="section-header">
      <h2>Products <span style="color:var(--text3);font-weight:400;font-size:1rem">(${products.length})</span></h2>
      <button class="btn-primary" id="add-product-btn">+ Add Product</button>
    </div>
    <div class="table-wrap">
      <div class="table-header">
        <h3>All Products</h3>
        <div class="table-controls">
          <input class="search-box" id="prod-search" placeholder="Search..."/>
          <select class="filter-select" id="prod-cat-filter">
            <option value="">All Categories</option>
            ${cats.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Product</th><th>Category</th><th>Duration</th><th>Price</th><th>Badge</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="prod-tbody">${renderProductRows(products,catMap)}</tbody>
      </table></div>
    </div>`;
  $('add-product-btn').onclick=()=>openProductForm(null,cats);
  $('prod-search').addEventListener('input',()=>{
    const q=$('prod-search').value.toLowerCase();
    const filtered=products.filter(p=>p.name.toLowerCase().includes(q));
    $('prod-tbody').innerHTML=renderProductRows(filtered,catMap);
    attachProductActions(filtered,cats);
  });
  $('prod-cat-filter').addEventListener('change',()=>{
    const cid=$('prod-cat-filter').value;
    const filtered=cid?products.filter(p=>p.category_id===cid):products;
    $('prod-tbody').innerHTML=renderProductRows(filtered,catMap);
    attachProductActions(filtered,cats);
  });
  attachProductActions(products,cats);
}

function renderProductRows(products,catMap){
  if(!products.length)return`<tr class="empty-row"><td colspan="7">No products found</td></tr>`;
  return products.map(p=>`
    <tr data-id="${p.id}">
      <td><div style="display:flex;align-items:center;gap:10px">
        ${p.image_url?`<img src="${p.image_url}" class="td-img" alt=""/>`:`<div class="td-icon">${p.category_icon||'📦'}</div>`}
        <div><div class="td-name">${p.name}</div><div class="td-sub">${fmt(p.price)}</div></div>
      </div></td>
      <td>${catMap[p.category_id]?.name||'-'}</td>
      <td>${p.duration?`<span class="badge badge-active" style="font-size:.72rem;padding:.15rem .45rem">${p.duration}</span>`:'—'}</td>
      <td>${fmt(p.price)}${p.original_price?`<br/><span style="color:var(--text3);text-decoration:line-through;font-size:.8rem">${fmt(p.original_price)}</span>`:''}</td>
      <td>${p.badge?`<span class="badge badge-${(String(p.badge).toLowerCase().includes('dashain'))?'danger':p.badge==='sale'?'pending':p.badge==='popular'||p.badge==='hot'?'verified':'active'}">${(String(p.badge).toLowerCase().includes('dashain'))?'Dashain Sale 🌾':p.badge}</span>`:'—'}</td>
      <td><span class="badge ${p.is_active?'badge-active':'badge-inactive'}">${p.is_active?'Active':'Hidden'}</span></td>
      <td><div class="td-actions">
        <button class="btn-outline btn-sm edit-prod" data-id="${p.id}">Edit</button>
        <button class="btn-danger btn-sm del-prod" data-id="${p.id}">${p.is_active?'Hide':'Show'}</button>
      </div></td>
    </tr>`).join('');
}

function attachProductActions(products,cats){
  document.querySelectorAll('.edit-prod').forEach(b=>b.onclick=()=>{
    const p=products.find(x=>x.id===b.dataset.id);if(p)openProductForm(p,cats);
  });
  document.querySelectorAll('.del-prod').forEach(b=>b.onclick=()=>{
    const p=products.find(x=>x.id===b.dataset.id);if(!p)return;
    confirm(`${p.is_active?'Hide':'Show'} "${p.name}"?`,async()=>{
      await api(`/products/${p.id}`,{method:p.is_active?'DELETE':'PUT',body:JSON.stringify({...p,is_active:1})});
      toast('Product updated'); renderProducts();
    });
  });
}

function openProductForm(p,cats){
  const feats = Array.isArray(p?.features) ? p.features : (typeof p?.features === 'string' ? JSON.parse(p.features || '[]') : []);
  openDrawer(p?'Edit Product':'Add Product',`
    <div class="form-group"><label>Product Name *</label><input id="f-name" value="${p?.name||''}"/></div>
    <div class="form-group"><label>Category</label>
      <select id="f-cat">${cats.map(c=>`<option value="${c.id}" ${p?.category_id===c.id?'selected':''}>${c.name}</option>`).join('')}</select>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Price (Rs) *</label><input id="f-price" type="number" value="${p?.price||''}"/></div>
      <div class="form-group"><label>Original Price</label><input id="f-orig" type="number" value="${p?.original_price||''}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Discount %</label><input id="f-disc" type="number" value="${p?.discount||0}"/></div>
      <div class="form-group"><label>Badge</label>
        <select id="f-badge">
          <option value="">None</option>
          ${[
            { value: 'dashain', label: '🌾 Dashain Sale' },
            { value: 'popular', label: '★ Popular' },
            { value: 'hot', label: '🔥 Hot' },
            { value: 'sale', label: '🏷️ Sale' },
            { value: 'bestseller', label: '🏆 Bestseller' },
            { value: 'new', label: '✨ New' },
            { value: 'cheap', label: '💰 Budget' }
          ].map(b=>`<option value="${b.value}" ${(p?.badge||'').toLowerCase()===b.value?'selected':''}>${b.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Validity / Duration</label>
        <select id="f-duration">
          <option value="">Not specified</option>
          ${['1 Month','2 Months','3 Months','6 Months','1 Year','2 Years','Lifetime'].map(d=>`<option value="${d}" ${p?.duration===d?'selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Stock (blank = unlimited)</label><input id="f-stock" type="number" placeholder="Leave blank for unlimited" value="${p?.stock!=null?p.stock:''}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Rating</label><input id="f-rating" type="number" step="0.1" min="1" max="5" value="${p?.rating||4.8}"/></div>
      <div class="form-group"><label>Brand Hex Color (Optional)</label><input id="f-brand-color" placeholder="e.g. #E50914 (Auto if blank)" value="${p?.brand_color||''}"/></div>
    </div>
    <div class="form-group"><label>Sort Order</label><input id="f-sort" type="number" value="${p?.sort_order||0}"/></div>
    <div class="form-group"><label>Description</label><textarea id="f-desc">${p?.description||''}</textarea></div>
    <div class="form-group"><label>Features (one per line)</label><textarea id="f-feats" style="min-height:100px">${feats.join('\n')}</textarea></div>
    <div class="form-group"><label>Product Image</label>
      <div class="upload-zone" id="upload-zone">
        <p>Click to upload image (Local only)</p>
        <input type="file" id="f-img-file" accept="image/*" style="display:none"/>
      </div>
      <div style="margin: 12px 0; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: .8rem; color: var(--text3)">OR</span>
        <input id="f-img-url-input" placeholder="Paste image URL here..." style="flex: 1; font-size: .82rem; padding: 8px 12px;" value="${p?.image_url||''}"/>
      </div>
      <div class="upload-preview" id="upload-preview">
        ${p?.image_url?`<img src="${p.image_url}" alt=""/><span style="font-size:.82rem;color:var(--text3)">Current image</span>`:''}
      </div>
      <input type="hidden" id="f-img-url" value="${p?.image_url||''}"/>
    </div>
    <div class="form-actions">
      <button class="btn-outline" onclick="closeDrawer()">Cancel</button>
      <button class="btn-primary" id="drawer-save">Save Product</button>
    </div>`,
    async()=>{
      const saveBtn = $('drawer-save');
      const originalText = saveBtn.textContent;
      
      const name = $('f-name').value.trim();
      const price = +$('f-price').value;
      const catId = $('f-cat').value;
      
      if(!name || !price || !catId) return toast('Name, Price and Category are required','error');

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      const imgFile=$('f-img-file').files[0];
      let imgUrl = $('f-img-url-input').value.trim() || $('f-img-url').value;
      
      if(imgFile){
        try {
          const fd=new FormData();fd.append('image',imgFile);fd.append('purpose','catalog');
          const h={'x-csrf-token':csrf};
          const r=await fetch(API+'/upload',{method:'POST',credentials:'same-origin',headers:h,body:fd});
          
          let d;
          const contentType = r.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            d = await r.json();
          } else {
            const text = await r.text();
            throw new Error(`Upload failed (${r.status}): ${text.substring(0, 40)}`);
          }
          
          if(!r.ok) throw new Error(d?.error || 'Upload failed');
          imgUrl=d.url;
        } catch (uploadErr) {
          toast('Upload failed, using manual URL if available', 'warning');
        }
      }
      
      const featsArr=$('f-feats').value.split('\n').map(x=>x.trim()).filter(Boolean);
      const stockVal = $('f-stock').value.trim();
      const brandColorVal = $('f-brand-color')?.value?.trim() || null;
      const body={name, category_id:catId, price,
        original_price:+$('f-orig').value||null,
        badge:$('f-badge').value||'',
        duration:$('f-duration').value||null,
        stock: stockVal !== '' ? +stockVal : null,
        brand_color: brandColorVal,
        description:$('f-desc').value,features:featsArr,image_url:imgUrl,
        is_active: p ? p.is_active : 1, sort_order: +$('f-sort').value || 0};
        
      try{
        if(p)await api(`/products/${p.id}`,{method:'PUT',body:JSON.stringify(body)});
        else await api('/products',{method:'POST',body:JSON.stringify(body)});
        closeDrawer();toast('Product saved!');renderProducts();
      }catch(e){
        toast(e.message,'error');
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    }
  );
  $('upload-zone').onclick=()=>$('f-img-file').click();
  $('f-img-file').onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const url=URL.createObjectURL(f);
    $('upload-preview').innerHTML=`<img src="${url}" alt=""/><span style="font-size:.82rem;color:var(--text3)">${f.name}</span>`;
  };
}

// CATEGORIES
async function renderCategories(){
  const cats=list(await api('/categories/all?limit=100'));
  $('page-content').innerHTML=`
    <div class="section-header"><h2>Categories</h2><button class="btn-primary" id="add-cat-btn">+ Add Category</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Category</th><th>Icon</th><th>Products</th><th>Actions</th></tr></thead>
      <tbody>${cats.map(c=>`
        <tr>
          <td><div class="td-name">${c.name}</div></td>
          <td><span style="font-size:1.5rem">${c.icon}</span></td>
          <td>—</td>
          <td><div class="td-actions">
            <button class="btn-outline btn-sm edit-cat" data-id="${c.id}">Edit</button>
            <button class="btn-danger btn-sm del-cat" data-id="${c.id}">Delete</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  $('add-cat-btn').onclick=()=>openCatForm(null);
  document.querySelectorAll('.edit-cat').forEach(b => {
    b.onclick = () => {
      const c = cats.find(x => x.id === b.dataset.id);
      if (c) openCatForm(c);
    };
  });
  document.querySelectorAll('.del-cat').forEach(b => {
    b.onclick = () => {
      const c = cats.find(x => x.id === b.dataset.id);
      if (c) delCat(c.id, c.name);
    };
  });
}

window.openCatForm=function(c){
  openDrawer(c?'Edit Category':'Add Category',`
    <div class="form-group"><label>Name *</label><input id="c-name" value="${c?.name||''}"/></div>
    <div class="form-group"><label>Icon (emoji)</label><input id="c-icon" value="${c?.icon||'📦'}" style="font-size:1.5rem;text-align:center"/></div>
    <div class="form-group"><label>Brand color</label><input id="c-color" value="${c?.color||'#B91C1C'}" placeholder="#B91C1C" pattern="#[0-9a-fA-F]{6}"/></div>
    <div class="form-group"><label>Sort Order</label><input id="c-sort" type="number" value="${c?.sort_order||0}"/></div>
    <div class="form-actions">
      <button class="btn-outline" onclick="closeDrawer()">Cancel</button>
      <button class="btn-primary" id="drawer-save">Save</button>
    </div>`,
    async()=>{
      const body={name:$('c-name').value,icon:$('c-icon').value,color:$('c-color').value,sort_order:+$('c-sort').value};
      try{
        if(c)await api(`/categories/${c.id}`,{method:'PUT',body:JSON.stringify(body)});
        else await api('/categories',{method:'POST',body:JSON.stringify(body)});
        closeDrawer();toast('Category saved!');renderCategories();
      }catch(e){toast(e.message,'error');}
    }
  );
};

window.delCat=function(id,name){
  confirm(`Delete category "${name}"?`,async()=>{
    await api(`/categories/${id}`,{method:'DELETE'});
    toast('Category deleted');renderCategories();
  });
};

// ORDERS
async function renderOrders(){
  $('page-content').innerHTML=`<div style="color:var(--text3);text-align:center;padding:40px">Loading orders...</div>`;
  try {
    const ordersResult = await api('/orders/all?limit=100');
    let orders = list(ordersResult);
    
    $('page-content').innerHTML=`
      <div class="section-header">
        <h2>Orders <span style="color:var(--text3);font-weight:400;font-size:1rem" id="orders-count">(${orders.length})</span></h2>
        <div style="display:flex;gap:10px;align-items:center;">
          <input class="search-box" id="order-search" placeholder="Search Order ID / Ref, Customer, Product..." style="width:280px;font-size:.85rem;padding:7px 12px;"/>
          <select class="filter-select" id="order-filter">
            <option value="">All Status</option>
            <option value="pending">Pending</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
      </div>
      <div class="table-wrap"><div style="overflow-x:auto"><table>
        <thead><tr><th>Order ID / Ref</th><th>Customer</th><th>Product</th><th>Price</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody id="orders-tbody">${renderOrderRows(orders)}</tbody>
      </table></div></div>`;
      
    async function filterOrders() {
      const q = $('order-search').value.trim();
      const s = $('order-filter').value;
      const params = new URLSearchParams({ limit: '100' });
      if (q) params.set('search', q);
      if (s) params.set('status', s);
      try {
        const res = await api('/orders/all?' + params.toString());
        const filtered = list(res);
        $('orders-tbody').innerHTML = renderOrderRows(filtered);
        const countEl = $('orders-count');
        if (countEl) countEl.textContent = `(${filtered.length})`;
      } catch (err) {
        toast(err.message, 'error');
      }
    }

    $('order-search').addEventListener('input', () => {
      clearTimeout(window._orderSearchTimer);
      window._orderSearchTimer = setTimeout(filterOrders, 300);
    });
    $('order-filter').onchange = filterOrders;
  } catch(e) {
    $('page-content').innerHTML = `<div style="color:var(--sale);padding:20px">${e.message}</div>`;
  }
}

function renderOrderRows(orders){
  if(!orders.length)return`<tr class="empty-row"><td colspan="7">No orders</td></tr>`;
  return orders.map(o=>`
    <tr>
      <td><code style="font-size:.8rem;color:var(--blue-light)">#${o.id.split('-')[0].toUpperCase()}</code></td>
      <td><div class="td-name">${o.user_name||'—'}</div><div class="td-sub">${o.user_email||''}</div></td>
      <td>${o.product_name}</td>
      <td>${fmt(o.price)}</td>
      <td><span class="badge badge-${o.status}">${o.status}</span></td>
      <td style="font-size:.8rem;color:var(--text3)">${new Date(o.created_at).toLocaleDateString()}</td>
      <td><div class="td-actions">
        <select class="filter-select" style="padding:5px 8px;font-size:.8rem" data-oid="${o.id}" onchange="updateOrderStatus(this,'${o.id}')">
          ${['pending','verified','rejected','delivered'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <a href="https://wa.me/9779705985657?text=${encodeURIComponent(o.wa_message||'')}" target="_blank" class="btn-success btn-sm">WA</a>
      </div></td>
    </tr>`).join('');
}

window.updateOrderStatus=async function(sel,id){
  try{
    await api(`/orders/${id}/status`,{method:'PUT',body:JSON.stringify({status:sel.value})});
    toast(`Order marked as ${sel.value}`);
  }catch(e){toast(e.message,'error');}
};

function attachOrderActions(){}

// OFFERS
async function renderOffers(){
  const [offerResult,productResult]=await Promise.all([api('/offers/all?limit=100'),api('/products/all?limit=100')]);
  const offers=list(offerResult),products=list(productResult);
  $('page-content').innerHTML=`
    <div class="section-header"><h2>Flash Offers</h2><button class="btn-primary" id="add-offer-btn">+ Add Offer</button></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Product</th><th>Label</th><th>Discount</th><th>Valid Until</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${offers.map(o=>`
        <tr>
          <td>${o.product_name||'—'}</td>
          <td>${o.label}</td>
          <td><span style="color:var(--success);font-weight:700">${o.discount_pct}% OFF</span></td>
          <td style="font-size:.82rem;color:var(--text3)">${o.valid_until||'No expiry'}</td>
          <td><span class="badge ${o.is_active?'badge-active':'badge-inactive'}">${o.is_active?'Active':'Inactive'}</span></td>
          <td><div class="td-actions">
            <button class="btn-outline btn-sm edit-offer" data-id="${o.id}">Edit</button>
            <button class="btn-danger btn-sm toggle-offer" data-id="${o.id}">${o.is_active?'Disable':'Enable'}</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  $('add-offer-btn').onclick=()=>openOfferForm(null,products);
  document.querySelectorAll('.edit-offer').forEach(b => {
    b.onclick = () => {
      const o = offers.find(x => x.id === b.dataset.id);
      if (o) openOfferForm(o, products);
    };
  });
  document.querySelectorAll('.toggle-offer').forEach(b => {
    b.onclick = () => {
      const o = offers.find(x => x.id === b.dataset.id);
      if (o) toggleOffer(o.id, o.is_active);
    };
  });
}

window.openOfferForm=function(o,products){
  openDrawer(o?'Edit Offer':'Add Offer',`
    <div class="form-group"><label>Product *</label>
      <select id="o-prod">${products.map(p=>`<option value="${p.id}" ${o?.product_id===p.id?'selected':''}>${p.name}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Offer Label *</label><input id="o-label" value="${o?.label||''}" placeholder="e.g. 50% Summer Sale"/></div>
    <div class="form-group"><label>Discount %</label><input id="o-disc" type="number" value="${o?.discount_pct||0}" min="0" max="100"/></div>
    <div class="form-group"><label>Valid Until (optional)</label><input id="o-until" type="date" value="${o?.valid_until||''}"/></div>
    <div class="form-actions">
      <button class="btn-outline" onclick="closeDrawer()">Cancel</button>
      <button class="btn-primary" id="drawer-save">Save Offer</button>
    </div>`,
    async()=>{
      const date=$('o-until').value;
      const body={product_id:$('o-prod').value,label:$('o-label').value,discount_pct:+$('o-disc').value,valid_until:date?new Date(date+'T23:59:59Z').toISOString():null};
      try{
        if(o)await api(`/offers/${o.id}`,{method:'PUT',body:JSON.stringify(body)});
        else await api('/offers',{method:'POST',body:JSON.stringify(body)});
        closeDrawer();toast('Offer saved!');renderOffers();
      }catch(e){toast(e.message,'error');}
    }
  );
};

window.toggleOffer=async function(id,active){
  await api(`/offers/${id}`,{method:'PUT',body:JSON.stringify({is_active:active?0:1,label:'',discount_pct:0})});
  toast('Offer updated');renderOffers();
};

// ── SALE CAMPAIGNS ────────────────────────────────────────────
const CAMPAIGN_THEMES=[['default','Default (brand red)'],['festive-red','Festive red'],['gold-red','Gold & red'],['dark-premium','Dark premium'],['neon-offer','Neon offer']];
const CAMPAIGN_STATUSES={live:['badge-active','Live'],scheduled:['badge-pending','Scheduled'],expired:['badge-inactive','Expired'],draft:['badge-user','Draft']};

function fmtDateInput(value){
  if(!value)return '';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return '';
  const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function renderCampaigns(){
  const result=await api('/campaigns/all?limit=100');
  const items=list(result);
  $('page-content').innerHTML=`
    <div class="section-header"><h2>Sale Campaigns <span style="color:var(--text3);font-weight:400;font-size:1rem">(${items.length})</span></h2><button class="btn-primary" id="add-campaign-btn">+ New Campaign</button></div>
    <p style="color:var(--text3);font-size:.85rem;margin:-12px 0 20px">The live campaign with the lowest order number appears on the storefront. When none is live, the top discounts show automatically.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Campaign</th><th>Label</th><th>Dates</th><th>Products</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${items.map(c=>{
        const [cls,label]=CAMPAIGN_STATUSES[c.status]||CAMPAIGN_STATUSES.draft;
        const dates=[c.start_date?new Date(c.start_date).toLocaleDateString():'—',c.end_date?new Date(c.end_date).toLocaleDateString():'—'].join(' → ');
        return `<tr>
          <td><div class="td-name">${c.name}</div><div class="td-sub">/${c.slug} · order ${c.display_order} · ${c.theme_variant}</div></td>
          <td>${c.short_label||'—'}</td>
          <td style="font-size:.82rem;color:var(--text3)">${dates}</td>
          <td>${c.product_count??(c.product_ids||[]).length}</td>
          <td><span class="badge ${cls}">${label}</span></td>
          <td><div class="td-actions">
            <button class="btn-outline btn-sm edit-campaign" data-id="${c.id}">Edit</button>
            <button class="btn-outline btn-sm preview-campaign" data-id="${c.id}">Preview</button>
            <button class="btn-danger btn-sm toggle-campaign" data-id="${c.id}">${c.is_active?'Disable':'Enable'}</button>
          </div></td>
        </tr>`;}).join('')||'<tr class="empty-row"><td colspan="6">No campaigns yet. Create one for the next sale.</td></tr>'}
      </tbody>
    </table></div>`;
  $('add-campaign-btn').onclick=()=>openCampaignForm(null);
  document.querySelectorAll('.edit-campaign').forEach(b=>b.onclick=async()=>{
    const full=await api(`/campaigns/all?limit=100`).then(r=>list(r).find(x=>x.id===b.dataset.id));
    openCampaignForm(full||items.find(x=>x.id===b.dataset.id));
  });
  document.querySelectorAll('.preview-campaign').forEach(b=>b.onclick=()=>previewCampaign(b.dataset.id));
  document.querySelectorAll('.toggle-campaign').forEach(b=>b.onclick=async()=>{
    const c=items.find(x=>x.id===b.dataset.id);if(!c)return;
    confirm(c.is_active?'Disable this campaign?':'Enable this campaign?',async()=>{
      await api(`/campaigns/${c.id}`,{method:'PUT',body:JSON.stringify({is_active:c.is_active?0:1})});
      toast('Campaign updated');renderCampaigns();
    });
  });
}

async function previewCampaign(id){
  try{
    const {campaign,items}=await api(`/campaigns/${encodeURIComponent(id)}`);
    openDrawer(`Preview — ${campaign.name}`,`
      <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
        ${campaign.banner_image_url?`<img src="${campaign.banner_image_url}" alt="" style="width:100%;max-height:180px;object-fit:cover;display:block"/>`:''}
        <div style="padding:16px">
          <span class="badge badge-active">${campaign.short_label||'ON SALE'}</span>
          <h3 style="margin:8px 0 4px">${campaign.name}</h3>
          <p style="color:var(--text3);font-size:.85rem">${campaign.subtitle||''}</p>
          <p style="color:var(--text3);font-size:.8rem;margin-top:8px">${items.length} product${items.length===1?'':'s'} · ${campaign.auto_rotate?'auto-rotates every '+campaign.rotation_interval_seconds+'s':'manual browsing'}</p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
            ${items.slice(0,4).map(p=>`<div style="border:1px solid var(--border);border-radius:8px;padding:8px;font-size:.78rem"><div style="font-weight:700">${p.name}</div><div style="color:var(--success);font-weight:800">Rs ${Number(p.price).toLocaleString()}</div></div>`).join('')||'<p style="color:var(--text3);font-size:.82rem">No eligible products right now.</p>'}
          </div>
        </div>
      </div>
      <div class="form-actions"><button class="btn-outline" onclick="closeDrawer()">Close</button></div>`,()=>closeDrawer());
  }catch(e){toast(e.message,'error');}
}

async function openCampaignForm(c){
  const products=list(await api('/products/all?limit=100'));
  const selected=[...(c?.product_ids||[])];
  const iso=v=>v?new Date(v).toISOString().slice(0,16):'';
  openDrawer(c?'Edit Campaign':'New Campaign',`
    <div class="form-group"><label>Campaign Name *</label><input id="c-name" value="${c?.name||''}" placeholder="e.g. Dashain Sale"/></div>
    <div class="form-row">
      <div class="form-group"><label>URL Slug</label><input id="c-slug" value="${c?.slug||''}" placeholder="auto from name"/></div>
      <div class="form-group"><label>Order (lowest shows first)</label><input id="c-order" type="number" min="0" max="9999" value="${c?.display_order??0}"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Badge Label</label><input id="c-label" value="${c?.short_label||'ON SALE'}" placeholder="ON SALE"/></div>
      <div class="form-group"><label>CTA Text</label><input id="c-cta" value="${c?.cta_text||'View all'}" placeholder="View all"/></div>
    </div>
    <div class="form-group"><label>Subtitle</label><input id="c-sub" value="${c?.subtitle||''}" placeholder="Best festive subscription deals right now" maxlength="200"/></div>
    <div class="form-group"><label>Banner Image</label>
      <div class="upload-zone" id="c-banner-zone"><p>Click to upload a festive banner (PNG/JPG/WebP, max 15 MB)</p><input type="file" id="c-banner-file" accept="image/png,image/jpeg,image/webp" style="display:none"/></div>
      <div style="margin:12px 0"><input id="c-banner-url" placeholder="…or paste an image URL" style="width:100%" value="${c?.banner_image_url||''}"/></div>
      <div class="upload-preview" id="c-banner-preview">${c?.banner_image_url?`<img src="${c.banner_image_url}" alt=""/><span style="font-size:.82rem;color:var(--text3)">Current banner</span>`:''}</div>
    </div>
    <div class="form-group"><label>Theme</label><select id="c-theme">${CAMPAIGN_THEMES.map(([v,l])=>`<option value="${v}" ${c?.theme_variant===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="form-row">
      <div class="form-group"><label>Starts</label><input id="c-start" type="datetime-local" value="${iso(c?.start_date)}"/></div>
      <div class="form-group"><label>Ends</label><input id="c-end" type="datetime-local" value="${iso(c?.end_date)}"/></div>
    </div>
    <div class="form-group"><label>Products in this sale (checked items show first, in order)</label>
      <div id="c-products" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:8px">
        ${products.map(p=>`<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;font-size:.85rem;font-weight:400"><input type="checkbox" value="${p.id}" ${selected.includes(p.id)?'checked':''} style="width:auto"/> <span style="flex:1">${p.name} <span style="color:var(--text3)">· Rs ${Number(p.price).toLocaleString()}</span></span></label>`).join('')||'<p style="color:var(--text3)">No products yet.</p>'}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Max Products</label><input id="c-max" type="number" min="1" max="24" value="${c?.max_products??8}"/></div>
      <div class="form-group"><label>Badge Text ({pct} = %)</label><input id="c-badge" value="${c?.badge_text||'-{pct}'}" maxlength="40"/></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Rotation (seconds)</label><input id="c-interval" type="number" min="2" max="30" value="${c?.rotation_interval_seconds??5}"/></div>
      <div class="form-group"><label>Enabled</label><select id="c-active"><option value="1" ${c?.is_active!==0?'selected':''}>Yes — show when live</option><option value="0" ${c?.is_active===0?'selected':''}>No — draft</option></select></div>
    </div>
    <div class="form-group" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <label style="font-weight:400"><input type="checkbox" id="c-rotate" ${c?.auto_rotate!==0?'checked':''} style="width:auto"/> Auto-rotate</label>
      <label style="font-weight:400"><input type="checkbox" id="c-dots" ${c?.show_progress_indicators!==0?'checked':''} style="width:auto"/> Dots</label>
      <label style="font-weight:400"><input type="checkbox" id="c-arrows" ${c?.show_navigation_arrows!==0?'checked':''} style="width:auto"/> Arrows</label>
      <label style="font-weight:400"><input type="checkbox" id="c-cardbadge" ${c?.show_sale_badge_on_cards!==0?'checked':''} style="width:auto"/> Card badges</label>
      <label style="font-weight:400"><input type="checkbox" id="c-fallback" ${c?.fallback_to_discounts!==0?'checked':''} style="width:auto"/> Fallback to discounts</label>
    </div>
    <div class="form-actions">
      <button class="btn-outline" onclick="closeDrawer()">Cancel</button>
      <button class="btn-primary" id="drawer-save">Save Campaign</button>
    </div>`,
    async()=>{
      const name=$('c-name').value.trim();
      if(name.length<2)return toast('Give the campaign a name.','error');
      let bannerUrl=$('c-banner-url').value.trim();
      const bannerFile=$('c-banner-file').files[0];
      if(bannerFile){
        if(bannerFile.size>15*1024*1024)return toast('Banner is larger than 15 MB.','error');
        try{
          const fd=new FormData();fd.append('image',bannerFile);fd.append('purpose','catalog');
          const h={'x-csrf-token':csrf};
          const r=await fetch(API+'/upload',{method:'POST',credentials:'same-origin',headers:h,body:fd});
          const d=await r.json();
          if(!r.ok)throw new Error(d?.error||'Upload failed');
          bannerUrl=d.url;
        }catch(e){return toast('Banner upload failed: '+e.message,'error');}
      }
      const picked=[...document.querySelectorAll('#c-products input:checked')].map(i=>i.value);
      const toIso=v=>v?new Date(v).toISOString():null;
      const body={
        name,
        slug:$('c-slug').value.trim()||undefined,
        short_label:$('c-label').value.trim()||'ON SALE',
        cta_text:$('c-cta').value.trim()||'View all',
        subtitle:$('c-sub').value.trim(),
        banner_image_url:bannerUrl,
        theme_variant:$('c-theme').value,
        start_date:toIso($('c-start').value),
        end_date:toIso($('c-end').value),
        display_order:+$('c-order').value||0,
        product_ids:picked,
        max_products:Math.min(24,Math.max(1,+$('c-max').value||8)),
        badge_text:$('c-badge').value.trim()||'-{pct}',
        rotation_interval_seconds:Math.min(30,Math.max(2,+$('c-interval').value||5)),
        is_active:+$('c-active').value,
        auto_rotate:$('c-rotate').checked?1:0,
        show_progress_indicators:$('c-dots').checked?1:0,
        show_navigation_arrows:$('c-arrows').checked?1:0,
        show_sale_badge_on_cards:$('c-cardbadge').checked?1:0,
        fallback_to_discounts:$('c-fallback').checked?1:0,
      };
      try{
        if(c)await api(`/campaigns/${c.id}`,{method:'PUT',body:JSON.stringify(body)});
        else await api('/campaigns',{method:'POST',body:JSON.stringify(body)});
        closeDrawer();toast('Campaign saved!');renderCampaigns();
      }catch(e){toast(e.message,'error');}
    }
  );
  $('c-banner-zone').onclick=()=>$('c-banner-file').click();
  $('c-banner-file').onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    $('c-banner-preview').innerHTML=`<img src="${URL.createObjectURL(f)}" alt=""/><span style="font-size:.82rem;color:var(--text3)">${f.name}</span>`;
  };
  $('c-banner-url').oninput=e=>{
    const v=e.target.value.trim();
    if(v)$('c-banner-preview').innerHTML=`<img src="${v}" alt="" onerror="this.remove()"/><span style="font-size:.82rem;color:var(--text3)">URL preview</span>`;
  };
};

// PAYMENTS
async function renderPayments(){
  const statusFilter=$('pay-filter')?.value||'';
  const url=statusFilter?`/payments/all?status=${statusFilter}`:'/payments/all';
  let payments;
  try{ payments=list(await api(url+(url.includes('?')?'&':'?')+'limit=100')); }catch(e){ $('page-content').innerHTML=`<div style="color:var(--sale);padding:20px">${e.message}</div>`; return; }
  const statusBadge={pending:'badge-pending',verified:'badge-verified',rejected:'badge-rejected'};
  $('page-content').innerHTML=`
    <div class="section-header"><h2>Payments <span style="color:var(--text3);font-weight:400;font-size:1rem">(${payments.length})</span></h2>
      <select class="filter-select" id="pay-filter" onchange="renderPayments()">
        <option value="">All Status</option>
        <option value="pending">Pending</option>
        <option value="verified">Verified</option>
        <option value="rejected">Rejected</option>
      </select>
    </div>
    <div class="table-wrap"><div style="overflow-x:auto"><table>
      <thead><tr><th>Date</th><th>Customer</th><th>Product</th><th>Amount</th><th>Method</th><th>Txn ID</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>${payments.length?payments.map(p=>`
        <tr>
          <td style="font-size:.8rem;color:var(--text3)">${new Date(p.created_at).toLocaleDateString()}</td>
          <td><div class="td-name">${p.user_name||'—'}</div><div class="td-sub">${p.user_email||''}</div><div class="td-sub">${p.phone||''}</div></td>
          <td>${p.product_name||'—'}</td>
          <td><strong style="color:var(--blue-light)">Rs ${Number(p.amount).toLocaleString()}</strong></td>
          <td><span class="badge badge-active">${p.payment_method}</span></td>
          <td><code style="font-size:.78rem;color:var(--cyan)">${p.transaction_id}</code>
            ${p.screenshot_url?`<br/><a href="${p.screenshot_url}" target="_blank" style="font-size:.75rem;color:var(--blue-light)">📷 View SS</a>`:''}
            ${p.note?`<div style="font-size:.75rem;color:var(--text3);margin-top:4px">📝 ${p.note}</div>`:''}</td>
          <td><span class="badge ${statusBadge[p.status]||'badge-pending'}">${p.status}</span>
            ${p.admin_note?`<div style="font-size:.75rem;color:var(--text3);margin-top:4px">${p.admin_note}</div>`:''}</td>
          <td><div class="td-actions">
            ${p.status==='pending'?`
              <button class="btn-success btn-sm" onclick="verifyPayment('${p.id}','verified')">✅ Verify</button>
              <button class="btn-danger btn-sm" onclick="verifyPayment('${p.id}','rejected')">❌ Reject</button>
            `:`<span style="color:var(--text3);font-size:.8rem">${p.status}</span>`}
          </div></td>
        </tr>`).join(''):`<tr class="empty-row"><td colspan="8">No payments found</td></tr>`}
      </tbody>
    </table></div></div>`;
}

window.verifyPayment=async function(id,status){
  const note=status==='rejected'?prompt('Rejection reason (optional):')||'':'';
  try{
    await api(`/payments/${id}/status`,{method:'PUT',body:JSON.stringify({status,admin_note:note})});
    toast(`Payment ${status}!`,status==='verified'?'success':'error');
    renderPayments();
  }catch(e){toast(e.message,'error');}
};

// USERS
async function renderUsers(){
  const users=list(await api('/users?limit=100'));
  $('page-content').innerHTML=`
    <div class="section-header"><h2>Users</h2></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>${users.map(u=>`
        <tr>
          <td class="td-name">${u.name}</td>
          <td style="font-size:.85rem">${u.email}</td>
          <td><span class="badge badge-${u.role}">${u.role}</span></td>
          <td><span class="badge ${u.is_active?'badge-active':'badge-inactive'}">${u.is_active?'Active':'Disabled'}</span></td>
          <td style="font-size:.8rem;color:var(--text3)">${new Date(u.created_at).toLocaleDateString()}</td>
          <td><div class="td-actions">
            ${u.role!=='admin'?`<button class="btn-outline btn-sm" onclick="toggleUser('${u.id}','${u.name}',${u.is_active})">${u.is_active?'Disable':'Enable'}</button>
            <button class="btn-success btn-sm" onclick="promoteUser('${u.id}','${u.name}')">Make Admin</button>`:'<span style="color:var(--text3);font-size:.8rem">Admin</span>'}
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

window.toggleUser=function(id,name,active){
  confirm(`${active?'Disable':'Enable'} user "${name}"?`,async()=>{
    await api(`/users/${id}`,{method:'PUT',body:JSON.stringify({is_active:active?0:1})});toast('User updated');renderUsers();
  });
};

window.promoteUser=function(id,name){
  confirm(`Make "${name}" an admin? This cannot be undone.`,async()=>{
    await api(`/users/${id}`,{method:'PUT',body:JSON.stringify({role:'admin'})});toast('User promoted to admin');renderUsers();
  });
};

// SETTINGS
async function renderSettings(){
  $('page-content').innerHTML=`<div style="color:var(--text3);text-align:center;padding:40px">Loading...</div>`;
  try{
    const settings=await api('/settings');
    $('page-content').innerHTML=`
      <div class="table-wrap" style="max-width:680px;margin:0 auto;padding:30px">
        <h3 style="margin-bottom:8px">Payment & Contact Settings</h3>
        <p style="color:var(--text3);font-size:.82rem;margin:0 0 24px">Configure the payment options and contact details shown to customers during checkout.</p>

        <div class="form-row">
          <div class="form-group">
            <label>Payment Methods <span style="color:var(--text3);font-size:.75rem">(comma-separated)</span></label>
            <input id="s-payment-methods" value="${settings.payment_methods||''}" placeholder="eSewa, Khalti, Bank transfer"/>
          </div>
          <div class="form-group">
            <label>Payment Account ID <span style="color:var(--text3);font-size:.75rem">(eSewa / Khalti number)</span></label>
            <input id="s-payment-account" value="${settings.payment_account||''}" placeholder="9705985657" maxlength="15"/>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>WhatsApp Number <span style="color:var(--text3);font-size:.75rem">(with country code)</span></label>
            <input id="s-whatsapp" value="${settings.whatsapp_number||''}" placeholder="9779705985657" maxlength="15"/>
          </div>
          <div class="form-group">
            <label>Contact Email</label>
            <input id="s-email" type="email" value="${settings.contact_email||''}" placeholder="support@example.com"/>
          </div>
        </div>

        <div class="form-group">
          <label>Payment Instructions <span style="color:var(--text3);font-size:.75rem">(shown during checkout)</span></label>
          <textarea id="s-instructions" style="min-height:80px">${settings.payment_instructions||''}</textarea>
        </div>

        <div class="form-group" style="margin-top:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,0.02)">
          <label style="font-weight:700;font-size:.95rem;color:var(--text);margin-bottom:8px">Payment QR Code (FonePay / eSewa / Khalti / Bank)</label>
          <p style="color:var(--text3);font-size:.8rem;margin-bottom:12px">Upload a custom QR code image or paste an image URL. Leave empty to use auto-generated QR.</p>
          
          <div class="form-group">
            <label style="font-size:.8rem">QR Image URL / Path</label>
            <div style="display:flex;gap:8px">
              <input id="s-payment-qr-url" value="${settings.payment_qr_url||''}" placeholder="e.g. /api/media/xyz or https://..." style="flex:1"/>
              <button type="button" class="btn-outline btn-sm" id="clear-qr-btn">Clear QR</button>
            </div>
          </div>

          <div class="upload-zone" id="qr-upload-zone" style="height:100px;margin-top:10px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;border:2px dashed var(--border);border-radius:10px;background:rgba(255,255,255,0.02)">
            <p style="margin:0;font-size:.88rem;color:var(--text)">📁 Click to upload QR image file</p>
            <span style="font-size:.75rem;color:var(--text3);margin-top:4px">PNG, JPG, or WebP</span>
            <input type="file" id="qr-file" accept="image/*" style="display:none"/>
          </div>

          <div id="qr-preview" style="margin-top:16px;text-align:center">
            ${settings.payment_qr_url ? `<img src="${settings.payment_qr_url}" style="max-width:200px;max-height:200px;border-radius:10px;border:1px solid var(--border);box-shadow:0 4px 15px rgba(0,0,0,0.3)"/><p style="font-size:.78rem;color:var(--success);margin-top:6px">Active Custom Payment QR</p>` : '<p style="color:var(--text3);font-size:.8rem">No custom QR set. System will auto-generate FonePay / eSewa QR at checkout.</p>'}
          </div>
        </div>

        <div class="form-group" style="margin-top:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:rgba(255,255,255,0.02)">
          <label style="font-weight:700;font-size:.95rem;color:var(--text);margin-bottom:8px">📧 Gmail / SMTP Email Notifications & OTP Configuration</label>
          <p style="color:var(--text3);font-size:.8rem;margin-bottom:12px">Configure your Gmail address and App Password to send Login OTP codes and Order status emails.</p>
          
          <div class="form-row">
            <div class="form-group">
              <label style="font-size:.8rem">SMTP Host</label>
              <input id="s-smtp-host" value="${settings.smtp_host||'smtp.gmail.com'}" placeholder="smtp.gmail.com"/>
            </div>
            <div class="form-group">
              <label style="font-size:.8rem">SMTP Port</label>
              <input id="s-smtp-port" value="${settings.smtp_port||'465'}" placeholder="465"/>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label style="font-size:.8rem">SMTP Username (Email Address)</label>
              <input id="s-smtp-user" value="${settings.smtp_user||''}" placeholder="admin@diginepal.com"/>
            </div>
            <div class="form-group">
              <label style="font-size:.8rem">SMTP Password <span style="color:var(--text3);font-size:.75rem">(Mailbox password or Gmail App Password)</span></label>
              <input id="s-smtp-pass" type="password" value="${settings.smtp_pass||''}" placeholder="••••••••••••"/>
            </div>
          </div>

          <div style="display:flex;gap:12px;align-items:center;margin-top:12px">
            <button type="button" class="btn-outline btn-sm" id="test-email-btn">🧪 Send Test Email</button>
            <span id="test-email-status" style="font-size:.8rem;color:var(--text3)"></span>
          </div>
        </div>

        <button class="btn-primary full" id="save-settings-btn" style="margin-top:24px">Save All Settings</button>
      </div>`;

    $('qr-upload-zone').onclick=()=>$('qr-file').click();
    $('clear-qr-btn').onclick=()=>{
      $('s-payment-qr-url').value='';
      $('qr-preview').innerHTML='<p style="color:var(--text3);font-size:.8rem">No custom QR set. System will auto-generate FonePay / eSewa QR at checkout.</p>';
      toast('QR cleared. Click "Save All Settings" to apply.');
    };
    $('test-email-btn').onclick=async()=>{
      const email=prompt('Enter recipient email address to receive test email:',adminUser?.email||'');
      if(!email)return;
      const status=$('test-email-status');
      status.textContent='Sending test email...';
      try{
        const res=await api('/auth/test-email',{method:'POST',body:JSON.stringify({to:email})});
        toast(res.message,res.success?'success':'warning');
        status.textContent=res.message;
      }catch(err){
        toast('Test email failed: '+err.message,'error');
        status.textContent='Failed: '+err.message;
      }
    };
    $('s-payment-qr-url').oninput=e=>{
      const val=e.target.value.trim();
      if(val){
        $('qr-preview').innerHTML=`<img src="${val}" style="max-width:200px;max-height:200px;border-radius:10px;border:1px solid var(--border);box-shadow:0 4px 15px rgba(0,0,0,0.3)"/><p style="font-size:.78rem;color:var(--success);margin-top:6px">Previewing Custom QR</p>`;
      }else{
        $('qr-preview').innerHTML='<p style="color:var(--text3);font-size:.8rem">No custom QR set. System will auto-generate FonePay / eSewa QR at checkout.</p>';
      }
    };
    $('qr-file').onchange=async e=>{
      const f=e.target.files[0]; if(!f)return;
      const preview=$('qr-preview');
      preview.innerHTML=`<p style="color:var(--cyan);font-size:.82rem">Reading ${f.name}...</p>`;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target.result;
        $('s-payment-qr-url').value = dataUrl;
        preview.innerHTML = `<img src="${dataUrl}" style="max-width:200px;max-height:200px;border-radius:10px;border:1px solid var(--border);box-shadow:0 4px 15px rgba(0,0,0,0.3)"/><p style="font-size:.8rem;color:var(--success);margin-top:6px">QR Image Ready! Click "Save All Settings" to apply.</p>`;
        
        try {
          const fd = new FormData();
          fd.append('image', f);
          fd.append('purpose', 'catalog');
          const uploaded = await api('/upload', { method: 'POST', body: fd });
          if (uploaded && uploaded.url) {
            $('s-payment-qr-url').value = uploaded.url;
            preview.innerHTML = `<img src="${uploaded.url}" style="max-width:200px;max-height:200px;border-radius:10px;border:1px solid var(--border);box-shadow:0 4px 15px rgba(0,0,0,0.3)"/><p style="font-size:.8rem;color:var(--success);margin-top:6px">Uploaded to server! Click "Save All Settings" to apply.</p>`;
            toast('QR image uploaded to server!');
          }
        } catch (uploadErr) {
          toast('Server upload warning: using Data URL format fallback', 'warning');
        }
      };
      reader.readAsDataURL(f);
    };

    $('save-settings-btn').onclick=async()=>{
      const btn=$('save-settings-btn'); btn.disabled=true; btn.textContent='Saving...';
      try{
        const updates={
          payment_methods:$('s-payment-methods').value.trim(),
          payment_account:$('s-payment-account').value.trim(),
          whatsapp_number:$('s-whatsapp').value.trim(),
          contact_email:$('s-email').value.trim(),
          payment_instructions:$('s-instructions').value.trim(),
          payment_qr_url:$('s-payment-qr-url').value.trim(),
          smtp_host:$('s-smtp-host').value.trim(),
          smtp_port:$('s-smtp-port').value.trim(),
          smtp_user:$('s-smtp-user').value.trim(),
          smtp_pass:$('s-smtp-pass').value.trim(),
          smtp_from:$('s-smtp-user').value.trim()?`Digi Prime Nepal <${$('s-smtp-user').value.trim()}>`:''
        };
        await api('/settings',{method:'PUT',body:JSON.stringify(updates)});
        toast('Settings saved!'); renderSettings();
      }catch(err){toast(err.message,'error'); btn.disabled=false; btn.textContent='Save All Settings';}
    };
  }catch(e){$('page-content').innerHTML=`<div style="color:var(--sale);padding:20px">${e.message}</div>`;}
}

// INIT
(async()=>{
  try{
      const u=await api('/auth/me');
      if(u.role==='admin'){
        const csrfResponse=await api('/auth/csrf');
        csrf=csrfResponse.csrf||'';
        adminUser=u;
        $('login-screen').hidden=true;$('admin-app').hidden=false;
        $('admin-name-display').textContent=`👤 ${u.name}`;
        const params = new URLSearchParams(window.location.search);
        const pid = params.get('editProduct');
        if (pid) {
          navigate('products');
          setTimeout(async () => {
            try {
              const p = await api(`/products/${pid}`);
              const cats = list(await api('/categories/all?limit=100'));
              openProductForm(p, cats);
            } catch (e) { toast('Product not found', 'error'); }
          }, 600);
        } else {
          navigate('dashboard');
        }
        return;
      }
    }catch(e){void e;}
})();
