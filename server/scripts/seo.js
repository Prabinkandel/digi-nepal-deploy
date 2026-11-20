/* SEO pages regenerated 2026-11-17 for the sq4 artwork set and the .com Domain product.
 SEO + AI-SEO build step for Digi Nepal.
 *
 * Runs at the end of server/scripts/build.js and generates, from the LIVE
 * public catalogue API (so prices and plans are true at deploy time):
 *
 *   dist/product/<slug>/index.html  — one crawlable page per product family
 *   dist/sitemap.xml                 — homepage, static pages, product pages
 *   dist/robots.txt                  — allow all + Sitemap line
 *   dist/llms.txt                    — structured store facts for AI assistants
 *   dist/index.html                  — footer product-link list injected at
 *                                      the <!-- SEO_CATALOG_LINKS --> marker
 *
 * The grouping, pricing and image-resolution helpers below are ports of the
 * storefront's own functions in app.js (groupProducts, savingsOf,
 * durationOf, durationMonths, featuresOf, productImageUrlFor) so a static
 * page always describes a family exactly the way the store groups it.
 *
 * Failure policy: if the catalogue API is unreachable or returns nothing,
 * this throws and the whole build fails — a deploy must never ship empty
 * or stale product pages silently.
 */

const fs = require('node:fs');
const path = require('node:path');

const SITE_ORIGIN = 'https://www.diginepalnp.com';
const API_BASE = (process.env.SEO_API_BASE || SITE_ORIGIN).replace(/\/+$/, '');
const STORE_NAME = 'Digi Nepal'; // one entity name everywhere machine-facing (research 2026-11-19); 'Digi Prime Nepal' survives only as alternateName
const FALLBACK_WHATSAPP = '9779705985657';
const FALLBACK_EMAIL = 'digiprimenepal@gmail.com';

/* ------------------------------------------------------------------ */
/* Helpers ported from app.js (keep in sync with the storefront).      */
/* ------------------------------------------------------------------ */

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const formatMoney = amount => new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR', maximumFractionDigits: 0 }).format(Number(amount || 0));

function stripDurationSuffix(name) {
  return String(name || '').trim().replace(/[\s\-\u2013\u2014]*\b\d+\s*(months?|years?|days?|weeks?)\s*$/i, '').trim();
}
function displayNameOf(name) {
  const raw = String(name || '').trim();
  return stripDurationSuffix(raw) || raw;
}
function baseKey(name) {
  const k = String(name || '').trim().toLowerCase();
  const stripped = stripDurationSuffix(k) || k;
  const noParen = stripped.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return noParen || stripped;
}
function familyNameOf(name) {
  const raw = String(name || '').trim();
  const noDur = stripDurationSuffix(raw) || raw;
  const noParen = noDur.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripDurationSuffix(noParen) || noParen || raw;
}
const GROUP_DISPLAY_NAMES = { 'capcut pro': 'CapCut Pro', 'muse ai': 'Muse AI', 'claude ai api': 'Claude AI API' };

function groupProducts(products) {
  const map = new Map();
  for (const p of (products || [])) {
    const key = baseKey(p.name);
    if (!map.has(key)) map.set(key, { key, name: displayNameOf(p.name), category_name: p.category_name, category_id: p.category_id, image_url: p.image_url, variants: [] });
    const g = map.get(key);
    g.variants.push(p);
    if (!g.image_url && p.image_url) g.image_url = p.image_url;
  }
  return [...map.values()].map(g => {
    g.variants.sort((a, b) => Number(a.price) - Number(b.price));
    g.minPrice = Math.min(...g.variants.map(v => Number(v.price || 0)));
    g.stockOut = g.variants.every(v => Number(v.stock_out) === 1);
    g.inStock = g.variants.some(v => v.stock === undefined || v.stock === null || Number(v.stock) > 0);
    g.rep = g.variants[0];
    if (g.variants.length > 1) g.name = GROUP_DISPLAY_NAMES[g.key] || familyNameOf(g.name);
    return g;
  });
}

function savingsOf(product) {
  const price = Number(product.price || 0);
  const was = Number(product.original_price || 0);
  if (!was || was <= price) return null;
  return { amount: was - price, percent: Math.round(((was - price) / was) * 100) };
}

function durationOf(product) {
  if (product.duration) return product.duration;
  const text = (product.name || '') + ' ' + (product.description || '');
  const match = text.match(/(\d+)\s*[-\s]?\s*(year|years|yr|month|months|mo|week|weeks|day|days)\b/i);
  if (!match) return /lifetime/i.test(text) ? 'Lifetime' : '';
  const count = Number(match[1]);
  const unit = match[2].toLowerCase();
  const name = unit.startsWith('y') ? 'Year' : unit.startsWith('mo') || unit === 'm' ? 'Month' : unit.startsWith('w') ? 'Week' : 'Day';
  return count + ' ' + name + (count > 1 ? 's' : '');
}

function durationMonths(variant) {
  const d = durationOf(variant) || '';
  const m = d.match(/(\d+(?:\.\d+)?)\s*(months?|years?)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2].toLowerCase().startsWith('year') ? n * 12 : n;
}

function duplicateDurations(variants) {
  const counts = new Map();
  variants.forEach(v => {
    const d = durationOf(v) || v.name;
    counts.set(d, (counts.get(d) || 0) + 1);
  });
  return counts;
}

function planVariantTail(variant) {
  const m = String(variant.name || '').match(/\(([^)]+)\)/);
  return m ? m[1].trim() : 'Standard';
}

/* Plan label exactly as the store's popup renders it: duration first, the
   distinguishing tail only when two plans share that duration. */
function planLabelFor(variant, dupes) {
  const duration = durationOf(variant) || variant.name;
  return dupes && dupes.get(durationOf(variant) || variant.name) > 1 ? duration + ' · ' + planVariantTail(variant) : duration;
}

function featuresOf(product) {
  if (product && Array.isArray(product.features) && product.features.length) return product.features;
  const desc = String((product && product.description) || '').replace(/\s+/g, ' ').trim();
  if (!desc) return [];
  return desc.split(/\.\s+/).map(s => s.replace(/\.\s*$/, '').trim()).filter(s => s.length >= 12).slice(0, 8);
}

const BRAND_LOGOS = {
  'netflix 4k': '/logos/sq4/netflix-4k.webp',
  'spotify premium': '/logos/sq5/spotify-premium.webp',
  'canva pro': '/logos/sq4/canva-pro.webp',
  'chatgpt plus': '/logos/sq4/chatgpt-plus.webp',
  'gemini ai pro': '/logos/sq5/gemini.webp',
  // (sq5 = official Gemini lockup tile, 2026-11-17; rebuild after admin repoint so static pages bake it in)
  'gemini plus': '/logos/sq5/gemini.webp',
  'capcut pro': '/logos/sq4/capcut-pro.webp',
  'prime video': '/logos/sq4/prime-video.webp'
};
function brandLogoFor(name) { return BRAND_LOGOS[baseKey(name || '')] || ''; }
const BRAND_LOGO_OVERRIDE = new Set(['chatgpt plus', 'capcut pro', 'prime video']);
function brandLogoOverrideFor(name) {
  const key = baseKey(name || '');
  return BRAND_LOGO_OVERRIDE.has(key) ? (BRAND_LOGOS[key] || '') : '';
}
function absoluteMediaUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return SITE_ORIGIN + (u.startsWith('/') ? u : '/' + u);
}
function productImageUrlFor(product) {
  if (!product) return '';
  const override = brandLogoOverrideFor(product.name);
  if (override) return absoluteMediaUrl(override);
  if (product.image_url) return absoluteMediaUrl(product.image_url);
  const logo = brandLogoFor(product.name);
  return logo ? absoluteMediaUrl(logo) : '';
}
/* The image the store card shows for a family: the group's image when it
   has one, otherwise the representative (cheapest) variant's. */
function familyImageUrlFor(group) {
  const probe = group.image_url ? { name: group.name, image_url: group.image_url } : group.rep;
  return productImageUrlFor(probe);
}

function variantAvailable(v) {
  return Number(v.stock_out) !== 1 && (v.stock === undefined || v.stock === null || Number(v.stock) > 0);
}

/* ------------------------------------------------------------------ */
/* Catalogue fetch — every page, exactly like the storefront does.     */
/* ------------------------------------------------------------------ */

async function fetchJson(url, attempts = 2) {
  let lastError = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function fetchCatalogue() {
  const items = [];
  let page = 1;
  let pages = 1;
  do {
    const data = await fetchJson(API_BASE + '/api/products?page=' + page + '&limit=24');
    const batch = Array.isArray(data) ? data : (data.items || []);
    items.push(...batch);
    pages = Number((data && data.pages) || 1);
    page++;
  } while (page <= pages);
  return items;
}

async function fetchSettings() {
  try {
    const s = await fetchJson(API_BASE + '/api/settings', 1);
    return {
      whatsapp: String((s && s.whatsapp_number) || '').replace(/[^0-9]/g, '') || FALLBACK_WHATSAPP,
      email: (s && s.contact_email) || FALLBACK_EMAIL
    };
  } catch {
    return { whatsapp: FALLBACK_WHATSAPP, email: FALLBACK_EMAIL };
  }
}

/* ------------------------------------------------------------------ */
/* Page content builders                                               */
/* ------------------------------------------------------------------ */

function slugify(name, taken) {
  let slug = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
  if (taken.has(slug)) {
    let n = 2;
    while (taken.has(slug + '-' + n)) n++;
    slug = slug + '-' + n;
  }
  taken.add(slug);
  return slug;
}

function buildFaqs(group) {
  const name = group.name;
  const dupes = duplicateDurations(group.variants);
  const planList = group.variants.map(v => planLabelFor(v, dupes) + ' — ' + formatMoney(v.price)).join('; ');
  const faqs = [
    {
      q: 'How much does ' + name + ' cost in Nepal?',
      a: name + ' at Digi Nepal starts at ' + formatMoney(group.minPrice) + '. Available plans: ' + planList + '. All prices are in Nepali Rupees (NPR).'
    },
    {
      q: 'How do I pay for ' + name + '?',
      a: 'You can pay with eSewa, Khalti, IME Pay or Bank QR / bank transfer. The payment instructions appear during checkout, and every payment receipt is verified by the Digi Nepal team before delivery.'
    },
    {
      q: 'How fast will I get my ' + name + '?',
      a: 'Delivery is instant after your payment is approved — most orders are delivered within minutes. You can follow your order status from your Digi Nepal account.'
    },
    {
      q: 'Does ' + name + ' come with a warranty?',
      a: 'Yes. ' + name + ' includes an activation warranty — if access fails or is blocked, Digi Nepal re-activates or replaces it free of charge. WhatsApp support is available if you need help with your order.'
    }
  ];
  // .com Domain: state the renewal price as plainly as the first-year price.
  if (baseKey(name) === '.com domain' && Number(group.rep.original_price) > 0) {
    faqs.push({
      q: 'How much does a .com domain cost to renew after the first year?',
      a: 'The first year costs ' + formatMoney(group.minPrice) + ' at Digi Nepal. From year 2, renewal is at the regular price of ' + formatMoney(group.rep.original_price) + ' per year — the same regular price shown as the compare price on this page. There are no hidden charges, and free setup help is included on WhatsApp.'
    });
  }
  return faqs;
}

function whatsappOrderUrl(group, settings) {
  const rep = group.rep;
  const dupes = duplicateDurations(group.variants);
  const plan = planLabelFor(rep, dupes);
  const lines = [
    '*🛒 New Order — Digi Nepal*',
    '━━━━━━━━━━━━━━━',
    '📦 *Product:* ' + rep.name
  ];
  if (plan && plan !== rep.name) lines.push('🗓️ *Plan:* ' + plan);
  lines.push('💰 *Price:* ' + formatMoney(rep.price));
  lines.push('━━━━━━━━━━━━━━━');
  lines.push('Please share the payment details (eSewa / Khalti / QR). Thank you! 🙏');
  // Product link LAST, no image line — same format as the storefront's
  // buildWhatsAppOrderMessage (owner, 2026-11-17).
  lines.push('🔗 *Product:* ' + SITE_ORIGIN + '/#product=' + encodeURIComponent(rep.id));
  return 'https://wa.me/' + settings.whatsapp + '?text=' + encodeURIComponent(lines.join('\n'));
}

const PAGE_CSS = `
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:#050505;color:#f4f4f5;font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.65}
a{color:inherit}
.wrap{width:min(880px,calc(100% - 2.5rem));margin:auto}
header.pp-head{padding:1.1rem 0;border-bottom:1px solid #232329}
.pp-brand{font-weight:800;letter-spacing:-.02em;text-decoration:none;font-size:1.05rem}
.pp-brand em{color:#ff4655;font-style:normal}
.crumbs{padding:1rem 0 0;color:#a1a1aa;font-size:.82rem}
.crumbs a{color:#a1a1aa;text-decoration:none}
.crumbs a:hover{color:#fff}
main{padding:1.2rem 0 3rem}
h1{font-size:clamp(2rem,5.5vw,3rem);letter-spacing:-.045em;line-height:1.08;margin:.4rem 0 .6rem;color:#fff}
.pp-cat{color:#ff4655;font-size:.72rem;font-weight:800;letter-spacing:.15em;text-transform:uppercase;margin:0}
.pp-from{font-size:1.05rem;color:#d4d4d8;margin:.2rem 0 1.2rem}
.pp-from strong{color:#fff;font-size:1.5rem;letter-spacing:-.03em}
.pp-hero{background:#fff;border-radius:1rem;padding:1.4rem;display:grid;place-items:center;margin:0 0 1.4rem}
.pp-hero img{max-width:min(420px,88%);max-height:170px;width:auto;height:auto;object-fit:contain}
.pp-desc{color:#d4d4d8;font-size:1rem;max-width:65ch}
.pp-quick{border-left:3px solid #e50914;background:#101013;border-radius:.5rem;padding:.85rem 1rem;color:#e4e4e7;max-width:65ch}
h2{font-size:1.35rem;letter-spacing:-.03em;margin:2.2rem 0 .9rem;color:#fff}
.plans{display:grid;gap:.7rem}
.plan{display:flex;flex-wrap:wrap;align-items:baseline;gap:.45rem .8rem;border:1px solid #26262c;border-radius:.85rem;padding:1rem 1.1rem;background:#0d0d10}
.plan .plan-name{font-weight:700;color:#fff}
.plan .plan-price{font-size:1.25rem;font-weight:800;letter-spacing:-.03em;color:#fff;margin-left:auto}
.plan .plan-per{color:#a1a1aa;font-size:.85rem}
.plan .plan-was{color:#8b8b93;text-decoration:line-through;font-size:.9rem}
.plan .plan-save{background:#123526;color:#4ade80;border-radius:999px;padding:.14rem .55rem;font-size:.72rem;font-weight:700}
.plan .plan-out{background:#3a1519;color:#ffb0b5;border-radius:999px;padding:.14rem .55rem;font-size:.72rem;font-weight:700}
.plan.is-best{border-color:rgba(255,70,85,.55)}
.plan .plan-best{color:#ffb020;font-size:.75rem;font-weight:800;letter-spacing:.06em}
.features{list-style:none;padding:0;margin:0}
.features li{padding:.42rem 0;color:#d4d4d8}
.features li:before{content:'✓';color:#4ade80;font-weight:800;margin-right:.6rem}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}
.fact{border:1px solid #26262c;border-radius:.85rem;padding:.95rem 1rem;background:#0d0d10}
.fact b{display:block;color:#fff;margin-bottom:.2rem}
.fact span{color:#a1a1aa;font-size:.88rem}
.cta-row{display:flex;flex-wrap:wrap;gap:.8rem;margin:1.8rem 0 .4rem}
.btn{display:inline-flex;align-items:center;gap:.5rem;border-radius:.75rem;padding:.9rem 1.3rem;font-weight:700;text-decoration:none;font-size:.95rem}
.btn-buy{background:#e50914;color:#fff;box-shadow:0 8px 28px rgba(229,9,20,.28)}
.btn-wa{background:#1faa55;color:#fff}
.faq details{border-bottom:1px solid #232329}
.faq summary{cursor:pointer;padding:1rem 0;font-weight:700;color:#fff;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq details p{margin:0 0 1.1rem;color:#c9c9cf;max-width:68ch}
.more{display:flex;flex-wrap:wrap;gap:.55rem}
.more a{border:1px solid #2c2c33;border-radius:999px;padding:.45rem .85rem;text-decoration:none;color:#d4d4d8;font-size:.88rem;background:#0d0d10}
.more a:hover{border-color:rgba(255,70,85,.6);color:#fff}
footer.pp-foot{border-top:1px solid #232329;padding:1.4rem 0 2.2rem;color:#8b8b93;font-size:.85rem}
footer.pp-foot a{color:#c9c9cf}
`;

function buildProductPage(group, siblings, settings) {
  const name = group.name;
  const slug = group.slug;
  const pageUrl = SITE_ORIGIN + '/product/' + slug + '/';
  const rep = group.rep;
  const description = String(rep.description || '').replace(/\s+/g, ' ').trim();
  const features = featuresOf(rep);
  const imageUrl = familyImageUrlFor(group);
  const dupes = duplicateDurations(group.variants);
  const faqs = buildFaqs(group);

  const monthlies = group.variants.map(v => ({ v, months: durationMonths(v) })).filter(x => x.months > 0);
  const bestValueId = monthlies.length >= 2 ? monthlies.reduce((best, x) => (Number(x.v.price) / x.months < Number(best.v.price) / best.months ? x : best)).v.id : null;

  const title = name + ' Price in Nepal — Buy ' + name + ' | Digi Nepal';
  const snippet = description.length > 118 ? description.slice(0, 118).replace(/\s+\S*$/, '') + '…' : description;
  const metaDesc = (name + ' price in Nepal — from ' + formatMoney(group.minPrice) + ' at Digi Nepal. ' + snippet + ' Instant delivery, activation warranty. Pay with eSewa, Khalti, IME Pay or Bank QR.').slice(0, 300);

  const offers = group.variants.map(v => ({
    '@type': 'Offer',
    name: planLabelFor(v, dupes),
    price: Number(v.price),
    priceCurrency: 'NPR',
    availability: variantAvailable(v) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    url: pageUrl,
    seller: { '@type': 'Organization', name: STORE_NAME }
  }));
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description,
    url: pageUrl,
    ...(imageUrl ? { image: imageUrl } : {}),
    ...(group.category_name ? { category: group.category_name } : {}),
    brand: { '@type': 'Brand', name },
    offers
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };
  const crumbsLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN + '/' },
      ...(group.category_name ? [{ '@type': 'ListItem', position: 2, name: group.category_name, item: SITE_ORIGIN + '/#catalog' }] : []),
      { '@type': 'ListItem', position: group.category_name ? 3 : 2, name, item: pageUrl }
    ]
  };

  const plansHtml = group.variants.map(v => {
    const saving = savingsOf(v);
    const months = durationMonths(v);
    const perMonth = months > 1 ? Math.round(Number(v.price) / months) : 0;
    const available = variantAvailable(v);
    return '<div class="plan' + (v.id === bestValueId ? ' is-best' : '') + '">' +
      '<span class="plan-name">' + escapeHtml(planLabelFor(v, dupes)) + '</span>' +
      (v.id === bestValueId ? '<span class="plan-best">⭐ BEST VALUE</span>' : '') +
      '<span class="plan-price">' + escapeHtml(formatMoney(v.price)) + '</span>' +
      (perMonth ? '<span class="plan-per">≈ ' + escapeHtml(formatMoney(perMonth)) + '/month</span>' : '') +
      (saving ? '<span class="plan-was">' + escapeHtml(formatMoney(v.original_price)) + '</span><span class="plan-save">Save ' + saving.percent + '% · You save ' + escapeHtml(formatMoney(saving.amount)) + '</span>' : '') +
      (available ? '' : '<span class="plan-out">Out of stock</span>') +
      '</div>';
  }).join('\n        ');

  const featuresHtml = features.length
    ? '<h2>What you get</h2>\n        <ul class="features">' + features.map(f => '<li>' + escapeHtml(f) + '</li>').join('') + '</ul>'
    : '';

  const faqHtml = faqs.map(f => '<details><summary>' + escapeHtml(f.q) + '</summary><p>' + escapeHtml(f.a) + '</p></details>').join('\n        ');

  const moreHtml = siblings.length
    ? '<h2>More in ' + escapeHtml(group.category_name || 'this category') + '</h2>\n        <div class="more">' +
      siblings.map(s => '<a href="/product/' + s.slug + '/">' + escapeHtml(s.name) + ' — from ' + escapeHtml(formatMoney(s.minPrice)) + '</a>').join('') +
      '</div>'
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${pageUrl}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  ${imageUrl ? '<meta property="og:image" content="' + escapeHtml(imageUrl) + '">' : ''}
  <meta property="og:site_name" content="${STORE_NAME}">
  <meta property="og:locale" content="en_NP">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}">
  ${imageUrl ? '<meta name="twitter:image" content="' + escapeHtml(imageUrl) + '">' : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
  <style>${PAGE_CSS}</style>
  <script type="application/ld+json">${JSON.stringify(productLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
  <script type="application/ld+json">${JSON.stringify(crumbsLd)}</script>
</head>
<body>
  <header class="pp-head"><div class="wrap"><a class="pp-brand" href="/">Digi <em>Nepal</em></a></div></header>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › ${group.category_name ? escapeHtml(group.category_name) + ' › ' : ''}<span aria-current="page">${escapeHtml(name)}</span></nav>
    <main>
      <p class="pp-cat">${escapeHtml(group.category_name || 'Digital subscription')}</p>
      <h1>${escapeHtml(name)}</h1>
      <p class="pp-from">Buy ${escapeHtml(name)} in Nepal — from <strong>${escapeHtml(formatMoney(group.minPrice))}</strong>${group.variants.length > 1 ? ' · ' + group.variants.length + ' plans available' : ''}</p>
      ${imageUrl ? '<figure class="pp-hero"><img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(name + ' — buy in Nepal at Digi Nepal') + '"></figure>' : ''}
      <p class="pp-quick"><strong>Quick answer:</strong> Digi Nepal (Pokhara, Nepal) sells ${escapeHtml(name)} in Nepal from ${escapeHtml(formatMoney(group.minPrice))} — pay with eSewa, Khalti, IME Pay or Bank QR, delivered the same day after payment approval, with an activation warranty.</p>
      <p class="pp-desc">${escapeHtml(description)}</p>
      <div class="cta-row">
        <a class="btn btn-buy" href="/#product=${encodeURIComponent(rep.id)}">Buy ${escapeHtml(name)} →</a>
        <a class="btn btn-wa" href="${escapeHtml(whatsappOrderUrl(group, settings))}" target="_blank" rel="noopener">Order via WhatsApp</a>
      </div>
      <h2>${escapeHtml(name)} plans &amp; prices in Nepal</h2>
      <div class="plans">
        ${plansHtml}
      </div>
      ${featuresHtml}
      <h2>Delivery &amp; payment</h2>
      <div class="facts">
        <div class="fact"><b>⚡ Instant delivery</b><span>Delivered right after your payment is approved.</span></div>
        <div class="fact"><b>💳 Pay your way</b><span>eSewa, Khalti, IME Pay or Bank QR / bank transfer.</span></div>
        <div class="fact"><b>🛡️ Activation warranty</b><span>Free re-activation or replacement if access is blocked.</span></div>
        <div class="fact"><b>💬 WhatsApp support</b><span>Message us any time at +977 9705985657.</span></div>
      </div>
      <h2>Frequently asked questions</h2>
      <div class="faq">
        ${faqHtml}
      </div>
      ${moreHtml}
      <h2>Keep browsing</h2>
      <div class="more"><a href="/#catalog">← All subscriptions at Digi Nepal</a></div>
    </main>
  </div>
  <footer class="pp-foot"><div class="wrap">© Digi Nepal · Prices shown in NPR · <a href="/">diginepalnp.com</a> · WhatsApp <a href="https://wa.me/${settings.whatsapp}">+977 9705985657</a></div></footer>
</body>
</html>
`;
}

const HUB_PATH = '/cheapest-subscriptions-in-nepal/';
const HUB_CSS = `
table.prices{width:100%;border-collapse:collapse;margin:0 0 .5rem}
table.prices th,table.prices td{padding:.8rem .7rem;border-bottom:1px solid #232329;text-align:left;vertical-align:middle}
table.prices th{color:#8b8b93;font-size:.78rem;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
table.prices td{color:#d4d4d8}
table.prices .p-name a{color:#fff;font-weight:700;text-decoration:none}
table.prices .p-name a:hover{color:#ff4655}
table.prices .p-price{color:#fff;font-weight:800;white-space:nowrap}
table.prices .p-save{background:#123526;color:#4ade80;border-radius:999px;padding:.14rem .55rem;font-size:.72rem;font-weight:700;white-space:nowrap}
table.prices .p-view{color:#ff4655;font-weight:700;text-decoration:none;white-space:nowrap}
@media (max-width:640px){table.prices .p-cat{display:none}}
`;

function buildHubPage(groups, settings, buildDate) {
  const pageUrl = SITE_ORIGIN + HUB_PATH;
  const byPrice = [...groups].sort((a, b) => Number(a.minPrice) - Number(b.minPrice));
  const cheapest = byPrice[0];
  const netflix = groups.find(g => baseKey(g.name) === 'netflix 4k');
  const prime = groups.find(g => baseKey(g.name) === 'prime video');

  const title = 'Cheapest Subscriptions in Nepal (2026) — Netflix, Prime Video, ChatGPT Plus & More | Digi Nepal';
  const metaDesc = ('Looking for the cheapest subscriptions in Nepal? Compare live NPR prices at Digi Nepal: Netflix 4K from ' +
    (netflix ? formatMoney(netflix.minPrice) : 'NPR 350') + ', Prime Video from ' + (prime ? formatMoney(prime.minPrice) : 'NPR 99') +
    ', ChatGPT Plus, Spotify, Canva Pro & more. Instant delivery, activation warranty, pay with eSewa, Khalti, IME Pay or Bank QR.').slice(0, 300);

  const faqs = [
    {
      q: 'Where can I buy the cheapest subscriptions in Nepal?',
      a: 'Digi Nepal (diginepalnp.com) sells premium subscriptions at some of the lowest prices in Nepal — Netflix 4K from ' + (netflix ? formatMoney(netflix.minPrice) : 'NPR 350') + ' per month and Prime Video from ' + (prime ? formatMoney(prime.minPrice) : 'NPR 99') + ' per month — with instant delivery after payment, an activation warranty, and payment by eSewa, Khalti, IME Pay or Bank QR. Every price on this page is the live store price in NPR.'
    },
    {
      q: 'What is the cheapest Netflix plan in Nepal?',
      a: 'At Digi Nepal, Netflix 4K costs ' + (netflix ? formatMoney(netflix.minPrice) : 'NPR 350') + ' for 1 month — a private profile on a premium 4K plan, signed in with email + OTP, renewed on the same account so your profile, watchlist and history carry over. Longer plans cost less per month: the 1 Year plan works out cheapest per month.'
    },
    {
      q: 'Why are subscriptions cheaper at Digi Nepal than the official price?',
      a: 'Official subscriptions bill in US dollars and need an international card, which adds conversion and bank fees. Digi Nepal supplies shared and private-profile plans bought in bulk and paid for locally, so the saving passes to you — the same premium apps, at local NPR prices, with no international card needed.'
    },
    {
      q: 'Is it safe to buy cheap subscriptions online in Nepal?',
      a: 'Yes, when the store stands behind the sale. Every Digi Nepal order is receipt-verified, tracked in your account, and covered by an activation warranty — if access is blocked, it is re-activated or replaced free. Support is on WhatsApp at +977 9705985657.'
    },
    {
      q: 'How do I pay for a subscription at Digi Nepal?',
      a: 'Pay with eSewa, Khalti, IME Pay, or any bank app using Bank QR / bank transfer. Choose a plan on the product page, sign in, start the order, and delivery follows as soon as the payment is approved.'
    }
  ];

  const listLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Cheapest subscriptions in Nepal — price list',
    itemListElement: byPrice.map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: g.name,
      url: SITE_ORIGIN + '/product/' + g.slug + '/'
    }))
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };
  const crumbsLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: 'Cheapest Subscriptions in Nepal', item: pageUrl }
    ]
  };

  const rowsHtml = byPrice.map(g => {
    const savings = g.variants.map(v => savingsOf(v)).filter(Boolean);
    const bestPct = savings.length ? Math.max(...savings.map(s => s.percent)) : 0;
    const durs = [...new Set(g.variants.map(v => durationOf(v)).filter(Boolean))];
    const rangeLabel = durs.length > 1 ? durs[0] + ' – ' + durs[durs.length - 1] : (durs[0] || '');
    return '<tr>' +
      '<td class="p-name"><a href="/product/' + g.slug + '/">' + escapeHtml(g.name) + '</a></td>' +
      '<td class="p-cat">' + escapeHtml(g.category_name || '') + '</td>' +
      '<td>' + (rangeLabel ? escapeHtml(rangeLabel) + ' · ' : '') + g.variants.length + (g.variants.length > 1 ? ' plans' : ' plan') + '</td>' +
      '<td class="p-price">' + escapeHtml(formatMoney(g.minPrice)) + '</td>' +
      '<td>' + (bestPct ? '<span class="p-save">Save up to ' + bestPct + '%</span>' : '') + '</td>' +
      '<td><a class="p-view" href="/product/' + g.slug + '/">View →</a></td>' +
      '</tr>';
  }).join('\n        ');

  const faqHtml = faqs.map(f => '<details><summary>' + escapeHtml(f.q) + '</summary><p>' + escapeHtml(f.a) + '</p></details>').join('\n        ');

  const pillsHtml = groups.map(g => '<a href="/product/' + g.slug + '/">' + escapeHtml(g.name) + ' — from ' + escapeHtml(formatMoney(g.minPrice)) + '</a>').join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${pageUrl}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(metaDesc)}">
  <meta property="og:image" content="${SITE_ORIGIN}/og-image.png">
  <meta property="og:site_name" content="${STORE_NAME}">
  <meta property="og:locale" content="en_NP">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(metaDesc)}">
  <meta name="twitter:image" content="${SITE_ORIGIN}/og-image.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
  <style>${PAGE_CSS}</style>
  <style>${HUB_CSS}</style>
  <script type="application/ld+json">${JSON.stringify(listLd)}</script>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
  <script type="application/ld+json">${JSON.stringify(crumbsLd)}</script>
</head>
<body>
  <header class="pp-head"><div class="wrap"><a class="pp-brand" href="/">Digi <em>Nepal</em></a></div></header>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span aria-current="page">Cheapest Subscriptions in Nepal</span></nav>
    <main>
      <p class="pp-cat">Price list · Prices checked ${escapeHtml(buildDate || '')}</p>
      <h1>Cheapest Subscriptions in Nepal</h1>
      <p class="pp-from">Premium apps at local prices — starting from just <strong>${escapeHtml(formatMoney(cheapest.minPrice))}</strong></p>
      <p class="pp-desc">Buying Netflix, Prime Video, ChatGPT Plus or Spotify from Nepal usually means a US-dollar price and an international card. Digi Nepal sells the same premium subscriptions at local NPR prices — pay with eSewa, Khalti, IME Pay or Bank QR, get instant delivery after payment approval, and stay covered by an activation warranty. Below is the full live price list, cheapest first.</p>
      <div class="cta-row">
        <a class="btn btn-buy" href="/#catalog">Browse all subscriptions →</a>
        <a class="btn btn-wa" href="https://wa.me/${settings.whatsapp}" target="_blank" rel="noopener">Ask on WhatsApp</a>
      </div>
      <h2>Subscription price list in Nepal (NPR)</h2>
      <table class="prices">
        <thead><tr><th>Subscription</th><th class="p-cat">Category</th><th>Plans</th><th>From</th><th>Saving</th><th></th></tr></thead>
        <tbody>
        ${rowsHtml}
        </tbody>
      </table>
      <p class="pp-desc">Prices are the live store prices in Nepali Rupees and can change with supplier rates. Tap a subscription to see every plan, per-month prices and exactly what you get.</p>
      <h2>Helpful guides</h2>
      <div class="more"><a href="/how-to-pay-for-subscriptions-in-nepal-without-a-dollar-card/">How to pay without a dollar card — eSewa/Khalti guide</a><a href="/cheapest-chatgpt-plus-in-nepal/">Cheapest ChatGPT Plus in Nepal — plans explained</a></div>
      <h2>Why buy from Digi Nepal?</h2>
      <div class="facts">
        <div class="fact"><b>⚡ Instant delivery</b><span>Delivered right after your payment is approved.</span></div>
        <div class="fact"><b>💳 No international card</b><span>eSewa, Khalti, IME Pay or Bank QR / bank transfer.</span></div>
        <div class="fact"><b>🛡️ Activation warranty</b><span>Free re-activation or replacement if access is blocked.</span></div>
        <div class="fact"><b>💬 WhatsApp support</b><span>Message us any time at +977 9705985657.</span></div>
      </div>
      <h2>Frequently asked questions</h2>
      <div class="faq">
        ${faqHtml}
      </div>
      <h2>All subscriptions</h2>
      <div class="more">${pillsHtml}</div>
    </main>
  </div>
  <footer class="pp-foot"><div class="wrap">© Digi Nepal · Prices shown in NPR · <a href="/">diginepalnp.com</a> · WhatsApp <a href="https://wa.me/${settings.whatsapp}">+977 9705985657</a></div></footer>
</body>
</html>
`;
}

function buildSitemap(groups, buildDate) {
  const statics = [
    { loc: SITE_ORIGIN + '/', changefreq: 'daily', priority: '1.0' },
    { loc: SITE_ORIGIN + '/cheapest-subscriptions-in-nepal/', changefreq: 'weekly', priority: '0.9' },
    { loc: SITE_ORIGIN + '/how-to-pay-for-subscriptions-in-nepal-without-a-dollar-card/', changefreq: 'monthly', priority: '0.8' },
    { loc: SITE_ORIGIN + '/cheapest-chatgpt-plus-in-nepal/', changefreq: 'monthly', priority: '0.8' },
    { loc: SITE_ORIGIN + '/about', changefreq: 'monthly', priority: '0.7' },
    { loc: SITE_ORIGIN + '/contact', changefreq: 'monthly', priority: '0.7' },
    { loc: SITE_ORIGIN + '/privacy', changefreq: 'yearly', priority: '0.4' },
    { loc: SITE_ORIGIN + '/terms', changefreq: 'yearly', priority: '0.4' },
    { loc: SITE_ORIGIN + '/refund', changefreq: 'yearly', priority: '0.4' }
  ];
  const urls = statics.map(u =>
    '  <url>\n    <loc>' + u.loc + '</loc>\n    <lastmod>' + buildDate + '</lastmod>\n    <changefreq>' + u.changefreq + '</changefreq>\n    <priority>' + u.priority + '</priority>\n  </url>');
  for (const g of groups) {
    urls.push('  <url>\n    <loc>' + SITE_ORIGIN + '/product/' + g.slug + '/</loc>\n    <lastmod>' + buildDate + '</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>');
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join('\n') + '\n</urlset>\n';
}

const ROBOTS_TXT = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /uploads/

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;

function buildLlms(groups, settings) {
  const lines = [
    '# Digi Nepal',
    '',
    '> Digi Nepal is an online store based in Pokhara, Nepal that sells premium digital subscriptions and gaming top-ups all over Nepal, with all prices in Nepali Rupees (NPR). Customers order on the website or via WhatsApp, pay with local payment methods (eSewa, Khalti, IME Pay, Bank QR), and receive same-day delivery after payment approval. Every order is covered by an activation warranty.',
    '',
    '## Store facts',
    '',
    '- Website: ' + SITE_ORIGIN + '/',
    '- Location: Pokhara, Kaski, Nepal (online store — delivers all over Nepal)',
    '- Country served: Nepal',
    '- Currency: NPR (Nepali Rupees)',
    '- Delivery: instant delivery after payment approval; order status is tracked in the customer account',
    '- Payment methods: eSewa, Khalti, IME Pay, Bank QR / bank transfer',
    '- Warranty: activation warranty — free re-activation or replacement if access is blocked',
    '- Support: WhatsApp +977 9705985657 (https://wa.me/' + settings.whatsapp + '), email ' + settings.email,
    '- Also available: Free Fire Diamond top-up for Nepal (Rs 30 – Rs 4,400) via the Free Fire section on the homepage',
    '',
    '## Products and starting prices',
    ''
  ];
  for (const g of groups) {
    const dupes = duplicateDurations(g.variants);
    const plans = g.variants.map(v => planLabelFor(v, dupes) + ' ' + formatMoney(v.price)).join('; ');
    lines.push('- [' + g.name + '](' + SITE_ORIGIN + '/product/' + g.slug + '/): from ' + formatMoney(g.minPrice) + ' — plans: ' + plans + (g.category_name ? ' (' + g.category_name + ')' : ''));
  }
  lines.push(
    '',
    '## Useful pages',
    '',
    '- [Cheapest Subscriptions in Nepal — full price list](' + SITE_ORIGIN + '/cheapest-subscriptions-in-nepal/)',
    '- [How to pay for subscriptions in Nepal without a dollar card](' + SITE_ORIGIN + '/how-to-pay-for-subscriptions-in-nepal-without-a-dollar-card/)',
    '- [Cheapest ChatGPT Plus in Nepal — prices and warranty explained](' + SITE_ORIGIN + '/cheapest-chatgpt-plus-in-nepal/)',
    '- [All subscriptions](' + SITE_ORIGIN + '/#catalog)',
    '- [About Digi Nepal](' + SITE_ORIGIN + '/about)',
    '- [Contact](' + SITE_ORIGIN + '/contact)',
    '- [Refund Policy](' + SITE_ORIGIN + '/refund)',
    '- [Terms of Service](' + SITE_ORIGIN + '/terms)',
    '- [Privacy Policy](' + SITE_ORIGIN + '/privacy)',
    ''
  );
  return lines.join('\n');
}


/* ------------------------------------------------------------------ */
/* Guides — keyword landing pages (research 2026-11-19: the two        */
/* highest-value content gaps — the no-dollar-card payment guide and   */
/* the cheapest-ChatGPT-Plus explainer). Prices are injected live      */
/* from the catalogue at build time, like every other static page.     */
/* ------------------------------------------------------------------ */

const GUIDE_PATHS = {
  payGuide: '/how-to-pay-for-subscriptions-in-nepal-without-a-dollar-card/',
  chatgptGuide: '/cheapest-chatgpt-plus-in-nepal/'
};

function buildGuidePage(guide, settings) {
  const pageUrl = SITE_ORIGIN + guide.path;
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  };
  const crumbsLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: guide.crumb, item: pageUrl }
    ]
  };
  const faqHtml = guide.faqs.map(f => '<details><summary>' + escapeHtml(f.q) + '</summary><p>' + escapeHtml(f.a) + '</p></details>').join('\n        ');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(guide.title)}</title>
  <meta name="description" content="${escapeHtml(guide.metaDesc)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${pageUrl}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:title" content="${escapeHtml(guide.title)}">
  <meta property="og:description" content="${escapeHtml(guide.metaDesc)}">
  <meta property="og:image" content="${SITE_ORIGIN}/og-image.png">
  <meta property="og:site_name" content="${STORE_NAME}">
  <meta property="og:locale" content="en_NP">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(guide.title)}">
  <meta name="twitter:description" content="${escapeHtml(guide.metaDesc)}">
  <meta name="twitter:image" content="${SITE_ORIGIN}/og-image.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
  <style>${PAGE_CSS}</style>
  <style>${HUB_CSS}</style>
  <script type="application/ld+json">${JSON.stringify(faqLd)}</script>
  <script type="application/ld+json">${JSON.stringify(crumbsLd)}</script>
</head>
<body>
  <header class="pp-head"><div class="wrap"><a class="pp-brand" href="/">Digi <em>Nepal</em></a></div></header>
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span aria-current="page">${escapeHtml(guide.crumb)}</span></nav>
    <main>
      <p class="pp-cat">Guide · Digi Nepal, Pokhara</p>
      <h1>${escapeHtml(guide.h1)}</h1>
      <p class="pp-quick"><strong>Quick answer:</strong> ${guide.quickAnswer}</p>
      ${guide.bodyHtml}
      <div class="cta-row">
        <a class="btn btn-buy" href="${guide.ctaHref}">${escapeHtml(guide.ctaLabel)}</a>
        <a class="btn btn-wa" href="https://wa.me/${settings.whatsapp}" target="_blank" rel="noopener">Ask on WhatsApp</a>
      </div>
      <h2>Frequently asked questions</h2>
      <div class="faq">
        ${faqHtml}
      </div>
      <h2>Keep browsing</h2>
      <div class="more"><a href="/cheapest-subscriptions-in-nepal/">Cheapest subscriptions in Nepal — full price list</a><a href="/#catalog">← All subscriptions at Digi Nepal</a></div>
    </main>
  </div>
  <footer class="pp-foot"><div class="wrap">© Digi Nepal · Prices shown in NPR · <a href="/">diginepalnp.com</a> · WhatsApp <a href="https://wa.me/${settings.whatsapp}">+977 9705985657</a></div></footer>
</body>
</html>
`;
}

function buildGuides(groups, settings) {
  const byKey = k => groups.find(g => baseKey(g.name) === k);
  const netflix = byKey('netflix 4k');
  const spotify = byKey('spotify premium');
  const youtube = byKey('youtube premium');
  const prime = byKey('prime video');
  const chatgpt = byKey('chatgpt plus');
  const priceRows = [netflix, chatgpt, spotify, youtube, prime].filter(Boolean).map(g =>
    '<tr><td class="p-name"><a href="/product/' + g.slug + '/">' + escapeHtml(g.name) + '</a></td>' +
    '<td class="p-price">from ' + escapeHtml(formatMoney(g.minPrice)) + '</td>' +
    '<td><a class="p-view" href="/product/' + g.slug + '/">See plans →</a></td></tr>').join('\n        ');

  const payGuide = {
    path: GUIDE_PATHS.payGuide,
    crumb: 'Pay without a dollar card',
    title: 'How to Pay for Netflix, ChatGPT & Spotify in Nepal Without a Dollar Card (2026) | Digi Nepal',
    metaDesc: 'No dollar card? You can still pay for Netflix, ChatGPT Plus, Spotify and YouTube Premium in Nepal with eSewa, Khalti or bank QR. How it works, what it costs in NPR, and how Digi Nepal delivers the same day.',
    h1: 'How to Pay for Subscriptions in Nepal Without a Dollar Card',
    quickAnswer: 'You do not need a dollar card to pay for Netflix, ChatGPT Plus, Spotify or YouTube Premium in Nepal. At Digi Nepal (Pokhara) you pay in Nepali Rupees with eSewa, Khalti, IME Pay or any bank QR, and your subscription is activated the same day — Netflix 4K from ' + (netflix ? formatMoney(netflix.minPrice) : 'NPR 299') + ', ChatGPT Plus from ' + (chatgpt ? formatMoney(chatgpt.minPrice) : 'NPR 650') + ', YouTube Premium ' + (youtube ? formatMoney(youtube.minPrice) : 'NPR 99') + ' per month.',
    bodyHtml: `
      <h2>Why Nepali bank cards fail on Netflix, Spotify and ChatGPT</h2>
      <p class="pp-desc">Netflix, Spotify, OpenAI and Google all bill in US dollars from outside Nepal. Most Nepali debit cards have international online payments switched off, so the payment is declined even when you have balance. That is why so many people in Nepal search for a way to pay without an international card.</p>
      <h2>Option 1: Get a dollar card from your bank</h2>
      <p class="pp-desc">Nepali banks issue prepaid dollar cards for international payments, but Nepal Rastra Bank caps them at about US $500 per year. That sounds like a lot until you add it up: ChatGPT Plus alone is $20 a month — $240 a year, almost half the cap — before Netflix, Spotify or anything else. There are also issuance and conversion fees, and you still pay the full US-dollar price.</p>
      <h2>Option 2: Pay in rupees at a Nepali store</h2>
      <p class="pp-desc">A local store like Digi Nepal buys and manages the subscriptions, so you simply pay in NPR with the wallet already on your phone. No dollar card, no cap problem, and usually a lower price than the official dollar price because plans are shared or supplied as private profiles. Every Digi Nepal order is covered by an activation warranty — if access is blocked, it is re-activated or replaced free.</p>
      <h2>Prices in Nepal when you pay with eSewa or Khalti</h2>
      <table class="prices">
        <thead><tr><th>Subscription</th><th>Price (NPR)</th><th></th></tr></thead>
        <tbody>
        ${priceRows}
        </tbody>
      </table>
      <h2>How to order — step by step</h2>
      <p class="pp-desc">1. Open the product page and choose your plan. 2. Sign in and start the order — you will see a reference number. 3. Pay with eSewa, Khalti, IME Pay or Bank QR and upload the receipt, or send the order on WhatsApp. 4. As soon as the payment is approved, your subscription is activated — usually within minutes, always the same day — and the details reach your email or WhatsApp.</p>`,
    faqs: [
      { q: 'Can I pay for Netflix with eSewa in Nepal?', a: 'Yes. Netflix itself does not accept eSewa, but at Digi Nepal you pay for your Netflix 4K plan with eSewa, Khalti, IME Pay or Bank QR in NPR, and Digi Nepal activates your private profile the same day.' },
      { q: 'Do I need a dollar card for ChatGPT Plus in Nepal?', a: 'No. OpenAI bills $20 a month in dollars, but Digi Nepal sells ChatGPT Plus from ' + (chatgpt ? formatMoney(chatgpt.minPrice) : 'NPR 650') + ' payable with eSewa or Khalti — no dollar card and no $500 yearly cap problem.' },
      { q: 'Is it safe to buy subscriptions from a Nepali online store?', a: 'It is safe when the store verifies your payment, tracks your order in your account and gives an activation warranty. Digi Nepal does all three, and WhatsApp support is available at +977 9705985657 if anything goes wrong.' },
      { q: 'How fast will my subscription be activated?', a: 'Delivery is instant after your payment is approved — most orders are activated within minutes, and always the same day.' }
    ],
    ctaHref: '/cheapest-subscriptions-in-nepal/',
    ctaLabel: 'See the full price list →'
  };

  const cgVariants = chatgpt ? [...chatgpt.variants].sort((a, b) => Number(a.price) - Number(b.price)) : [];
  const cgRows = cgVariants.map(v => {
    const tail = (String(v.name).match(/\(([^)]+)\)/) || [])[1] || planLabelFor(v, duplicateDurations(cgVariants));
    const note = /without/i.test(tail) ? 'Stable account, sold without warranty — no replacement or refund if access is blocked.' : 'Covered by a 30-day activation warranty — free re-activation or replacement if access fails.';
    return '<tr><td class="p-name">' + escapeHtml(tail) + '</td><td class="p-price">' + escapeHtml(formatMoney(v.price)) + ' / month</td><td>' + escapeHtml(note) + '</td></tr>';
  }).join('\n        ');

  const chatgptGuide = {
    path: GUIDE_PATHS.chatgptGuide,
    crumb: 'Cheapest ChatGPT Plus in Nepal',
    title: 'Cheapest ChatGPT Plus in Nepal (2026) — From ' + (chatgpt ? formatMoney(chatgpt.minPrice) : 'NPR 650') + ' | Digi Nepal',
    metaDesc: 'The cheapest ChatGPT Plus in Nepal is at Digi Nepal — from ' + (chatgpt ? formatMoney(chatgpt.minPrice) : 'NPR 650') + ' for 1 month, payable with eSewa or Khalti. With-warranty and without-warranty plans explained honestly: prices, what you get, and which one to buy.',
    h1: 'Cheapest ChatGPT Plus in Nepal: Prices & Which Plan to Buy',
    quickAnswer: 'The cheapest ChatGPT Plus in Nepal is at Digi Nepal (Pokhara) — from ' + (chatgpt ? formatMoney(chatgpt.minPrice) : 'NPR 650') + ' for 1 month, paid with eSewa, Khalti or bank QR, activated the same day on your own email. The official OpenAI price is $20 a month (about NPR 3,000 before conversion fees and VAT) and needs a dollar card.',
    bodyHtml: `
      <h2>ChatGPT Plus prices in Nepal at Digi Nepal</h2>
      <table class="prices">
        <thead><tr><th>Plan</th><th>Price</th><th>What it means</th></tr></thead>
        <tbody>
        ${cgRows}
        </tbody>
      </table>
      <p class="pp-desc">Both plans give you the same ChatGPT Plus: GPT-4o access, DALL·E 3 image generation, advanced data analysis and custom GPTs, activated on your own account. The difference is only the safety net.</p>
      <h2>Which plan should you buy?</h2>
      <p class="pp-desc"><strong>Choose Without Warranty</strong> if you want the lowest possible price and mainly use ChatGPT for everyday questions, study or content help. The account is stable, but if access is ever blocked there is no replacement or refund. <strong>Choose With Warranty</strong> if ChatGPT is part of your daily work — for 30 days, any activation problem is fixed by free re-activation or replacement.</p>
      <h2>Why is it cheaper than the official $20 price?</h2>
      <p class="pp-desc">The official route bills $20 a month in US dollars — roughly NPR 3,000 at the bank rate, more with conversion fees and 13% VAT — and it needs an international dollar card, which Nepal Rastra Bank caps at about $500 a year. Digi Nepal supplies Plus at local NPR prices with local payment, so the saving passes to you.</p>
      <h2>How buying works</h2>
      <p class="pp-desc">Pick your plan on the ChatGPT Plus page, sign in, start the order and pay with eSewa, Khalti, IME Pay or Bank QR. After the payment is approved, activation details are delivered to your email the same day — usually within minutes.</p>`,
    faqs: [
      { q: 'What is the cheapest ChatGPT Plus price in Nepal?', a: 'At Digi Nepal, ChatGPT Plus starts at ' + (chatgpt ? formatMoney(chatgpt.minPrice) : 'NPR 650') + ' for 1 month (Without Warranty). The With Warranty plan costs ' + (cgVariants.length > 1 ? formatMoney(cgVariants[cgVariants.length - 1].price) : 'NPR 1,399') + ' for 1 month.' },
      { q: 'Is ChatGPT Plus activated on my own email?', a: 'Yes. Both Digi Nepal plans are activated on your own account, so your chats, history and custom GPTs stay yours.' },
      { q: 'Can I pay for ChatGPT Plus with eSewa or Khalti?', a: 'Yes — eSewa, Khalti, IME Pay and Bank QR are all accepted at Digi Nepal. No dollar card is needed.' },
      { q: 'What does the ChatGPT Plus warranty cover?', a: 'The With Warranty plan includes a 30-day activation warranty: if access fails or is blocked in that period, Digi Nepal re-activates or replaces it free. The Without Warranty plan is a stable account sold without replacement or refund.' }
    ],
    ctaHref: '/product/chatgpt-plus/',
    ctaLabel: 'Buy ChatGPT Plus →'
  };

  return [payGuide, chatgptGuide];
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function generateSeo(outputDir) {
  const products = await fetchCatalogue();
  if (!products.length) throw new Error('SEO build: catalogue API returned no products — refusing to generate empty product pages.');
  const settings = await fetchSettings();

  const groups = groupProducts(products);
  if (!groups.length) throw new Error('SEO build: catalogue produced no product families.');
  const taken = new Set();
  for (const g of groups) g.slug = slugify(g.name, taken);
  // Deterministic order: by category, then name — used for pages, sitemap,
  // llms.txt and the homepage link list alike.
  groups.sort((a, b) => String(a.category_name || '').localeCompare(String(b.category_name || '')) || a.name.localeCompare(b.name));

  const buildDate = new Date().toISOString().slice(0, 10);

  for (const g of groups) {
    const siblings = groups.filter(s => s !== g && s.category_name && s.category_name === g.category_name);
    const dir = path.join(outputDir, 'product', g.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildProductPage(g, siblings, settings));
  }

  const hubDir = path.join(outputDir, 'cheapest-subscriptions-in-nepal');
  fs.mkdirSync(hubDir, { recursive: true });
  fs.writeFileSync(path.join(hubDir, 'index.html'), buildHubPage(groups, settings, buildDate));

  for (const guide of buildGuides(groups, settings)) {
    const guideDir = path.join(outputDir, guide.path.replace(/^\/+|\/+$/g, ''));
    fs.mkdirSync(guideDir, { recursive: true });
    fs.writeFileSync(path.join(guideDir, 'index.html'), buildGuidePage(guide, settings));
  }

  fs.writeFileSync(path.join(outputDir, 'sitemap.xml'), buildSitemap(groups, buildDate));
  fs.writeFileSync(path.join(outputDir, 'robots.txt'), ROBOTS_TXT);
  fs.writeFileSync(path.join(outputDir, 'llms.txt'), buildLlms(groups, settings));

  // Homepage footer catalogue links: the served index.html must carry real
  // links to every product page. build.js copies index.html into dist
  // before this runs; the marker is part of the source page.
  const indexPath = path.join(outputDir, 'index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');
  const marker = '<!-- SEO_CATALOG_LINKS -->';
  if (!indexHtml.includes(marker)) throw new Error('SEO build: ' + marker + ' marker missing from dist/index.html — cannot inject the product link list.');
  const links = '<a href="/cheapest-subscriptions-in-nepal/">Cheapest Subscriptions in Nepal — full price list</a>' +
    '<a href="/how-to-pay-for-subscriptions-in-nepal-without-a-dollar-card/">How to pay without a dollar card</a>' +
    '<a href="/cheapest-chatgpt-plus-in-nepal/">Cheapest ChatGPT Plus in Nepal</a>' +
    groups.map(g => '<a href="/product/' + g.slug + '/">' + escapeHtml(g.name) + ' — from ' + escapeHtml(formatMoney(g.minPrice)) + '</a>').join('');
  fs.writeFileSync(indexPath, indexHtml.replace(marker, links));

  console.log('SEO build: generated ' + groups.length + ' product pages, sitemap.xml, robots.txt, llms.txt and the homepage product links.');
  return groups;
}

module.exports = { generateSeo };

// rebuild 2026-11-19: ElevenLabs Starter added; ChatGPT Plus split into With Warranty Rs 1,399 / Without Warranty Rs 650
// rebuild 2026-11-19b: Netflix 1 Month sale price Rs 299 (Super Sale)
// rebuild 2026-11-19c: Spotify Premium plans 1M Rs 300 / 6M Rs 1600 / 1Y Rs 2900 added
// rebuild 2026-11-19d: static Spotify page to sq5 tile (records repointed)

// rebuild 2026-11-19e: YouTube Premium product page (Rs 99) + refresh all static pages
// rebuild 2026-11-19f: SEO round 3 — entity unified to Digi Nepal (+Pokhara schema), citable quick-answer on product pages, hub prices-checked date + guide links, 2 new guides (pay without dollar card, cheapest ChatGPT Plus), domain renewal FAQ, llms.txt refresh
// rebuild 2026-11-19g: default share image (og-image.png) on hub + guide pages

// rebuild 2026-11-20a: Super Duolingo product page (Rs 350, 12 Months) + sq5 tile pickup
// rebuild 2026-11-20b: Spotify Premium (Pre-activated) 3 Months Rs 399 plan + v2 tile strip
