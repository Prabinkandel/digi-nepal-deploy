if (['localhost','127.0.0.1'].includes(window.location.hostname) && ['5500', '5501'].includes(window.location.port)) {
  window.location.replace('http://localhost:3001' + window.location.pathname + window.location.search + window.location.hash);
}
const API = '/api';
const WHATSAPP_ICON_SVG = '<svg class="whatsapp-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>';
const GOOGLE_ICON_SVG = '<svg class="google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>';
const state = { user: null, csrf: localStorage.getItem('dn_csrf') || '', category: '', categoryName: '', sort: 'newest', search: '', page: 1, total: 0, catalog: [], allCatalog: [], categories: [], campaign: null, campaignItems: [], searchTimer: null, catalogSearchTimer: null, searchController: null, catalogController: null, providers: { google: false }, pendingAction: null };
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));
const formatMoney = amount => new Intl.NumberFormat('en-NP',{style:'currency',currency:'NPR',maximumFractionDigits:0}).format(Number(amount || 0));

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function fetchCsrfToken() {
  try {
    const res = await fetch(API + '/auth/csrf', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data.csrf) {
        state.csrf = data.csrf;
        localStorage.setItem('dn_csrf', state.csrf);
        return data.csrf;
      }
    }
  } catch { void 0; }
  return '';
}

function getErrorMessage(data, fallback = 'Something went wrong. Please try again.') {
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

async function api(path, options = {}) {
  const headers = { Accept:'application/json', ...(options.headers || {}) };
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  
  if (!state.csrf) {
    await fetchCsrfToken();
  }
  if (state.csrf) headers['x-csrf-token'] = state.csrf;
  
  const response = await fetch(API + path, { credentials:'same-origin', ...options, headers });
  const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : {};
  
  if (!response.ok) {
    const errMsg = getErrorMessage(payload);
    if (response.status === 403 && errMsg.toLowerCase().includes('csrf')) {
      const newToken = await fetchCsrfToken();
      if (newToken) {
        headers['x-csrf-token'] = newToken;
        const retryRes = await fetch(API + path, { credentials:'same-origin', ...options, headers });
        const retryPayload = retryRes.headers.get('content-type')?.includes('application/json') ? await retryRes.json() : {};
        if (!retryRes.ok) throw new Error(getErrorMessage(retryPayload));
        return retryPayload;
      }
    }
    throw new Error(errMsg);
  }
  return payload;
}

function showDialog(id) { const dialog = $(id); if (dialog && !dialog.open) dialog.showModal(); }
function closeDialog(id) { const dialog = $(id); if (dialog && dialog.open) dialog.close(); }
function toast(message, type = '') { const item = document.createElement('div'); item.className = 'toast ' + type; item.textContent = message; $('toast-region').append(item); setTimeout(() => item.remove(), 4500); }

function productSkeletons(count = 8) { return Array.from({length:count}, () => '<article class="product-card skeleton"><div></div></article>').join(''); }
function setProductLoading() { $('product-grid').innerHTML = productSkeletons(); $('catalog-empty').hidden = true; $('pagination').replaceChildren(); if ($('catalog-status')) $('catalog-status').innerHTML = '<span>Loading subscriptions…</span>'; }

/* Pricing helpers: all values come from the live catalogue, never invented. */
function savingsOf(product) {
  const price = Number(product.price || 0);
  const was = Number(product.original_price || 0);
  if (!was || was <= price) return null;
  return { amount: was - price, percent: Math.round(((was - price) / was) * 100) };
}

/* Returns the validity period for a product — uses the dedicated duration field
   first, then falls back to parsing the product name/description. */
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

function getBrandEmblem(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('free fire') || n.includes('diamond')) {
    return '<span class="brand-badge brand-freefire" style="background:linear-gradient(135deg,#1f0a0c,#3b0d11)" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#140608"/><path d="M20 7L28 14L20 33L12 14L20 7Z" fill="#ff4b2b" stroke="#ffa200" stroke-width="1.5"/><path d="M20 7L24 14L20 22L16 14L20 7Z" fill="#ffe600"/><polygon points="20,11 25,14 20,24 15,14" fill="#fff" opacity=".35"/></svg></span>';
  }
  if (n.includes('pubg')) {
    return '<span class="brand-badge brand-pubg" style="background:#1a1505" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#181308"/><path d="M12 14h16v12H12z" fill="#f59e0b"/><circle cx="20" cy="20" r="4" fill="#000"/></svg></span>';
  }
  if (n.includes('steam')) {
    return '<span class="brand-badge brand-steam" style="background:#0a1728" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#0a1728"/><circle cx="20" cy="20" r="11" stroke="#38bdf8" stroke-width="2"/><circle cx="16" cy="18" r="3.5" fill="#38bdf8"/></svg></span>';
  }
  if (n.includes('netflix')) {
    return '<span class="brand-badge brand-netflix" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#080808"/><path d="M13 10V30M27 10V30" stroke="#B81D24" stroke-width="4" stroke-linecap="round"/><path d="M13 10L27 30" stroke="#E50914" stroke-width="4.2" stroke-linecap="round"/></svg></span>';
  }
  if (n.includes('chatgpt') || n.includes('openai') || n.includes('gpt')) {
    return '<span class="brand-badge brand-chatgpt" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#0c1d18"/><circle cx="20" cy="20" r="16" fill="#10A37F" opacity=".18"/><path d="M20 12C18.2 12 16.8 13 16.2 14.4L14.5 17.5C13.6 17.5 12.3 18.4 12.3 20.2C12.3 21.6 13.2 23 14.5 23.4L16.2 26.6C16.8 28 18.2 29 20 29C21.4 29 22.8 28 23.3 27L25.6 23.7C27 23.2 27.9 21.8 27.9 20C27.9 18.2 27 16.8 25.6 16.3L23.8 13C23.2 12.1 21.8 12 20 12Z" stroke="#10A37F" stroke-width="2.2" stroke-linejoin="round"/><circle cx="20" cy="20" r="3.2" fill="#10A37F"/></svg></span>';
  }
  if (n.includes('claude') || n.includes('anthropic')) {
    return '<span class="brand-badge" style="background:#1a1008" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#1a1008"/><path d="M20 10L28 28H12L20 10Z" fill="#c96a2e" opacity=".9"/><path d="M20 14L26 28H14L20 14Z" fill="#e8843c"/><path d="M20 18L24 28H16L20 18Z" fill="#f5a05a"/><path d="M20 22L22.5 28H17.5L20 22Z" fill="#ffc28a"/></svg></span>';
  }
  if (n.includes('github') || n.includes('copilot')) {
    return '<span class="brand-badge" style="background:#0d1117" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#0d1117"/><path d="M20 9C14 9 9 14.1 9 20.3C9 25.3 12.2 29.5 16.7 31C17.3 31.1 17.5 30.7 17.5 30.4V28.4C14.2 29.1 13.5 26.9 13.5 26.9C13 25.6 12.2 25.2 12.2 25.2C11 24.4 12.3 24.4 12.3 24.4C13.6 24.5 14.2 25.8 14.2 25.8C15.4 27.8 17.3 27.2 18 26.9C18.1 26.1 18.4 25.5 18.8 25.2C15.9 24.9 12.8 23.8 12.8 18.9C12.8 17.5 13.3 16.4 14.2 15.5C14.1 15.2 13.7 13.9 14.3 12.2C14.3 12.2 15.4 11.9 17.6 13.5C18.5 13.3 19.3 13.2 20 13.2C20.7 13.2 21.5 13.3 22.4 13.5C24.6 11.9 25.7 12.2 25.7 12.2C26.3 13.9 25.9 15.2 25.8 15.5C26.7 16.4 27.2 17.5 27.2 18.9C27.2 23.8 24.1 24.9 21.2 25.2C21.7 25.6 22.1 26.4 22.1 27.6V30.4C22.1 30.7 22.3 31.1 22.9 31C27.4 29.5 30.5 25.3 30.5 20.3C31 14.1 26 9 20 9Z" fill="#f0f6fc"/></svg></span>';
  }
  if (n.includes('midjourney')) {
    return '<span class="brand-badge" style="background:#000" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#000"/><path d="M20 8C20 8 11 18 11 24C11 28.4 15.1 32 20 32C24.9 32 29 28.4 29 24C29 18 20 8 20 8Z" fill="white"/><ellipse cx="20" cy="24" rx="5" ry="4" fill="#000"/></svg></span>';
  }
  if (n.includes('canva')) {
    return '<span class="brand-badge brand-canva" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><defs><linearGradient id="canva-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#00C4CC"/><stop offset="1" stop-color="#7D2AE8"/></linearGradient></defs><rect width="40" height="40" rx="9" fill="url(#canva-grad)"/><path d="M27 15C25.5 13 23 12 20 12C14.5 12 11 16 11 21C11 26 14.5 29 20 29C23.5 29 26 27.5 27.5 25.5" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round"/></svg></span>';
  }
  if (n.includes('adobe')) {
    return '<span class="brand-badge brand-adobe" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#FA0F00"/><polygon points="12,11 17,29 12,29" fill="#FFF"/><polygon points="28,11 23,29 28,29" fill="#FFF"/><polygon points="20,20 22.8,29 17.2,29" fill="#FFF"/></svg></span>';
  }
  if (n.includes('figma')) {
    return '<span class="brand-badge" style="background:#1e1e1e" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#1e1e1e"/><ellipse cx="16" cy="14" rx="4" ry="4" fill="#F24E1E"/><ellipse cx="24" cy="14" rx="4" ry="4" fill="#FF7262"/><ellipse cx="16" cy="22" rx="4" ry="4" fill="#A259FF"/><ellipse cx="16" cy="30" rx="4" ry="4" fill="#1ABCFE"/><circle cx="24" cy="22" r="4" fill="#0ACF83"/></svg></span>';
  }
  if (n.includes('microsoft') || n.includes('office') || n.includes('365')) {
    return '<span class="brand-badge brand-microsoft" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#18181b"/><rect x="11" y="11" width="8" height="8" rx="1.2" fill="#F25022"/><rect x="21" y="11" width="8" height="8" rx="1.2" fill="#7FBA00"/><rect x="11" y="21" width="8" height="8" rx="1.2" fill="#00A4EF"/><rect x="21" y="21" width="8" height="8" rx="1.2" fill="#FFB900"/></svg></span>';
  }
  if (n.includes('google')) {
    return '<span class="brand-badge" style="background:#fff" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#fff"/><path d="M30 20.2C30 19.5 29.9 18.8 29.8 18.2H20V22H25.6C25.3 23.4 24.5 24.5 23.4 25.3V27.6H26.8C28.8 25.8 30 23.2 30 20.2Z" fill="#4285F4"/><path d="M20 30C22.7 30 25 29.1 26.8 27.6L23.4 25.3C22.5 25.9 21.4 26.3 20 26.3C17.4 26.3 15.2 24.5 14.4 22H10.9V24.4C12.7 27.9 16.1 30 20 30Z" fill="#34A853"/><path d="M14.4 22C14.2 21.4 14.1 20.7 14.1 20C14.1 19.3 14.2 18.6 14.4 18V15.6H10.9C10.3 16.8 10 18.4 10 20C10 21.6 10.3 23.2 10.9 24.4L14.4 22Z" fill="#FBBC04"/><path d="M20 13.7C21.5 13.7 22.9 14.2 24 15.3L26.9 12.4C25 10.6 22.7 9.5 20 9.5C16.1 9.5 12.7 11.6 10.9 15.1L14.4 17.5C15.2 15 17.4 13.7 20 13.7Z" fill="#EA4335"/></svg></span>';
  }
  if (n.includes('notion')) {
    return '<span class="brand-badge" style="background:#fff" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#fff"/><path d="M14 11H26C27.1 11 28 11.9 28 13V29C28 30.1 27.1 31 26 31H14C12.9 31 12 30.1 12 29V13C12 11.9 12.9 11 14 11Z" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/><path d="M16 15H24M16 19H21M16 23H22" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/></svg></span>';
  }
  if (n.includes('disney') || n.includes('hotstar')) {
    return '<span class="brand-badge" style="background:#00348d" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#00348d"/><path d="M8 26C10 18 14 13 20 13C26 13 30 18 32 26" stroke="#29b6f6" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M14 22C15.5 19 17.5 17 20 17C22.5 17 24.5 19 26 22" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/></svg></span>';
  }
  if (n.includes('spotify')) {
    return '<span class="brand-badge brand-spotify" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#121212"/><circle cx="20" cy="20" r="13" fill="#1ED760"/><path d="M14 16C17.5 15 22.5 15.5 26 17" stroke="#121212" stroke-width="2.2" stroke-linecap="round"/><path d="M14.5 19.5C17.5 18.5 21.5 19 24.8 20.5" stroke="#121212" stroke-width="1.8" stroke-linecap="round"/><path d="M15.5 23C18 22.2 21 22.6 23.5 23.8" stroke="#121212" stroke-width="1.6" stroke-linecap="round"/></svg></span>';
  }
  if (n.includes('youtube')) {
    return '<span class="brand-badge brand-youtube" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#171717"/><rect x="9" y="13" width="22" height="14" rx="4" fill="#FF0000"/><polygon points="18,16.5 24,20 18,23.5" fill="#FFF"/></svg></span>';
  }
  if (n.includes('expressvpn')) {
    return '<span class="brand-badge" style="background:#1c0b0d" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#1c0b0d"/><circle cx="20" cy="19" r="10" fill="#DA3940"/><path d="M15 14H25L20 25L15 14Z" fill="#FFF"/><path d="M17.5 14H22.5L20 20L17.5 14Z" fill="#DA3940"/></svg></span>';
  }
  if (n.includes('nordvpn') || n.includes('nord')) {
    return '<span class="brand-badge" style="background:#003087" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#003087"/><path d="M10 28L20 12L30 28H22L20 24L18 28H10Z" fill="#4FC3F7"/><path d="M16 28L20 18L24 28H16Z" fill="#fff"/></svg></span>';
  }
  if (n.includes('surfshark')) {
    return '<span class="brand-badge" style="background:#1a3c5e" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#1a3c5e"/><path d="M20 10C20 10 11 17 11 23C11 27.4 15.1 31 20 31C24.9 31 29 27.4 29 23C29 17 20 10 20 10Z" fill="#29b6f6"/><path d="M20 15C20 15 14 20 14 23.5C14 26 16.7 28 20 28C23.3 28 26 26 26 23.5C26 20 20 15 20 15Z" fill="#fff"/></svg></span>';
  }
  if (n.includes('vpn')) {
    return '<span class="brand-badge brand-vpn" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#1c0b0d"/><circle cx="20" cy="20" r="14" fill="#DA3940"/><path d="M13 14H27L20 27L13 14Z" fill="#FFF"/><path d="M16 14H24L20 21L16 14Z" fill="#DA3940"/></svg></span>';
  }
  if (n.includes('duolingo')) {
    return '<span class="brand-badge" style="background:#1cb0f6" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#1cb0f6"/><ellipse cx="20" cy="22" rx="10" ry="10" fill="#58CC02"/><ellipse cx="20" cy="22" rx="7" ry="7" fill="#89E219"/><circle cx="16.5" cy="19.5" r="2.2" fill="#fff"/><circle cx="23.5" cy="19.5" r="2.2" fill="#fff"/><circle cx="16.5" cy="19.5" r="1" fill="#1a1a1a"/><circle cx="23.5" cy="19.5" r="1" fill="#1a1a1a"/><path d="M16 24 Q20 27 24 24" stroke="#fff" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg></span>';
  }
  if (n.includes('coursera')) {
    return '<span class="brand-badge" style="background:#0056d2" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#0056d2"/><circle cx="20" cy="20" r="10" fill="#0056d2" stroke="#fff" stroke-width="2"/><path d="M16 20C16 17.8 17.8 16 20 16C21.5 16 22.8 16.8 23.5 18" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M23.5 22C22.8 23.2 21.5 24 20 24C17.8 24 16 22.2 16 20" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg></span>';
  }
  if (n.includes('linkedin')) {
    return '<span class="brand-badge" style="background:#0077b5" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#0077b5"/><rect x="11" y="16" width="4" height="13" rx="1" fill="#fff"/><circle cx="13" cy="12" r="2.5" fill="#fff"/><rect x="19" y="16" width="4" height="13" rx="1" fill="#fff"/><path d="M23 20C23 18 24.5 16.5 26.5 16.5C28.5 16.5 29 18 29 20V29H25V20.5C25 19.5 24.5 19 23.5 19" fill="#fff"/></svg></span>';
  }
  if (n.includes('prime') || n.includes('amazon')) {
    return '<span class="brand-badge brand-prime" aria-hidden="true"><svg viewBox="0 0 40 40" width="48" height="48" fill="none"><rect width="40" height="40" rx="9" fill="#00A8E1"/><path d="M11 20H15M25 20H29" stroke="#FFF" stroke-width="2.5" stroke-linecap="round"/><path d="M13 24C16 27 24 27 27 24" stroke="#FFF" stroke-width="2.5" stroke-linecap="round"/></svg></span>';
  }
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return '<span class="product-monogram brand-monogram" aria-hidden="true">' + escapeHtml(initials || '?') + '</span>';
}
/* ═══════════════════════════════════════════════════════════════════════════
   AUTO-THEMING ENGINE — Zero-Config Dynamic Brand Colors
   3-Tier Fallback: Brand Hex → Category Palette → Digi Nepal Default
   ═══════════════════════════════════════════════════════════════════════════ */
function hexToHSL(hex) {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substr(0,2),16)/255, g = parseInt(hex.substr(2,2),16)/255, b = parseInt(hex.substr(4,2),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h = 0, s = 0, l = (max+min)/2;
  if (max !== min) {
    const d = max-min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    if (max === r) h = ((g-b)/d+(g<b?6:0))/6;
    else if (max === g) h = ((b-r)/d+2)/6;
    else h = ((r-g)/d+4)/6;
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

/* Tier 1: Explicit brand colors [primary, secondary] */
const BRAND_COLORS = {
  netflix:['#E50914','#FF6B6B'], spotify:['#1DB954','#1ED760'], youtube:['#FF0000','#FF4444'],
  chatgpt:['#10A37F','#1ED4A8'], openai:['#10A37F','#1ED4A8'], gpt:['#10A37F','#1ED4A8'],
  claude:['#E8843C','#F5A05A'], anthropic:['#E8843C','#F5A05A'],
  canva:['#00C4CC','#7D2AE8'], figma:['#A259FF','#0ACF83'], adobe:['#FA0F00','#FF6B6B'],
  microsoft:['#00A4EF','#FFB900'], office:['#00A4EF','#FFB900'], '365':['#00A4EF','#FFB900'],
  google:['#4285F4','#34A853'], github:['#8B949E','#F0F6FC'], copilot:['#8B949E','#F0F6FC'],
  duolingo:['#58CC02','#1CB0F6'], coursera:['#0056D2','#38BDF8'],
  linkedin:['#0077B5','#00A0DC'], notion:['#787774','#F7F6F3'],
  disney:['#113CCF','#29B6F6'], hotstar:['#113CCF','#29B6F6'],
  expressvpn:['#DA3940','#F87171'], nordvpn:['#4687FF','#6366F1'], nord:['#4687FF','#6366F1'],
  surfshark:['#29B6F6','#14B8A6'], vpn:['#14B8A6','#6366F1'],
  prime:['#00A8E1','#1ED760'], amazon:['#FF9900','#FFD700'],
  midjourney:['#B8C4D4','#FFFFFF'], apple:['#A2AAAD','#FFFFFF'],
  grammarly:['#15C39A','#0BA770'], zoom:['#2D8CFF','#0B5CFF'],
  dropbox:['#0061FF','#60A5FA'], slack:['#4A154B','#E01E5A'],
  twitch:['#9146FF','#BF94FF'], telegram:['#0088CC','#34AADC'],
  whatsapp:['#25D366','#128C7E']
};

/* Tier 2: Category-based palettes */
const CATEGORY_PALETTES = {
  'ai tools':['#8B5CF6','#06B6D4'], 'ai':['#8B5CF6','#06B6D4'],
  'entertainment':['#E11D48','#FB7185'], 'streaming':['#E11D48','#FB7185'],
  'design & media':['#D946EF','#F59E0B'], 'design':['#D946EF','#F59E0B'], 'media':['#D946EF','#F59E0B'],
  'cloud & office':['#2563EB','#38BDF8'], 'cloud':['#2563EB','#38BDF8'], 'productivity':['#2563EB','#38BDF8'],
  'education':['#10B981','#84CC16'], 'learning':['#10B981','#84CC16'],
  'security & vpn':['#14B8A6','#6366F1'], 'security':['#14B8A6','#6366F1'],
  'gaming':['#EF4444','#F97316'], 'games':['#EF4444','#F97316'], 'game':['#EF4444','#F97316']
};

/* Tier 3: Digi Nepal default crimson-coral */
const DEFAULT_THEME = { primary: hexToHSL('#EF4444'), secondary: hexToHSL('#F97316') };

function getBrandTheme(name, category, explicitHex) {
  // Tier 1: Explicit Brand Hex Prop
  if (explicitHex && typeof explicitHex === 'string' && /^#[0-9a-f]{3,8}$/i.test(explicitHex.trim())) {
    const primary = hexToHSL(explicitHex.trim());
    const secondary = [(primary[0] + 25) % 360, Math.min(100, primary[1] + 5), Math.min(85, primary[2] + 10)];
    return { primary, secondary };
  }
  const n = (name || '').toLowerCase();
  // Tier 1b: Exact brand registry match
  for (const [brand, colors] of Object.entries(BRAND_COLORS)) {
    if (n.includes(brand)) return { primary: hexToHSL(colors[0]), secondary: hexToHSL(colors[1]) };
  }
  // Tier 2: Category palette
  const cat = (category || '').toLowerCase();
  for (const [key, colors] of Object.entries(CATEGORY_PALETTES)) {
    if (cat.includes(key)) return { primary: hexToHSL(colors[0]), secondary: hexToHSL(colors[1]) };
  }
  // Tier 3: Default Digi Nepal Crimson-Coral
  return DEFAULT_THEME;
}

function themeVarsString(theme) {
  return '--bh:' + theme.primary[0] + ';--bs:' + theme.primary[1] + '%;--bl:' + theme.primary[2] +
    '%;--bh2:' + theme.secondary[0] + ';--bs2:' + theme.secondary[1] + '%;--bl2:' + theme.secondary[2] + '%';
}

function productVisual(product, compact = false) {
  const brandVisual = getBrandEmblem(product.name);
  const cls = 'product-image' + (compact ? ' compact-product-image' : '');
  if (!product.image_url) {
    return '<div class="' + cls + '"><div class="banner-logo-wrap">' + brandVisual + '</div></div>';
  }
  const img = '<img src="' + escapeHtml(product.image_url) + '" alt="' + escapeHtml(product.name || '') + '" loading="lazy" decoding="async" onload="this.classList.add(\'loaded\')" onerror="this.style.display=\'none\';if(this.nextElementSibling)this.nextElementSibling.style.display=\'flex\';">';
  const fallback = '<div style="display:none" class="brand-fallback-wrap">' + brandVisual + '</div>';
  return '<div class="' + cls + '">' + img + fallback + '</div>';
}

/* ── Reusable festive sale & status badge ─────────────────────────────────
   Supports: hot | popular | sale | bestseller | new | dashain | tihar | newyear | flash | plain
   Usage: saleBadge('POPULAR') or saleBadge({ type: 'hot', label: 'HOT' })
   ─────────────────────────────────────────────────────────────────────── */
function saleBadge(labelOrObj) {
  if (!labelOrObj) return '';

  let label, type;
  if (typeof labelOrObj === 'string') {
    label = labelOrObj;
    const lo = label.toLowerCase();
    if (lo.includes('dashain'))                                    type = 'dashain';
    else if (lo.includes('tihar'))                                 type = 'tihar';
    else if (lo.includes('new year') || lo.includes('newyear'))    type = 'newyear';
    else if (lo.includes('hot'))                                   type = 'hot';
    else if (lo.includes('popular'))                               type = 'popular';
    else if (lo.includes('bestseller') || lo.includes('best seller')) type = 'bestseller';
    else if (lo.includes('new'))                                   type = 'new';
    else if (lo.includes('sale') || lo.includes('flash'))          type = 'sale';
    else                                                           type = 'plain';
  } else {
    label = labelOrObj.label || '';
    type  = labelOrObj.type  || 'plain';
  }

  const icons = {
    dashain: '<svg class="sb-icon" viewBox="0 0 18 18" width="14" height="14" fill="none" aria-hidden="true"><path d="M6.5 14 C5.5 10, 4 6, 2.5 2.5" stroke="#7ac95b" stroke-width="1.3" stroke-linecap="round"/><path d="M8 14 C7.5 9, 6.2 4.8, 5.8 1.5" stroke="#9de878" stroke-width="1.4" stroke-linecap="round"/><path d="M9 14 C9.5 9, 10.8 4.8, 11.2 1.5" stroke="#7ac95b" stroke-width="1.4" stroke-linecap="round"/><circle cx="8.7" cy="12.8" r="2.1" fill="#e02232"/></svg>',
    tihar: '<svg class="sb-icon" viewBox="0 0 18 18" width="14" height="14" fill="none" aria-hidden="true"><ellipse cx="9" cy="14.5" rx="3.5" ry="1.5" fill="#c0841b" opacity=".6"/><path d="M9 12.5 Q7 8.5 9 4.5 Q11 8.5 9 12.5Z" fill="#f5a623"/><circle cx="9" cy="14.5" r="1.2" fill="#d4950a"/></svg>',
    newyear: '<svg class="sb-icon" viewBox="0 0 18 18" width="14" height="14" fill="none" aria-hidden="true"><path d="M9 2 L9 16 M2 9 L16 9" stroke="#f5be3c" stroke-width="1.3" stroke-linecap="round"/><circle cx="9" cy="9" r="2" fill="#f5be3c"/></svg>',
    hot: '<svg class="sb-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.38 0 2.5-1.12 2.5-2.5 0-.74-.28-1.42-.74-1.92L12 11.5l-.76 1.08c-.46.5-.74 1.18-.74 1.92Z"/><path d="M12 2c1 3 4 5 4 9a6 6 0 0 1-12 0c0-4 3-6 4-9 1 2 2 3 4 0Z"/></svg>',
    popular: '<svg class="sb-icon" viewBox="0 0 24 24" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    sale: '<svg class="sb-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 1.5 L4.5 10 L9 10 L6.5 16.5 L12.5 8 L8 8 Z" fill="currentColor"/></svg>',
    bestseller: '<svg class="sb-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>',
    new: '<svg class="sb-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    flash: '<svg class="sb-icon" viewBox="0 0 18 18" width="12" height="12" fill="none" aria-hidden="true"><path d="M10.5 1.5 L4.5 10 L9 10 L6.5 16.5 L12.5 8 L8 8 Z" fill="#f5be3c"/></svg>',
    campaign: '<svg class="sb-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 1.5 L4.5 10 L9 10 L6.5 16.5 L12.5 8 L8 8 Z" fill="currentColor"/></svg>',
    plain: ''
  };

  /* ── Special: campaign label with admin-configured banner image ── */
  if (type === 'campaign' && labelOrObj && labelOrObj.banner) {
    return '<span class="store-badge store-badge-campaign sb-campaign sb-campaign-banner" data-campaign="campaign">' +
      '<img src="' + escapeHtml(labelOrObj.banner) + '" alt="On sale" class="campaign-banner-img" loading="lazy">' +
    '</span>';
  }

  /* ── Special: Dashain festive graphic emblem ── */
  if (type === 'dashain') {
    return '<span class="store-badge-festive sb-dashain-emblem" data-campaign="dashain" title="' + escapeHtml(label || 'Dashain Sale') + '">' +
      '<img src="/dashain-sale-banner.png" alt="Dashain Sale" class="dashain-emblem-img" loading="lazy">' +
    '</span>';
  }

  const icon = icons[type] || '';
  const cls  = 'store-badge store-badge-campaign sb-' + type;
  return '<span class="' + cls + '" data-campaign="' + type + '">' + icon + '<span class="sb-label">' + escapeHtml(label) + '</span></span>';
}

/* Build a campaign status badge for a product card. When a live campaign has
   card badges enabled and its short label is not already the product's offer
   label, this renders the campaign's label (with banner image when set) so
   customers can see which sale a product belongs to. */
/* Campaign target check: true when the live campaign explicitly lists this
   product (admin "Products in this sale" picker) or when it is one of the
   items returned by /api/campaigns/active (explicit picks + discount
   fallback). */
function isCampaignTarget(product) {
  if (!state.campaign) return false;
  if ((state.campaign.product_ids || []).includes(product.id)) return true;
  return (state.campaignItems || []).some(item => item.id === product.id);
}

function campaignBadge(product, saving) {
  const campaign = state.campaign;
  if (!campaign || !campaign.show_sale_badge_on_cards || !isCampaignTarget(product)) return '';
  const shortLabel = String(campaign.short_label || 'ON SALE').toUpperCase();
  if (String(product.offer_label || '').toUpperCase() === shortLabel) return '';
  if (campaign.banner_image_url) {
    return saleBadge({ type: 'campaign', label: shortLabel, banner: campaign.banner_image_url });
  }
  if (saving && campaign.badge_text && campaign.badge_text !== '-{pct}') {
    return saleBadge({ type: 'campaign', label: campaign.badge_text.replace('{pct}', String(saving.percent)) });
  }
  return saleBadge({ type: 'campaign', label: shortLabel });
}

/* Group duration variants (e.g. "ChatGPT Plus" 1 Month / 1 Year) into one
   browsable card. All values come from the live catalogue. */
function baseKey(name) { return String(name || '').trim().toLowerCase(); }

function groupProducts(products) {
  const map = new Map();
  for (const p of (products || [])) {
    const key = baseKey(p.name);
    if (!map.has(key)) map.set(key, { key, name: p.name, category_name: p.category_name, category_id: p.category_id, image_url: p.image_url, brand_color: p.brand_color || p.brandColor, variants: [] });
    const g = map.get(key);
    g.variants.push(p);
    if (!g.image_url && p.image_url) g.image_url = p.image_url;
    if (!g.brand_color && (p.brand_color || p.brandColor)) g.brand_color = p.brand_color || p.brandColor;
  }
  return [...map.values()].map(g => {
    g.variants.sort((a, b) => Number(a.price) - Number(b.price));
    g.minPrice = Math.min(...g.variants.map(v => Number(v.price || 0)));
    const withSaving = g.variants.map(v => ({ v, s: savingsOf(v) })).filter(x => x.s).sort((a, b) => b.s.percent - a.s.percent);
    g.bestSaving = withSaving.length ? withSaving[0].s : null;
    const dashainVariant = g.variants.find(v => (v.badge && v.badge.toLowerCase().includes('dashain')) || (v.offer_label && v.offer_label.toLowerCase().includes('dashain')));
    g.offer_label = dashainVariant ? (dashainVariant.badge || dashainVariant.offer_label) : ((withSaving.length && withSaving[0].v.offer_label) || g.variants.find(v => v.badge)?.badge || g.variants[0].badge || '');
    const durs = g.variants.map(v => durationOf(v)).filter(Boolean);
    g.durationLabel = durs.length > 1 ? durs[0] + ' – ' + durs[durs.length - 1] : (durs[0] || '');
    g.inStock = g.variants.some(v => v.stock === undefined || v.stock === null || Number(v.stock) > 0);
    g.rep = g.variants[0];
    g.maxPrice = withSaving.length ? withSaving[0].v.original_price || withSaving[0].v.compare_price : null;
    return g;
  });
}

/* Short, consistent pill label for a duration ("1 Month" -> "1M", "1 Year" -> "1Yr"). */
function durationPillLabel(variant) {
  const d = durationOf(variant);
  if (!d) return null;
  if (d === 'Lifetime') return 'Life';
  const m = d.match(/(\d+)\s*(Month|Year|Week|Day)/i);
  if (!m) return d;
  const n = m[1];
  const unit = m[2].charAt(0).toUpperCase() + m[2].slice(1, 2).toLowerCase();
  return n + (unit === 'Year' ? 'Yr' : unit.charAt(0));
}

/* Builds the clickable duration pill row for a multi-variant group.
   Each pill maps to one duration variant; the cheapest is selected by default. */
function durationPills(group) {
  const variants = selectedGroupVariants(group).filter(v => {
    const inStock = v.stock === undefined || v.stock === null || Number(v.stock) > 0;
    return inStock;
  });
  if (!variants.length) return '';
  const pills = variants.map(v => {
    const label = durationPillLabel(v) || v.name;
    return '<button type="button" class="dur-pill" data-pill-variant="' + escapeHtml(v.id) + '" aria-pressed="false">' +
      '<span class="dur-pill-label">' + escapeHtml(label) + '</span>' +
      '<span class="dur-pill-price">' + formatMoney(v.price) + '</span>' +
    '</button>';
  }).join('');
  return '<div class="duration-pills" role="group" aria-label="Choose a plan duration">' + pills + '</div>';
}

/* After a card is rendered, bind its duration pills: clicking one updates the
   card's displayed NPR price and marks the chosen variant so Buy Now carries it. */
function wireDurationPills(card) {
  const pills = card.querySelectorAll('.duration-pills .dur-pill');
  if (!pills.length) return;
  const priceEl = card.querySelector('[data-card-price]');
  const ctxEl = card.querySelector('.price-context');
  const buyBtn = card.querySelector('.card-buy[data-group-view]');
  const activate = (pill) => {
    pills.forEach(p => {
      const on = p === pill;
      p.classList.toggle('active', on);
      p.setAttribute('aria-pressed', String(on));
    });
    const variantId = pill.dataset.pillVariant;
    const group = state.groupByKey?.get(card.dataset.groupKey);
    const variant = group ? group.variants.find(v => v.id === variantId) : null;
    if (!variant) return;
    if (priceEl) priceEl.textContent = formatMoney(variant.price);
    if (ctxEl) ctxEl.textContent = 'SELECTED';
    if (buyBtn) buyBtn.dataset.selectedVariant = variant.id;
  };
  pills.forEach(pill => { pill.onclick = (e) => { e.stopPropagation(); activate(pill); }; });
  const defaultPill = card.querySelector('.duration-pills .dur-pill');
  if (defaultPill) { activate(defaultPill); }
}

function productCard(group) {
  const saving = group.bestSaving;
  const multi = group.variants.length > 1;
  const theme = getBrandTheme(group.name, group.category_name, group.brand_color);
  const tvars = themeVarsString(theme);

  // Dual-slot badges: Top-Left discount pill, Top-Right promotional/status badge
  const discountBadge = saving ? '<span class="store-badge store-badge-save">-' + saving.percent + '% OFF</span>' : '';
  const campaignBadgeHtml = group.variants
    .map(v => campaignBadge(v, saving))
    .find(Boolean) || '';
  const statusBadge = group.offer_label ? saleBadge(group.offer_label) : campaignBadgeHtml;
  const badgesHtml = (discountBadge || statusBadge)
    ? '<div class="card-badges">' +
        '<div class="badge-slot-left">' + discountBadge + '</div>' +
        '<div class="badge-slot-right">' + statusBadge + '</div>' +
      '</div>'
    : '';

  const visual = group.image_url
    ? productVisual({ name: group.name, image_url: group.image_url })
    : productVisual(group.rep);

  const crossedPrice = group.maxPrice ? '<s class="was-price">' + formatMoney(group.maxPrice) + '</s>' : '';

  return '<article class="product-card" data-group-key="' + escapeHtml(group.key) + '" style="' + tvars + '" tabindex="0" role="button" aria-label="View ' + escapeHtml(group.name) + ' plans">' +
    '<div class="card-glow" aria-hidden="true"></div>' +
    '<div class="card-visual">' + visual + badgesHtml + '</div>' +
    '<div class="card-body">' +
      '<p class="product-category">' + escapeHtml(group.category_name || 'DIGITAL SERVICE') + '</p>' +
      '<h3>' + escapeHtml(group.name) + '</h3>' +
      '<div class="card-meta">' +
        (group.durationLabel ? '<span class="card-meta-item"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' + escapeHtml(group.durationLabel) + '</span>' : '') +
        (multi ? '<span class="card-meta-item card-meta-plans"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' + group.variants.length + ' plans</span>' : '') +
        '<span class="card-meta-stock' + (group.inStock ? '' : ' is-out') + '">' + (group.inStock ? 'Available now' : 'Currently unavailable') + '</span>' +
      '</div>' +
      '<div class="price-row">' +
        '<div class="price-main"><small class="price-context">' + (multi ? 'FROM' : 'PRICE') + '</small><span class="price" data-card-price>' + formatMoney(group.minPrice) + '</span>' + crossedPrice + '</div>' +
      '</div>' +
      (multi ? durationPills(group) : '') +
      '<div class="product-actions">' +
        (group.name.toLowerCase().includes('free fire')
          ? '<button type="button" class="card-buy card-action" data-freefire="true" aria-label="Top up Free Fire Diamonds"><span class="card-buy-text">Top Up Now</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>'
          : (multi
              ? '<button type="button" class="card-buy card-action" data-group-view="' + escapeHtml(group.key) + '"' + (group.inStock ? '' : ' disabled') + ' aria-label="Buy ' + escapeHtml(group.name) + '"><span class="card-buy-text">Buy Now</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>'
              : '<button type="button" class="card-buy card-action" data-buy="' + escapeHtml(group.variants[0].id) + '"' + (group.inStock ? '' : ' disabled') + ' aria-label="Buy ' + escapeHtml(group.name) + '"><span class="card-buy-text">Buy Now</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>')) +
        (group.name.toLowerCase().includes('free fire')
          ? '<button type="button" class="card-view card-action" data-freefire="true">View Product</button>'
          : (multi
              ? '<button type="button" class="card-view card-action" data-group-view="' + escapeHtml(group.key) + '">Plans</button>'
              : '<button type="button" class="card-view card-action" data-product="' + escapeHtml(group.variants[0].id) + '">Details</button>')) +
      '</div>' +
    '</div>' +
  '</article>';
}



async function loadProducts() {
  setProductLoading();
  const query = new URLSearchParams({ page:String(state.page), limit:'24', sort:state.sort });
  if (state.category) query.set('category',state.category);
  if (state.search) query.set('search',state.search);
  if (state.catalogController) state.catalogController.abort();
  state.catalogController = new AbortController();
  try {
    const result = await api('/products?' + query, { signal: state.catalogController.signal });
    const products = result.items || result;
    if (!state.category && !state.search) {
      state.allCatalog = products;
    }
    state.catalog = products;
    state.total = Number(result.total ?? products.length);
    state.groups = groupProducts(products);
    state.groupByKey = new Map(state.groups.map(g => [g.key, g]));
    $('product-grid').innerHTML = state.groups.map(productCard).join('') || '';
    $('product-grid').querySelectorAll('.product-card[data-group-key]').forEach(wireDurationPills);
    $('catalog-empty').hidden = state.groups.length > 0;
    renderCatalogStatus(products.length);
    renderDeals(state.allCatalog || products);
    renderPages(result.pages || 1);
  } catch (error) {
    if (error.name === 'AbortError') return;
    if ($('catalog-status')) $('catalog-status').replaceChildren();
    $('product-grid').innerHTML = '<div class="catalog-empty"><h3>Couldn’t load subscriptions.</h3><p>' + escapeHtml(error.message) + '</p><button class="button button-quiet" id="retry-products">Try again</button></div>';
    $('retry-products').onclick = loadProducts;
  }
}

function renderCatalogStatus(shown) {
  const status = $('catalog-status');
  if (!status) return;
  if (!shown) { status.replaceChildren(); return; }
  const parts = ['<span>Showing <b>' + shown + '</b> of <b>' + state.total + '</b> subscriptions</span>'];
  if (state.categoryName) parts.push('<button type="button" class="filter-chip" data-clear="category">' + escapeHtml(state.categoryName) + ' <span aria-hidden="true">×</span></button>');
  if (state.search) parts.push('<button type="button" class="filter-chip" data-clear="search">“' + escapeHtml(state.search) + '” <span aria-hidden="true">×</span></button>');
  status.innerHTML = parts.join('');
  status.querySelectorAll('[data-clear]').forEach(chip => {
    chip.onclick = () => {
      if (chip.dataset.clear === 'search') { state.search = ''; const field = $('catalog-search'); if (field) field.value = ''; }
      else selectCategory('');
      state.page = 1;
      loadProducts();
    };
  });
}

/* =========================================================
   FLASH SALE — auto-rotating carousel + countdown + social proof
   ========================================================= */

/* Load the live sale campaign (if any) from /api/campaigns/active. The
   server picks the live campaign with the lowest display_order; its label,
   banner, and product selection drive the flash-sale section and card
   badges. Failures are non-fatal — the section falls back to catalog
   discounts. */
async function loadCampaign() {
  try {
    const result = await api('/campaigns/active');
    state.campaign = result.campaign || null;
    state.campaignItems = Array.isArray(result.items) ? result.items : [];
  } catch {
    state.campaign = null;
    state.campaignItems = [];
  }
  applyCampaignTheme(state.campaign);
  applyCampaignSection(state.campaign);
}

/* Apply the campaign's theme to the document so CSS can key off it
   (accent colors, variant class on <body>). */
function applyCampaignTheme(campaign) {
  const body = document.body;
  if (!body) return;
  body.classList.remove('campaign-default', 'campaign-festive-red', 'campaign-gold-red', 'campaign-dark-premium', 'campaign-neon-offer');
  if (!campaign) return;
  const variant = campaign.theme_variant || 'default';
  body.classList.add('campaign-' + variant);
  const root = document.documentElement;
  if (campaign.accent_color) root.style.setProperty('--campaign-accent', campaign.accent_color);
  else root.style.removeProperty('--campaign-accent');
  if (campaign.bg_color) root.style.setProperty('--campaign-bg', campaign.bg_color);
  else root.style.removeProperty('--campaign-bg');
}

/* Update the flash-sale section header (badge text, title, subtitle, CTA)
   from the live campaign. */
function applyCampaignSection(campaign) {
  if (!campaign) return;
  const badge = document.querySelector('.flash-badge-text');
  if (badge) badge.textContent = campaign.short_label || 'ON SALE';
  const title = document.querySelector('.flash-title');
  if (title && campaign.name) title.textContent = campaign.name;
  const sub = document.querySelector('.flash-subtitle');
  if (sub && campaign.subtitle) sub.textContent = campaign.subtitle;
  const cta = document.querySelector('.flash-see-all');
  if (cta && campaign.cta_text) cta.textContent = campaign.cta_text;
}

function renderDeals(products) {
  const section = $('flash-sale');
  const carousel = $('flash-carousel');
  if (!section || !carousel) return;
  if (state.search || state.category) { section.hidden = true; return; }

  // When a live campaign is present, use its curated products instead of
  // scanning the whole catalog for discounts. The server already decorates
  // prices via offers, so savings still flow through savingsOf().
  const source = state.campaign && state.campaignItems.length ? state.campaignItems : products;
  const deals = source
    .map(p => ({ product: p, saving: savingsOf(p) }))
    .filter(e => e.saving || (state.campaign && state.campaignItems.includes(e.product)))
    .sort((a, b) => (b.saving ? b.saving.percent : 0) - (a.saving ? a.saving.percent : 0));

  if (!deals.length) { section.hidden = true; return; }
  section.hidden = false;

  // Show only the top deals — the full range lives in the catalogue below.
  const limit = state.campaign ? (state.campaign.max_products || 8) : 8;
  const top = deals.slice(0, limit);

  const sub = document.querySelector('.flash-subtitle');
  if (sub) {
    sub.textContent = state.campaign && state.campaign.subtitle
      ? state.campaign.subtitle
      : 'Top ' + top.length + ' discounts right now — same prices you pay at checkout.';
  }

  // Hide the cat bar — no longer needed
  const catBar = $('flash-cat-bar');
  if (catBar) catBar.hidden = true;

  renderFlashCards(top);
}

function renderFlashCards(deals) {
  const carousel = $('flash-carousel');
  if (!carousel) return;

  carousel.innerHTML = deals.map(({ product, saving }) => {
    const duration = durationOf(product);
    const inStock = product.stock === undefined || product.stock === null || Number(product.stock) > 0;
    const theme = getBrandTheme(product.name, product.category_name, product.brand_color || product.brandColor);
    const tvars = themeVarsString(theme);
    return '<div class="flash-deal-card fdc-rich" role="listitem" data-flash-id="' + escapeHtml(product.id) + '" style="' + tvars + '">' +
      '<div class="card-glow" aria-hidden="true"></div>' +
      '<div class="fdc-top">' +
        '<div class="fdc-thumb">' + dealThumb(product) + '</div>' +
        '<span class="fdc-save-pill">-' + saving.percent + '% OFF</span>' +
      '</div>' +
      '<div class="fdc-body">' +
        '<h3 class="fdc-name">' + escapeHtml(product.name) + '</h3>' +
        (duration ? '<p class="fdc-dur">' + escapeHtml(duration) + '</p>' : '') +
        '<div class="fdc-price-row">' +
          '<span class="fdc-price">' + formatMoney(product.price) + '</span>' +
          '<span class="fdc-was">' + formatMoney(product.original_price) + '</span>' +
        '</div>' +
        '<div class="fdc-actions">' +
          '<button class="fdc-btn-buy" type="button"' + (inStock ? '' : ' disabled') + ' aria-label="Buy ' + escapeHtml(product.name) + '"><span class="card-buy-text">Buy Now</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>' +
          '<button class="fdc-btn-detail" type="button" aria-label="Details for ' + escapeHtml(product.name) + '">Details</button>' +
        '</div>' +
        (!inStock ? '<p class="fdc-out-stock">Currently unavailable</p>' : '') +
      '</div>' +
    '</div>';
  }).join('');

  carousel.scrollTo({ left: 0, behavior: 'instant' });

  carousel.querySelectorAll('[data-flash-id]').forEach(card => {
    const id = card.dataset.flashId;
    const buyBtn = card.querySelector('.fdc-btn-buy');
    const detailBtn = card.querySelector('.fdc-btn-detail');
    if (buyBtn) buyBtn.onclick = e => { e.stopPropagation(); startOrder(id); };
    if (detailBtn) detailBtn.onclick = e => { e.stopPropagation(); openProduct(id); };
    card.onclick = () => openProduct(id);
  });

  buildFlashDots(deals.length);
  setupFlashCarousel(deals);
}

function buildFlashDots(count) {
  const dotsEl = $('flash-dots');
  if (!dotsEl) return;
  dotsEl.innerHTML = Array.from({ length: count }, (_, i) =>
    '<button class="flash-dot' + (i === 0 ? ' active' : '') + '" type="button" aria-label="Deal ' + (i+1) + '" data-dot="' + i + '"></button>'
  ).join('');
}

function updateFlashDots(idx) {
  const dots = document.querySelectorAll('.flash-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
}

function setupFlashCarousel(deals) {
  const carousel = $('flash-carousel');
  if (!carousel || !deals.length) return;

  const cardWidth = () => {
    const first = carousel.querySelector('.flash-deal-card');
    return first ? first.offsetWidth + 16 : 280;
  };

  let currentIdx = 0;

  const scrollTo = (idx) => {
    currentIdx = ((idx % deals.length) + deals.length) % deals.length;
    carousel.scrollTo({ left: currentIdx * cardWidth(), behavior: 'smooth' });
    updateFlashDots(currentIdx);
  };

  const next = () => scrollTo(currentIdx + 1);
  const prev = () => scrollTo(currentIdx - 1);

  // No autoplay: customers browse offers at their own pace.

  const prevBtn = $('flash-prev'); const nextBtn = $('flash-next');
  if (prevBtn) prevBtn.onclick = () => { prev(); };
  if (nextBtn) nextBtn.onclick = () => { next(); };

  const dotsEl = $('flash-dots');
  if (dotsEl) dotsEl.onclick = e => {
    const dot = e.target.closest('[data-dot]');
    if (dot) { scrollTo(Number(dot.dataset.dot)); }
  };

  let scrollTimer;
  carousel.onscroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const w = cardWidth();
      const idx = Math.round(carousel.scrollLeft / w);
      if (idx !== currentIdx && idx < deals.length) {
        currentIdx = idx;
        updateFlashDots(currentIdx);
      }
    }, 80);
  };
}

function dealThumb(product) {
  if (product.image_url) {
    return '<img class="deal-thumb" src="' + escapeHtml(product.image_url) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=\'none\';if(this.nextElementSibling)this.nextElementSibling.style.display=\'flex\';"><div style="display:none" class="brand-fallback-wrap">' + getBrandEmblem(product.name) + '</div>';
  }
  return getBrandEmblem(product.name);
}


function _renderDiscovery(products) { const rail=$('discovery-rail'); if(!rail) return; rail.innerHTML=products.map(product => '<button class="discovery-card" data-discovery-product="' + escapeHtml(product.id) + '">' + productVisual(product,true) + '<span><small>' + escapeHtml(product.category_name || 'DIGITAL SERVICE') + '</small><strong>' + escapeHtml(product.name) + '</strong><b>' + formatMoney(product.price) + '</b></span></button>').join(''); rail.querySelectorAll('[data-discovery-product]').forEach(button=>button.onclick=()=>openProduct(button.dataset.discoveryProduct)); }

function renderPages(pages) { const holder = $('pagination'); holder.replaceChildren(); if (pages <= 1) return; for (let number=1; number<=pages; number++) { const button = document.createElement('button'); button.className = 'page-button' + (number === state.page ? ' active':''); button.textContent = number; button.ariaLabel = 'Page ' + number; button.onclick = () => { state.page = number; loadProducts(); document.querySelector('#catalog').scrollIntoView({behavior:'smooth'}); }; holder.append(button); } }

function _getCategoryMeta(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('entertain') || n.includes('stream') || n.includes('video') || n.includes('music')) {
    return {
      accent: 'red',
      tags: 'Netflix · Spotify · Prime Video',
      svg: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="15" x="2" y="7" rx="2"/><polyline points="17 2 12 7 7 2"/><polygon points="10 11.5 15 14.5 10 17.5" fill="currentColor" stroke="none"/></svg>'
    };
  }
  if (n.includes('cloud') || n.includes('office')) {
    return {
      accent: 'blue',
      tags: 'Microsoft 365 · Google One · Drive',
      svg: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>'
    };
  }
  if (n.includes('design') || n.includes('media')) {
    return {
      accent: 'violet',
      tags: 'Canva Pro · Adobe CC · Freepik',
      svg: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12c0 3.5 2 5.5 4.5 5.5.9 0 1.5-.6 1.5-1.5 0-.5.2-.9.5-1.2.4-.4 1-.6 1.5-.6h2c5.5 0 10-4.5 10-10 0-1.2-.5-2.2-1.5-2.2z"/></svg>'
    };
  }
  if (n.includes('vpn') || n.includes('security')) {
    return {
      accent: 'amber',
      tags: 'ExpressVPN · NordVPN · Surfshark',
      svg: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>'
    };
  }
  if (/\b(ai|artificial)\b/i.test(name) || n.includes('gpt') || n.includes('intelligence')) {
    return {
      accent: 'cyan',
      tags: 'ChatGPT · Claude · Midjourney',
      svg: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c.5 3.5 2.5 5.5 6 6-3.5.5-5.5 2.5-6 6-.5-3.5-2.5-5.5-6-6 3.5-.5 5.5-2.5 6-6Z"/><path d="M19 16c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z"/></svg>'
    };
  }
  return {
    accent: 'default',
    tags: 'Curated Subscriptions',
    svg: '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none"/></svg>'
  };
}

function categoryIcon(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('ai') || n.includes('gpt')) return '✦';
  if (n.includes('design') || n.includes('media')) return '◐';
  if (n.includes('cloud') || n.includes('office')) return '▦';
  if (n.includes('entertain') || n.includes('stream') || n.includes('music') || n.includes('video')) return '▶';
  if (n.includes('vpn') || n.includes('secur')) return '⬢';
  if (n.includes('educ') || n.includes('learn') || n.includes('course')) return '✎';
  if (n.includes('product') || n.includes('soft')) return '▣';
  return '○';
}

async function loadCategories() {
  try {
    const result = await api('/categories?limit=100&sort=name');
    const categories = result.items || result;
    state.categories = categories;
    const holder = $('category-tabs');
    if (!holder) return;
    
    // Ensure "All subscriptions" button works
    const allBtn = holder.querySelector('.category[data-category=""]');
    if (allBtn) allBtn.onclick = () => selectCategory('');

    categories.forEach(category => {
      const button = document.createElement('button');
      button.className = 'category';
      button.dataset.category = category.id;
      button.dataset.categoryName = category.name;
      button.setAttribute('role', 'tab');
      button.innerHTML = '<span class="cat-ico" aria-hidden="true">' + escapeHtml(category.icon || categoryIcon(category.name)) + '</span><span>' + escapeHtml(category.name) + '</span>';
      button.onclick = () => selectCategory(category.id);
      holder.append(button);
    });
    const active = holder.querySelector('.category.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });

  } catch {
    toast('Categories are temporarily unavailable.');
  }
}

function selectCategory(category) {
  const ff = $('free-fire');
  if (ff) ff.hidden = true;
  state.category = category || '';
  state.page = 1;
  state.categoryName = '';
  document.querySelectorAll('.category').forEach(button => {
    const active = (button.dataset.category || '') === state.category;
    if (active && state.category) state.categoryName = button.dataset.categoryName || button.textContent;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.cat-explorer-card').forEach(card => {
    card.classList.toggle('active', (card.dataset.categoryId || '') === state.category);
  });
  loadProducts();
}

function detailVisual(product) {
  const brandVisual = getBrandEmblem(product.name);
  if (!product.image_url) {
    return '<div class="brand-detail-emblem">' + brandVisual + '</div>';
  }
  return '<img src="' + escapeHtml(product.image_url) + '" alt="' + escapeHtml(product.name) + '" loading="eager" decoding="async" onload="this.classList.add(\'loaded\')" onerror="this.style.display=\'none\';if(this.nextElementSibling)this.nextElementSibling.style.display=\'flex\';">' +
    '<div class="brand-detail-emblem" style="display:none">' + brandVisual + '</div>';
}

function detailRelated(product) {
  const related = state.catalog.filter(item => item.id !== product.id && item.category_id === product.category_id).slice(0, 3);
  if (!related.length) return '';
  return '<section class="pd-block"><h2>More in ' + escapeHtml(product.category_name || 'this category') + '</h2><div class="pd-related">' +
    related.map(item => '<button type="button" class="pd-related-card" data-related="' + escapeHtml(item.id) + '">' +
      '<strong>' + escapeHtml(item.name) + '</strong>' +
      '<span>' + formatMoney(item.price) + (savingsOf(item) ? '<s>' + formatMoney(item.original_price) + '</s>' : '') + '</span>' +
    '</button>').join('') + '</div></section>';
}

function detailStaticBlocks() {
  return '<section class="pd-block"><h2>How delivery works</h2><ol class="pd-delivery">' +
      '<li class="pd-step-item"><div class="pd-step-body"><b>Place your order.</b> Pick WhatsApp or online payment above.</div></li>' +
      '<li class="pd-step-item"><div class="pd-step-body"><b>Send your payment.</b> Use eSewa, Khalti, bank transfer or scan the QR, then upload the receipt.</div></li>' +
      '<li class="pd-step-item"><div class="pd-step-body"><b>We verify it.</b> Our team confirms the payment against your order reference.</div></li>' +
      '<li class="pd-step-item"><div class="pd-step-body"><b>You get your details.</b> Access details are shared once the order is approved, and the status updates in your account.</div></li>' +
    '</ol></section>' +
    '<section class="pd-block pd-faq"><h2>Common questions</h2>' +
      '<details><summary>Which payment methods can I use?</summary><p>eSewa, Khalti, bank transfer and QR payment. You will see the available options at checkout.</p></details>' +
      '<details><summary>How do I know my order went through?</summary><p>After you submit your payment receipt, the order appears under “My orders” with its current status. You get an update when it is approved.</p></details>' +
      '<details><summary>Who do I contact if something is wrong?</summary><p>Message us on WhatsApp or use the contact form. Include your order reference so we can find it quickly.</p></details>' +
    '</section>';
}

function selectedGroupVariants(group) {
  return (group?.variants || []).slice().sort((a, b) => Number(a.price) - Number(b.price));
}

function planOptionCard(variant, selected) {
  const duration = durationOf(variant);
  const saving = savingsOf(variant);
  const inStock = variant.stock === undefined || variant.stock === null || Number(variant.stock) > 0;
  return '<button type="button" class="plan-option' + (selected ? ' selected' : '') + '" data-plan="' + escapeHtml(variant.id) + '"' + (inStock ? '' : ' disabled') + ' aria-pressed="' + (selected ? 'true' : 'false') + '">' +
    '<span class="plan-duration">' + escapeHtml(duration || variant.name) + '</span>' +
    '<span class="plan-price">' + formatMoney(variant.price) + '</span>' +
    (variant.original_price && Number(variant.original_price) > Number(variant.price) ? '<span class="plan-was">' + formatMoney(variant.original_price) + '</span>' : '') +
    (saving ? '<span class="price-save">Save ' + saving.percent + '%</span>' : '') +
    (!inStock ? '<span class="plan-out">Unavailable</span>' : '') +
  '</button>';
}

function renderGroupDetail(group, preselectVariantId) {
  const variants = selectedGroupVariants(group);
  const preIndex = preselectVariantId ? variants.findIndex(v => v.id === preselectVariantId) : -1;
  const chosen = preIndex >= 0 ? variants[preIndex] : null;
  const fallback = chosen || variants.find(v => v.stock === undefined || v.stock === null || Number(v.stock) > 0) || variants[0];
  const features = (fallback.features || []).map(feature => '<li>' + escapeHtml(feature) + '</li>').join('');
  $('product-detail').innerHTML = '<div class="pd-layout">' +
    '<div class="pd-media">' +
      '<div class="product-detail-image">' + detailVisual({ name: group.name, image_url: group.image_url || fallback.image_url }) + '</div>' +
    '</div>' +
    '<div class="pd-main">' +
      '<div class="pd-head">' +
        '<p class="pd-category">' + escapeHtml((group.category_name || 'SUBSCRIPTION').toUpperCase()) + '</p>' +
        '<h1 id="product-title">' + escapeHtml(group.name) + '</h1>' +
        '<p class="pd-summary">' + escapeHtml(fallback.description || 'Choose a plan, then start your order.') + '</p>' +
      '</div>' +
      '<section class="pd-block pd-plans" aria-label="Choose a plan"><h2>Choose a plan · ' + variants.length + ' options</h2><div class="plan-grid" id="plan-grid">' +
        variants.map((v, i) => planOptionCard(v, preIndex >= 0 ? v.id === chosen.id : i === 0)).join('') +
      '</div></section>' +
      '<div class="pd-price-card">' +
        '<div class="pd-price-top">' +
          '<span class="pd-price-main"><small id="pd-plan-label">' + escapeHtml((durationOf(fallback) || 'SELECTED PLAN').toUpperCase()) + '</small><b id="pd-plan-price">' + formatMoney(fallback.price) + '</b></span>' +
        '</div>' +
        '<div class="pd-actions">' +
          '<button type="button" class="button" id="start-order" data-id="' + escapeHtml(fallback.id) + '"><span class="card-buy-text">Buy now with eSewa / Khalti / QR</span> <span aria-hidden="true">→</span></button>' +
          '<button type="button" class="button button-whatsapp" id="start-whatsapp-order" data-id="' + escapeHtml(fallback.id) + '">' + WHATSAPP_ICON_SVG + '<span>Order via WhatsApp</span></button>' +
        '</div>' +
        '<ul class="pd-reassure">' +
          '<li>Pay with eSewa, Khalti, bank transfer or QR</li>' +
          '<li>Every payment receipt is checked by our team</li>' +
          '<li>Track the status of your order from your account</li>' +
        '</ul>' +
      '</div>' +
      (features ? '<section class="pd-block"><h2>What you get</h2><ul class="feature-list">' + features + '</ul></section>' : '') +
      detailStaticBlocks() +
    '</div>' +
  '</div>';
  const byId = new Map(variants.map(v => [v.id, v]));
  $('plan-grid').querySelectorAll('[data-plan]').forEach(btn => {
    btn.onclick = () => {
      const v = byId.get(btn.dataset.plan);
      if (!v) return;
      $('plan-grid').querySelectorAll('[data-plan]').forEach(b => { b.classList.toggle('selected', b === btn); b.setAttribute('aria-pressed', String(b === btn)); });
      $('pd-plan-label').textContent = (durationOf(v) || 'SELECTED PLAN').toUpperCase();
      $('pd-plan-price').textContent = formatMoney(v.price);
      $('start-order').dataset.id = v.id;
      $('start-whatsapp-order').dataset.id = v.id;
    };
  });
  $('start-order').onclick = () => startOrder($('start-order').dataset.id);
  $('start-whatsapp-order').onclick = () => startWhatsAppOrder($('start-whatsapp-order').dataset.id);
}

function openGroup(key) {
  if (key && key.toLowerCase().includes('free fire')) {
    openFreeFireProduct();
    return;
  }
  const group = state.groupByKey?.get(key);
  if (!group) return;
  showDialog('product-dialog');
  if (group.variants.length === 1) { openProduct(group.variants[0].id); return; }
  renderGroupDetail(group);
}

function openGroupWithPlan(key, variantId) {
  const group = state.groupByKey?.get(key);
  if (!group) return;
  if (group.variants.length === 1) { openProduct(group.variants[0].id); return; }
  showDialog('product-dialog');
  renderGroupDetail(group, variantId);
}

async function openProduct(id) {
  showDialog('product-dialog');
  $('product-detail').innerHTML = '<div class="pd-layout"><div class="pd-media"><div class="product-detail-image skeleton"></div></div><div><p class="eyebrow">LOADING DETAILS</p><h1 id="product-title">Subscription</h1></div></div>';
  try {
    const product = await api('/products/' + encodeURIComponent(id));
    if (product.name && product.name.toLowerCase().includes('free fire')) {
      closeDialog('product-dialog');
      openFreeFireProduct();
      return;
    }
    const byKey = baseKey(product.name);
    const group = state.groupByKey?.get(byKey);
    if (group && group.variants.length > 1) { renderGroupDetail(group, id); return; }
    const saving = savingsOf(product);
    const duration = durationOf(product);
    const badge = product.offer_label || product.badge;
    const badges = [];
    if (saving) badges.push('<span class="store-badge store-badge-save">-' + saving.percent + '% off</span>');
    if (badge) badges.push(saleBadge(badge));
    if (duration) badges.push('<span class="store-badge store-badge-plain">' + escapeHtml(duration) + '</span>');
    const features = (product.features || []).map(feature => '<li>' + escapeHtml(feature) + '</li>').join('');
    $('product-detail').innerHTML = '<div class="pd-layout">' +
      '<div class="pd-media">' +
        '<div class="product-detail-image">' + detailVisual(product) + '</div>' +
        (badges.length ? '<div class="pd-badges">' + badges.join('') + '</div>' : '') +
      '</div>' +
      '<div class="pd-main">' +
        '<div class="pd-head">' +
          '<p class="pd-category">' + escapeHtml((product.category_name || 'SUBSCRIPTION').toUpperCase()) + '</p>' +
          '<h1 id="product-title">' + escapeHtml(product.name) + '</h1>' +
          '<p class="pd-summary">' + escapeHtml(product.description || 'Review this subscription and start your order when ready.') + '</p>' +
        '</div>' +
        '<div class="pd-price-card">' +
          '<div class="pd-price-top">' +
            '<span class="pd-price-main"><small>' + (duration ? escapeHtml(duration.toUpperCase()) : 'TOTAL PRICE') + '</small><b>' + formatMoney(product.price) + '</b></span>' +
            (saving ? '<span class="pd-price-side"><s>' + formatMoney(product.original_price) + '</s><span class="price-save">You save ' + formatMoney(saving.amount) + '</span></span>' : '') +
          '</div>' +
          '<div class="pd-actions">' +
            '<button type="button" class="button" id="start-order" data-id="' + escapeHtml(product.id) + '"><span class="card-buy-text">Buy now with eSewa / Khalti / QR</span> <span aria-hidden="true">→</span></button>' +
            '<button type="button" class="button button-whatsapp" id="start-whatsapp-order" data-id="' + escapeHtml(product.id) + '">' + WHATSAPP_ICON_SVG + '<span>Order via WhatsApp</span></button>' +
          '</div>' +
          '<ul class="pd-reassure">' +
            '<li>Pay with eSewa, Khalti, bank transfer or QR</li>' +
            '<li>Every payment receipt is checked by our team</li>' +
            '<li>Track the status of your order from your account</li>' +
          '</ul>' +
        '</div>' +
        (features ? '<section class="pd-block"><h2>What you get</h2><ul class="feature-list">' + features + '</ul></section>' : '') +
        detailStaticBlocks() +
        detailRelated(product) +
      '</div>' +
    '</div>';
    $('start-order').onclick = () => startOrder(product.id);
    $('start-whatsapp-order').onclick = () => startWhatsAppOrder(product.id);
    $('product-detail').querySelectorAll('[data-related]').forEach(button => { button.onclick = () => openProduct(button.dataset.related); });
  } catch (error) {
    $('product-detail').innerHTML = '<h2 id="product-title">Couldn’t load this subscription</h2><p>' + escapeHtml(error.message) + '</p>';
  }
}

async function startOrder(productId) {
  if (!productId) return;
  if (!state.user) {
    state.pendingAction = { type: 'order', productId };
    closeDialog('product-dialog');
    openAuth('login');
    toast('Please sign in or create an account to place an order.');
    return;
  }
  try {
    const order = await api('/orders', { method: 'POST', body: JSON.stringify({ product_id: productId, request_key: generateUUID() }) });
    closeDialog('product-dialog');
    openPayment(order);
  } catch (error) {
    toast(error.message, 'error');
  }
}

function paymentReference(order) {
  return String(order.id || '').slice(0, 8).toUpperCase();
}

async function openPayment(order) {
  showDialog('payment-dialog');
  $('payment-content').innerHTML = '<div class="payment-loading"><p class="eyebrow">SECURE PAYMENT</p><h2 id="payment-title">Preparing your payment options</h2><p class="form-note">Loading checkout details…</p></div>';
  try {
    const settings = await api('/settings');
    const methods = (settings.payment_methods || 'eSewa, Khalti, Bank transfer').split(',').map(value => value.trim()).filter(Boolean);
    const amount = Number(order.price || 0);
    const reference = paymentReference(order);
    
    $('payment-content').innerHTML = 
      '<div class="checkout-shell">' +
        '<div class="checkout-header">' +
          '<span class="checkout-badge">ORDER REF: #' + escapeHtml(reference) + '</span>' +
          '<h2 id="payment-title">Choose Payment Method</h2>' +
          '<div class="checkout-product-bar">' +
            '<span>Subscription: <strong>' + escapeHtml(order.product_name) + '</strong></span>' +
            '<span class="checkout-amount">' + formatMoney(amount) + '</span>' +
          '</div>' +
        '</div>' +
        '<p class="checkout-intro">Select how you want to complete your order:</p>' +
        '<div class="payment-options-grid">' +
          '<div class="payment-option-card payment-option-whatsapp">' +
            '<div class="option-icon option-icon-whatsapp">' + WHATSAPP_ICON_SVG + '</div>' +
            '<span class="option-tag option-tag-whatsapp">RECOMMENDED · INSTANT SUPPORT</span>' +
            '<h3>Direct Order via WhatsApp</h3>' +
            '<p>Connect directly with our local support team on WhatsApp to finalize payment and activate your subscription.</p>' +
            '<ul class="option-features">' +
              '<li>✓ Instant 1-on-1 human assistance</li>' +
              '<li>✓ Direct eSewa / Khalti instructions</li>' +
              '<li>✓ Immediate order verification</li>' +
            '</ul>' +
            '<button type="button" class="button-payment-whatsapp" id="pay-opt-whatsapp">' + WHATSAPP_ICON_SVG + '<span>Order & Pay on WhatsApp</span></button>' +
          '</div>' +
          
          '<div class="payment-option-card">' +
            '<div class="option-icon">🔳</div>' +
            '<span class="option-tag">ONLINE QR SCAN</span>' +
            '<h3>Scan QR Code & Upload Proof</h3>' +
            '<p>Scan our official eSewa / Khalti / Bank QR code and upload your payment receipt directly on the web app.</p>' +
            '<ul class="option-features">' +
              '<li>✓ Instant QR code display</li>' +
              '<li>✓ Upload screenshot receipt</li>' +
              '<li>✓ Live status tracking in account</li>' +
            '</ul>' +
            '<button type="button" class="button-payment-qr" id="pay-opt-qr">Pay via QR Code & Upload →</button>' +
          '</div>' +
        '</div>' +
        '<ul class="checkout-trust">' +
          '<li>Your order reference is #' + escapeHtml(reference) + '</li>' +
          '<li>Receipts are reviewed before approval</li>' +
          '<li>Status updates appear under My orders</li>' +
        '</ul>' +
      '</div>';

    $('pay-opt-whatsapp').onclick = () => {
      closeDialog('payment-dialog');
      startWhatsAppOrder(order.product_id);
    };
    $('pay-opt-qr').onclick = () => renderPaymentQrView(order, settings, methods);
  } catch (error) {
    $('payment-content').innerHTML = '<h2 id="payment-title">Payment details are unavailable</h2><p class="form-error">' + escapeHtml(error.message) + '</p>';
  }
}

function renderPaymentQrView(order, settings, methods) {
  const accountId = settings.payment_account || '9705985657';
  const amount = Number(order.price || 0);
  const reference = paymentReference(order);
  const qr = settings.payment_qr_url || 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + encodeURIComponent('Digi Prime Nepal ' + accountId + ' NPR ' + amount + ' ' + reference);
  
  $('payment-content').innerHTML = '<div class="payment-flow"><div class="payment-step-label"><span>STEP 1 OF 2</span><strong>Pay via QR, then confirm</strong></div><div class="payment-qr-card"><div class="payment-method-badges">' + methods.map(method => '<span>' + escapeHtml(method) + '</span>').join('') + '</div><img class="payment-qr payment-qr-large" src="' + escapeHtml(qr) + '" alt="Payment QR code for ' + formatMoney(amount) + '"><p class="payment-amount-label">AMOUNT TO PAY</p><strong class="payment-amount">' + formatMoney(amount) + '</strong><p class="payment-account">eSewa / Khalti ID <b>' + escapeHtml(accountId) + '</b></p><p class="payment-reference">Order reference: <b>' + escapeHtml(reference) + '</b></p></div><p class="payment-instructions">' + escapeHtml(settings.payment_instructions || 'Scan the QR, include your order reference, and keep the receipt ready.') + '</p><button class="auth-primary" id="payment-next" type="button"><span>I\'ve paid — enter details</span><span aria-hidden="true">→</span></button><button class="payment-back" id="payment-cancel" type="button">← Back to Payment Options</button></div>';
  $('payment-next').onclick = () => renderPaymentDetails(order, settings, methods);
  $('payment-cancel').onclick = () => openPayment(order);
}

function renderPaymentDetails(order, settings, methods) {
  const reference = paymentReference(order);
  $('payment-content').innerHTML = '<div class="payment-flow"><div class="payment-step-label"><span>STEP 2 OF 2</span><strong>Confirm your payment</strong></div><p class="form-note">Enter the transaction reference exactly as shown in your payment app and attach the receipt.</p><form class="payment-form" id="payment-form"><label class="auth-field">Your full name<input name="payer_name" autocomplete="name" value="' + escapeHtml(state.user?.name || '') + '" required minlength="2" maxlength="100"></label><label class="auth-field">Payment method<select name="payment_method" required>' + methods.map(method => '<option value="' + escapeHtml(method) + '">' + escapeHtml(method) + '</option>').join('') + '</select></label><label class="auth-field">Transaction / reference ID<input name="transaction_id" autocomplete="off" required minlength="3" maxlength="100" placeholder="For example, TX12345678"></label><label class="auth-field">Phone number <span class="field-optional">Optional</span><input name="phone" type="tel" autocomplete="tel" maxlength="40" placeholder="98xxxxxxxx"></label><label class="auth-field receipt-field">Payment receipt<input name="receipt" type="file" accept="image/png,image/jpeg,image/webp" required><span class="file-help">PNG, JPG, or WebP · maximum 15 MB</span></label><label class="auth-field">Additional note <span class="field-optional">Optional</span><textarea name="note" maxlength="1000" rows="3" placeholder="Anything the payment reviewer should know?"></textarea></label><p class="payment-order-reference">Order reference <b>' + escapeHtml(reference) + '</b></p><p class="auth-alert" id="payment-error" role="alert" hidden></p><button class="auth-primary" type="submit"><span>Submit payment proof</span><span aria-hidden="true">→</span></button></form><button class="payment-back" type="button" id="payment-back">← Back to QR</button></div>';
  $('payment-form').onsubmit = event => submitPayment(event, order);
  $('payment-back').onclick = () => renderPaymentQrView(order, settings, methods);
}

function updateBottomNav() {
  const map = [['mob-nav-home', false], ['mob-nav-search', false], ['mob-nav-browse', false], ['mob-nav-orders', !!state.user], ['mob-nav-account', !!state.user]];
  map.forEach(([id]) => {
    const el = $(id);
    if (el) el.classList.toggle('active', id === 'mob-nav-home' && window.scrollY < 400);
  });
}

/* Client-side guard so oversized receipts fail fast with a clear message
   instead of a slow failed upload. Server limit is 15 MB. */
function receiptTooLarge(file) {
  const max = 15 * 1024 * 1024;
  return file && file.size > max;
}

async function submitPayment(event, order) {
  event.preventDefault();
  const form = event.currentTarget, values = new FormData(form), file = values.get('receipt'), error = $('payment-error');
  error.hidden = true;
  if (!(file instanceof File) || !file.size) {
    error.textContent = 'Attach your payment receipt to continue.';
    error.hidden = false;
    return;
  }
  if (receiptTooLarge(file)) {
    error.textContent = 'That image is larger than 15 MB. Please choose a smaller screenshot.';
    error.hidden = false;
    return;
  }
  setSubmitting(form, true, 'Uploading receipt…');
  try {
    const upload = new FormData();
    upload.append('image', file);
    upload.append('purpose', 'receipt');
    const media = await api('/upload', { method: 'POST', body: upload });
    setSubmitting(form, true, 'Submitting payment…');
    await api('/payments', {
      method: 'POST',
      body: JSON.stringify({
        order_id: order.id,
        payer_name: values.get('payer_name'),
        transaction_id: values.get('transaction_id'),
        payment_method: values.get('payment_method'),
        phone: values.get('phone') || '',
        note: values.get('note') || '',
        media_id: media.id
      })
    });
    const reference = paymentReference(order);
    $('payment-content').innerHTML = '<div class="payment-success"><span class="payment-success-mark" aria-hidden="true">✓</span><p class="eyebrow">PAYMENT RECEIVED</p><h2 id="payment-title">Thanks, your proof is in</h2><p>We’ll review the transaction and update your order after verification.</p><div class="payment-success-summary"><span>Order reference</span><b>' + escapeHtml(reference) + '</b><span>Amount</span><b>' + formatMoney(order.price) + '</b></div><button class="auth-primary" type="button" id="payment-done">Done</button></div>';
    $('payment-done').onclick = () => { closeDialog('payment-dialog'); openOrders(); };
  } catch (errorResponse) {
    error.textContent = errorResponse.message;
    error.hidden = false;
    setSubmitting(form, false, 'Submit payment proof');
  }
}

function renderAccount() {
  const holder = $('account-actions');
  if (!holder) return;
  holder.replaceChildren();
  holder.className = 'account-menu';
  updateBottomNav();
  if (state.user) {
    const orders = document.createElement('button');
    orders.className = 'nav-login';
    orders.textContent = 'My account';
    orders.onclick = () => openOrders();
    const logout = document.createElement('button');
    logout.className = 'nav-logout';
    logout.textContent = 'Sign out';
    logout.onclick = logoutUser;
    holder.append(orders, logout);
  } else {
    const loginButton = document.createElement('button');
    loginButton.className = 'nav-login';
    loginButton.textContent = 'Login';
    loginButton.onclick = () => openAuth('login');
    const signupButton = document.createElement('button');
    signupButton.className = 'nav-signup';
    signupButton.textContent = 'Sign up';
    signupButton.onclick = () => openAuth('signup');
    holder.append(loginButton, signupButton);
  }
}

async function initAccount() {
  try {
    const me = await api('/auth/me');
    state.user = me;
    if (me.csrf) {
      state.csrf = me.csrf;
      localStorage.setItem('dn_csrf', state.csrf);
    }
  } catch {
    state.user = null;
    localStorage.removeItem('dn_csrf');
    state.csrf = '';
  }
  renderAccount();
}

function authFrame(eyebrow, title, description, body) {
  return '<div class="auth-shell"><aside class="auth-aside" aria-hidden="true"><img src="digi-prime-nepal-logo.png" alt="Digi Prime Nepal"><div><p class="auth-kicker">DIGI PRIME NEPAL ACCOUNT</p><h3>Premium access,<br>kept simple.</h3><p>Manage orders, payment updates, and subscriptions from one protected place.</p></div><span class="auth-aside-mark">Trusted digital subscriptions</span></aside><section class="auth-panel"><p class="eyebrow">' + eyebrow + '</p><h2 id="auth-title">' + title + '</h2><p class="auth-description">' + description + '</p>' + body + '</section></div>';
}

function authAlert(message) {
  const alert = $('auth-error');
  if (alert) {
    let text = getErrorMessage(message, 'Invalid email or password.');
    alert.textContent = text;
    alert.hidden = false;
  }
}
function passwordField(name, label, autocomplete, strong = false) { return '<label class="auth-field">' + label + '<span class="password-input"><input name="' + name + '" type="password" autocomplete="' + autocomplete + '" required ' + (strong ? 'minlength="12" maxlength="72" aria-describedby="password-help"' : 'maxlength="256"') + '><button class="password-toggle" type="button" data-password-toggle="' + name + '" aria-label="Show ' + label.toLowerCase() + '">Show</button></span></label>'; }

function setupPasswordToggles() {
  document.querySelectorAll('[data-password-toggle]').forEach(button => button.onclick = () => {
    const input = button.parentElement.querySelector('input');
    const shown = input.type === 'text';
    input.type = shown ? 'password' : 'text';
    button.textContent = shown ? 'Show' : 'Hide';
    button.setAttribute('aria-label', (shown ? 'Show ' : 'Hide ') + button.closest('label').childNodes[0].textContent.trim().toLowerCase());
  });
}

function setSubmitting(form, submitting, label) {
  const button = form.querySelector('[type="submit"]');
  if (!button) return;
  button.disabled = submitting;
  button.innerHTML = submitting ? '<span class="button-spinner" aria-hidden="true"></span><span>' + label + '</span>' : '<span>' + label + '</span><span aria-hidden="true">→</span>';
}

function resumePendingAction() {
  if (state.pendingAction) {
    const a = state.pendingAction;
    state.pendingAction = null;
    if (a.type === 'order') startOrder(a.productId);
    else if (a.type === 'whatsapp') startWhatsAppOrder(a.productId);
  }
}

function openAuth(mode = 'login', data = {}) {
  showDialog('auth-dialog');
  const email = escapeHtml(data.email || '');
  if (mode === 'signup') {
    const googleBtnHtml = '<a class="auth-google-direct" href="/api/auth/google/start" id="auth-google-signup">' +
      GOOGLE_ICON_SVG +
      '<span>Sign up with Google</span>' +
    '</a>';
    $('auth-content').innerHTML = authFrame('CREATE ACCOUNT', 'Create your account', 'A simple account keeps your orders, payment updates, and subscriptions in one secure place.', googleBtnHtml + '<div class="auth-divider"><span>or register with email</span></div><form class="auth-form" id="signup-form"><label class="auth-field">Full name<input name="name" type="text" autocomplete="name" required maxlength="100"></label><label class="auth-field">Email address<input name="email" type="email" autocomplete="email" required></label>' + passwordField('password', 'Password', 'new-password', true) + passwordField('confirmPassword', 'Confirm password', 'new-password', true) + '<p class="password-help" id="password-help">Use 12 to 72 characters with upper- and lower-case letters, a number, and a symbol.</p><p class="auth-alert" id="auth-error" role="alert" hidden></p><button class="auth-primary" type="submit"><span>Create account</span><span aria-hidden="true">→</span></button></form><p class="auth-switch">Already have an account? <button type="button" data-auth-mode="login">Sign in</button></p>');
    $('signup-form').onsubmit = register;
    const directG = $('auth-google-signup');
    if (directG) {
      directG.onclick = () => {
        if (state.pendingAction) {
          try { sessionStorage.setItem('dn_pending_action', JSON.stringify(state.pendingAction)); } catch (e) { void e; }
        }
      };
    }
  } else if (mode === 'forgot') {
    $('auth-content').innerHTML = authFrame('PASSWORD RECOVERY', 'Reset your password', 'Enter your email and we’ll send a recovery code when email delivery is available for this site.', '<form class="auth-form" id="forgot-form"><label class="auth-field">Email address<input name="email" type="email" autocomplete="email" value="' + email + '" required></label><p class="auth-alert" id="auth-error" role="alert" hidden></p><button class="auth-primary" type="submit"><span>Send recovery code</span><span aria-hidden="true">→</span></button></form><p class="auth-switch"><button type="button" data-auth-mode="login">Back to sign in</button></p>');
    $('forgot-form').onsubmit = requestPasswordReset;
  } else if (mode === 'reset') {
    $('auth-content').innerHTML = authFrame('PASSWORD RECOVERY', 'Choose a new password', 'Use the code sent to your inbox and choose a strong new password.', '<form class="auth-form" id="reset-form"><label class="auth-field">Email address<input name="email" type="email" autocomplete="email" value="' + email + '" required></label><label class="auth-field">Recovery code<input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required></label>' + passwordField('password', 'New password', 'new-password', true) + passwordField('confirmPassword', 'Confirm password', 'new-password', true) + '<p class="password-help" id="password-help">Use 12 to 72 characters with upper- and lower-case letters, a number, and a symbol.</p><p class="auth-alert" id="auth-error" role="alert" hidden></p><button class="auth-primary" type="submit"><span>Reset password</span><span aria-hidden="true">→</span></button></form><p class="auth-switch"><button type="button" data-auth-mode="login">Back to sign in</button></p>');
    $('reset-form').onsubmit = resetPassword;
  } else if (mode === 'mfa') {
    $('auth-content').innerHTML = authFrame('TWO-STEP VERIFICATION', 'Confirm it’s you', 'Enter the code from your authenticator app or a recovery code to continue.', '<form class="auth-form" id="mfa-form"><label class="auth-field">Authentication code<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="16" required autofocus></label><p class="auth-alert" id="auth-error" role="alert" hidden></p><button class="auth-primary" type="submit"><span>Verify and sign in</span><span aria-hidden="true">→</span></button></form><p class="auth-switch"><button type="button" data-auth-mode="login">Use a different account</button></p>');
    $('mfa-form').onsubmit = event => login(event, data);
  } else if (mode === 'gmail-otp') {
    const googleBtnHtml = '<a class="auth-google-direct" href="/api/auth/google/start" id="auth-google-otp">' +
      GOOGLE_ICON_SVG +
      '<span>Sign in with Google</span>' +
    '</a>';
    $('auth-content').innerHTML = authFrame('GMAIL VERIFICATION', 'Login with Gmail OTP', 'Enter your email address to receive a instant 6-digit OTP code directly in your inbox.', googleBtnHtml + '<div class="auth-divider"><span>or use 6-digit OTP code</span></div><form class="auth-form" id="gmail-otp-form"><label class="auth-field">Email address<div style="display:flex;gap:8px;"><input name="email" id="gmail-otp-email" type="email" autocomplete="email" value="' + email + '" required placeholder="yourname@gmail.com" style="flex:1;" autofocus><button type="button" class="card-action card-buy" id="send-gmail-otp-btn" style="white-space:nowrap;padding:.5rem .9rem;font-size:.78rem;min-height:auto;">Send OTP</button></div></label><label class="auth-field">6-digit Gmail OTP code<input name="otp" id="gmail-otp-code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456" required></label><p class="auth-alert" id="auth-error" role="alert" hidden></p><button class="auth-primary" type="submit"><span>Verify OTP & Sign in</span><span aria-hidden="true">→</span></button></form><p class="auth-switch">Prefer password sign in? <button type="button" data-auth-mode="login">Password Login</button></p>');
    $('gmail-otp-form').onsubmit = verifyGmailOtp;
    $('send-gmail-otp-btn').onclick = sendGmailOtp;
    const directG = $('auth-google-otp');
    if (directG) {
      directG.onclick = () => {
        if (state.pendingAction) {
          try { sessionStorage.setItem('dn_pending_action', JSON.stringify(state.pendingAction)); } catch (e) { void e; }
        }
      };
    }
  } else {
    const googleBtnHtml = '<a class="auth-google-direct" href="/api/auth/google/start" id="auth-google-direct">' +
      GOOGLE_ICON_SVG +
      '<span>Sign in with Google</span>' +
    '</a>';
    $('auth-content').innerHTML = authFrame('ACCOUNT ACCESS', 'Welcome back', 'Sign in to manage your subscriptions, orders, and account.', googleBtnHtml + '<div class="auth-divider"><span>or sign in with email</span></div><form class="auth-form" id="login-form"><label class="auth-field">Email address<input name="email" type="email" autocomplete="email" value="' + email + '" required autofocus></label>' + passwordField('password', 'Password', 'current-password') + '<div class="auth-options"><button type="button" class="auth-link" data-auth-mode="forgot">Forgot password?</button></div><p class="auth-alert" id="auth-error" role="alert" hidden></p><button class="auth-primary" type="submit"><span>Sign in</span><span aria-hidden="true">→</span></button></form><p class="auth-switch">New to Digi Prime Nepal? <button type="button" data-auth-mode="signup">Create account</button></p>');
    $('login-form').onsubmit = login;
    const directG = $('auth-google-direct');
    if (directG) {
      directG.onclick = () => {
        if (state.pendingAction) {
          try { sessionStorage.setItem('dn_pending_action', JSON.stringify(state.pendingAction)); } catch (e) { void e; }
        }
      };
    }
  }
  setupPasswordToggles();
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.onclick = () => openAuth(button.dataset.authMode, { email: button.closest('form')?.elements.email?.value || data.email || '' }));
}

async function sendGmailOtp() {
  const emailInput = $('gmail-otp-email');
  const email = (emailInput?.value || '').trim();
  if (!email || !email.includes('@')) {
    authAlert('Please enter a valid email address.');
    return;
  }
  const btn = $('send-gmail-otp-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  const error = $('auth-error');
  if (error) error.hidden = true;
  try {
    const res = await api('/auth/send-otp', { method: 'POST', body: JSON.stringify({ email }) });
    toast(res.message, 'success');
    if (res.dev_otp) {
      toast(`DEV OTP CODE: ${res.dev_otp}`, 'warning');
      const codeInput = $('gmail-otp-code');
      if (codeInput) codeInput.value = res.dev_otp;
    }
    if (btn) {
      let count = 60;
      const timer = setInterval(() => {
        count--;
        if (count <= 0) {
          clearInterval(timer);
          btn.disabled = false;
          btn.textContent = 'Resend OTP';
        } else {
          btn.textContent = `Resend (${count}s)`;
        }
      }, 1000);
    }
  } catch (err) {
    authAlert(err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
  }
}

async function verifyGmailOtp(event) {
  event.preventDefault();
  const email = ($('gmail-otp-email')?.value || '').trim();
  const otp = ($('gmail-otp-code')?.value || '').trim();
  if (!email || !otp) {
    authAlert('Please enter both your email address and 6-digit OTP code.');
    return;
  }
  const form = event.currentTarget;
  setSubmitting(form, true, 'Verifying OTP…');
  const error = $('auth-error');
  if (error) error.hidden = true;
  try {
    const result = await api('/auth/login-otp', { method: 'POST', body: JSON.stringify({ email, otp }) });
    state.user = result.user;
    state.csrf = result.csrf || result.token || '';
    localStorage.setItem('dn_csrf', state.csrf);
    closeDialog('auth-dialog');
    renderAccount();
    toast(`Welcome back, ${state.user.name}! Signed in via Gmail OTP.`);
    resumePendingAction();
  } catch (err) {
    authAlert(err.message);
    setSubmitting(form, false, 'Verify OTP & Sign in');
  }
}

async function login(event, pending = {}) {
  event.preventDefault();
  const form = event.currentTarget, values = new FormData(form), email = String(pending.email || values.get('email') || '').trim(), password = String(pending.password || values.get('password') || '');
  setSubmitting(form, true, 'Signing in…');
  const error = $('auth-error');
  error.hidden = true;
  try {
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, code: values.get('code') || undefined }) });
    if (result.requires_mfa) { openAuth('mfa', { email, password }); return; }
    state.user = result.user;
    state.csrf = result.csrf || result.token || '';
    localStorage.setItem('dn_csrf', state.csrf);
    closeDialog('auth-dialog');
    renderAccount();
    toast('You are signed in.');
    resumePendingAction();
  } catch (err) {
    authAlert(err.message);
    setSubmitting(form, false, 'Sign in');
  }
}

function validateNewPassword(password, confirmPassword) {
  if (password !== confirmPassword) return 'Passwords do not match.';
  if (password.length < 12 || password.length > 72) return 'Use a password between 12 and 72 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return 'Use upper- and lower-case letters, a number, and a symbol.';
  return '';
}

async function register(event) {
  event.preventDefault();
  const form = event.currentTarget, values = new FormData(form), password = String(values.get('password') || ''), confirmPassword = String(values.get('confirmPassword') || ''), validation = validateNewPassword(password, confirmPassword);
  if (validation) { authAlert(validation); return; }
  setSubmitting(form, true, 'Creating account…');
  try {
    const email = String(values.get('email') || '').trim(), result = await api('/auth/register', { method: 'POST', body: JSON.stringify({ name: values.get('name'), email, password }) });
    if (result.user) {
      state.user = result.user;
      state.csrf = result.csrf || result.token || '';
      localStorage.setItem('dn_csrf', state.csrf);
      closeDialog('auth-dialog');
      renderAccount();
      toast('Your account is ready.');
      resumePendingAction();
      return;
    }
    $('auth-content').innerHTML = authFrame('EMAIL CONFIRMATION', 'Confirm your email', 'Enter the verification code sent to your inbox to complete your account.', '<form class="auth-form" id="verify-form"><label class="auth-field">Email address<input name="email" type="email" autocomplete="email" value="' + escapeHtml(email) + '" required readonly></label><label class="auth-field">Verification code<input name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{8}" maxlength="8" required autofocus></label><p class="auth-alert" id="auth-error" role="alert" hidden></p><button class="auth-primary" type="submit"><span>Confirm email</span><span aria-hidden="true">→</span></button></form><p class="auth-switch"><button type="button" data-auth-mode="login">Back to sign in</button></p>');
    $('verify-form').onsubmit = verifyRegistration;
    document.querySelectorAll('[data-auth-mode]').forEach(button => button.onclick = () => openAuth(button.dataset.authMode, { email }));
  } catch (err) {
    authAlert(err.message);
    setSubmitting(form, false, 'Create account');
  }
}

async function verifyRegistration(event) {
  event.preventDefault();
  const form = event.currentTarget, values = new FormData(form);
  setSubmitting(form, true, 'Confirming…');
  try {
    await api('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email: values.get('email'), otp: values.get('otp') }) });
    openAuth('login', { email: values.get('email') });
    toast('Your email is confirmed. Sign in to continue.');
  } catch (err) {
    authAlert(err.message);
    setSubmitting(form, false, 'Confirm email');
  }
}

async function requestPasswordReset(event) {
  event.preventDefault();
  const form = event.currentTarget, values = new FormData(form), email = String(values.get('email') || '').trim();
  setSubmitting(form, true, 'Sending…');
  try {
    await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
    openAuth('reset', { email });
    toast('If the address is eligible, a recovery code is on its way.');
  } catch (err) {
    authAlert(err.message);
    setSubmitting(form, false, 'Send recovery code');
  }
}

async function resetPassword(event) {
  event.preventDefault();
  const form = event.currentTarget, values = new FormData(form), password = String(values.get('password') || ''), confirmPassword = String(values.get('confirmPassword') || ''), validation = validateNewPassword(password, confirmPassword);
  if (validation) { authAlert(validation); return; }
  setSubmitting(form, true, 'Resetting…');
  try {
    await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: values.get('email'), otp: values.get('otp'), password }) });
    openAuth('login', { email: values.get('email') });
    toast('Password reset. You can now sign in.');
  } catch (err) {
    authAlert(err.message);
    setSubmitting(form, false, 'Reset password');
  }
}

async function logoutUser() {
  try { await api('/auth/logout', { method: 'POST', body: '{}' }); } catch { void 0; }
  state.user = null;
  state.csrf = '';
  localStorage.removeItem('dn_csrf');
  renderAccount();
  toast('You are signed out.');
}

async function openOrders() {
  if (!state.user) { openAuth('login'); return; }
  showDialog('orders-dialog');
  $('orders-content').innerHTML = '<div class="profile-shell"><h2 id="orders-title">My Profile & Account</h2><p class="form-note">Loading your profile and order details…</p></div>';
  try {
    const result = await api('/orders/my?limit=50');
    const orders = result.items || result;
    const initial = (state.user.name || '?').charAt(0).toUpperCase();
    
    const ordersListHtml = orders.length ? orders.map(order => {
      const statusClass = 'status-' + escapeHtml(order.status);
      return '<article class="order-item">' +
        '<div class="order-item-header">' +
          '<div>' +
            '<h4>' + escapeHtml(order.product_name) + '</h4>' +
            '<p class="order-meta">' + formatMoney(order.price) + ' · Reference <b>' + escapeHtml(String(order.id).slice(0, 8).toUpperCase()) + '</b></p>' +
          '</div>' +
          '<span class="status-pill ' + statusClass + '">' + escapeHtml(order.status) + '</span>' +
        '</div>' +
        (order.note ? '<p class="order-note">' + escapeHtml(order.note) + '</p>' : '') +
        (!order.payment_id && order.status === 'pending' ? '<button type="button" class="order-pay" data-pay-order="' + escapeHtml(order.id) + '" data-pay-name="' + escapeHtml(order.product_name) + '" data-pay-price="' + escapeHtml(order.price) + '">Complete payment <span>→</span></button>' : '') +
      '</article>';
    }).join('') : '<div class="catalog-empty"><p>You haven’t placed any orders yet.</p><a href="#catalog" class="button button-small" onclick="closeDialog(\'orders-dialog\')">Explore subscriptions</a></div>';
    
    $('orders-content').innerHTML = 
      '<div class="profile-shell">' +
        '<div class="profile-card">' +
          '<div class="profile-avatar">' + escapeHtml(initial) + '</div>' +
          '<div class="profile-info">' +
            '<h3>' + escapeHtml(state.user.name) + '</h3>' +
            '<p>' + escapeHtml(state.user.email) + '</p>' +
            '<span class="profile-badge">Active Customer</span>' +
          '</div>' +
        '</div>' +
        
        '<h3 class="orders-section-title">Customer Details</h3>' +
        '<div class="profile-details-grid">' +
          '<div class="profile-field"><small>Full Name</small><span>' + escapeHtml(state.user.name) + '</span></div>' +
          '<div class="profile-field"><small>Email Address</small><span>' + escapeHtml(state.user.email) + '</span></div>' +
          '<div class="profile-field"><small>Account ID</small><span>' + escapeHtml(String(state.user.id || '').slice(0, 12)) + '...</span></div>' +
          '<div class="profile-field"><small>Two-Step Security</small><span>' + (state.user.mfa_enabled ? 'Enabled ✓' : 'Standard') + '</span></div>' +
        '</div>' +
        
        '<h3 class="orders-section-title">My Orders & Subscriptions</h3>' +
        '<div class="order-list">' + ordersListHtml + '</div>' +
      '</div>';
      
    $('orders-content').querySelectorAll('[data-pay-order]').forEach(button => button.onclick = () => { closeDialog('orders-dialog'); openPayment({ id: button.dataset.payOrder, product_name: button.dataset.payName, price: Number(button.dataset.payPrice) }); });
  } catch (error) {
    $('orders-content').innerHTML = '<div class="profile-shell"><h2 id="orders-title">My Account</h2><p class="form-error">' + escapeHtml(error.message) + '</p></div>';
  }
}

function setupSearch() {
  const input = $('search-input');
  if (!input) return;
  $('search-button').onclick = () => { showDialog('search-dialog'); input.focus(); };
  input.addEventListener('input', () => { clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => search(input.value), 350); });
  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); showDialog('search-dialog'); input.focus(); }
    if (event.key === 'Escape') document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  });
}

function setupMotion() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.classList.add('motion-ready');

  // --- Ticker: duplicate content once for seamless infinite loop ---
  const tickerTrack = $('ticker-track');
  if (tickerTrack && !tickerTrack.dataset.cloned) {
    tickerTrack.dataset.cloned = 'true';
    const clone = tickerTrack.cloneNode(true);
    tickerTrack.parentElement.appendChild(clone);
  }

  // --- Scroll reveal observer for static informational sections ---
  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('motion-visible');
        revealObs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -20px 0px' });

  const sectionTargets = document.querySelectorAll(
    '.section-heading, .reason-copy, .reason-list, .faq-layout > div, ' +
    '.steps li, .final-cta .container, .trustbar'
  );
  sectionTargets.forEach(t => revealObs.observe(t));
}


async function search(value) {
  const holder = $('search-results');
  if (!holder) return;
  if (value.trim().length < 2) { holder.innerHTML = '<p class="form-note">Type at least two characters to search the catalogue.</p>'; return; }
  if (state.searchController) state.searchController.abort();
  state.searchController = new AbortController();
  holder.innerHTML = '<p class="form-note">Searching subscriptions…</p>';
  try {
    const result = await api('/products?limit=6&search=' + encodeURIComponent(value), { signal: state.searchController.signal });
    const products = result.items || result;
    holder.innerHTML = products.length ? products.map(product => '<button type="button" class="search-result" data-search-product="' + escapeHtml(product.id) + '"><span>' + escapeHtml(product.name) + '</span><small>' + formatMoney(product.price) + ' →</small></button>').join('') : '<p class="form-note">No subscriptions match that search.</p>';
    holder.querySelectorAll('[data-search-product]').forEach(button => button.onclick = () => { closeDialog('search-dialog'); openProduct(button.dataset.searchProduct); });
  } catch (error) {
    if (error.name !== 'AbortError') holder.innerHTML = '<p class="form-error">' + escapeHtml(error.message) + '</p>';
  }
}

async function loadProviders() { try { state.providers = await api('/auth/providers'); } catch { state.providers = { google: false }; } }

async function loadSettings() {
  try {
    const settings = await api('/settings');
    if ($('footer-text')) $('footer-text').textContent = settings.footer_text || $('footer-text').textContent;
    if (settings.contact_email && $('contact-email')) { $('contact-email').textContent = settings.contact_email; $('contact-email').href = 'mailto:' + settings.contact_email; }
    if (settings.whatsapp_number && $('contact-whatsapp')) { $('contact-whatsapp').href = 'https://wa.me/' + settings.whatsapp_number; }
    if (settings.whatsapp_number && $('whatsapp-float')) { $('whatsapp-float').href = 'https://wa.me/' + settings.whatsapp_number + '?text=' + encodeURIComponent('Hello Digi Prime Nepal, I want to order a subscription.'); }
    bindFreeFireOrder(settings.whatsapp_number);
  } catch { void 0; }
}

/* =========================================================
   FREE FIRE TOP-UP — diamond picker + player ID + WhatsApp checkout
   ========================================================= */
function bindFreeFireOrder(waNumber) {
  const uidInput = $('ff-uid');
  const uidError = $('ff-uid-error');
  const buyBtn = $('ff-buy');
  const packages = $('ff-packages');
  if (!uidInput || !buyBtn || !packages) return;

  const number = String(waNumber || '9779705985657').replace(/[^0-9]/g, '');

  // Diamond tiers matching OLLASTORE's Free Fire top-up product (NP region pricing)
  const ffPackages = [
    { label: '25 Diamond 💎', price: 30 },
    { label: '50 Diamond 💎', price: 60 },
    { label: '115 Diamond 💎', price: 115 },
    { label: '355 Diamond 💎', price: 330 },
    { label: '610 Diamond 💎', price: 550 },
    { label: '1090 Diamond 💎', price: 1000 },
    { label: '1850 Diamond 💎', price: 1650 },
    { label: '5060 Diamond 💎', price: 4400 },
    { label: 'Weekly Membership 🏆', price: 220 },
    { label: 'Monthly Membership 👑', price: 520 }
  ];

  const selected = { method: 'eSewa', pkg: null };
  const priceRange = $('ff-price-range');
  const selectedBox = $('ff-selected');
  if (priceRange) {
    const minP = Math.min.apply(null, ffPackages.map(p => p.price));
    const maxP = Math.max.apply(null, ffPackages.map(p => p.price));
    priceRange.textContent = 'Rs ' + minP + ' – Rs ' + new Intl.NumberFormat('en-US').format(maxP);
  }

  const paintPkg = index => {
    packages.querySelectorAll('[data-ff-pkg]').forEach((other, i) => {
      other.classList.toggle('is-active', i === index);
      other.setAttribute('aria-pressed', String(i === index));
    });
  };

  const updateSelectedBox = () => {
    if (!selectedBox) return;
    if (!selected.pkg) { selectedBox.hidden = true; selectedBox.innerHTML = ''; return; }
    selectedBox.hidden = false;
    selectedBox.innerHTML = '<span class="ff-selected-name">' + escapeHtml(selected.pkg.label) + '</span><b class="ff-selected-price">' + formatMoney(selected.pkg.price) + '</b>';
  };

  const renderFFPackages = () => {
    packages.innerHTML = ffPackages.map((pkg, index) =>
      '<button type="button" class="ff-pkg" data-ff-pkg="' + index + '" aria-pressed="false">' +
      '<span class="ff-pkg-name">' + escapeHtml(pkg.label) + '</span>' +
      '<span class="ff-pkg-price">' + formatMoney(pkg.price) + '</span>' +
      '</button>'
    ).join('');
    packages.querySelectorAll('[data-ff-pkg]').forEach((button, index) => {
      button.onclick = () => {
        selected.pkg = ffPackages[index];
        paintPkg(index);
        uidError.hidden = true;
        updateSelectedBox();
      };
    });
  };

  uidInput.addEventListener('input', () => { uidError.hidden = true; });

  buyBtn.onclick = () => {
    const uid = uidInput.value.trim();
    if (!/^\d{6,15}$/.test(uid)) {
      uidError.hidden = false;
      uidInput.focus();
      return;
    }
    if (!selected.pkg) {
      toast('Please select a diamond pack first.', 'error');
      document.querySelector('.ff-packages') && document.querySelector('.ff-packages').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const message = 'Hello Digi Prime Nepal, I want a Free Fire top up.\n' +
      'Player ID (UID): ' + uid + '\n' +
      'Pack: ' + selected.pkg.label + ' (' + formatMoney(selected.pkg.price) + ')\n' +
      'Payment: ' + selected.method + '\n' +
      'Region: NP';
    window.open('https://wa.me/' + number + '?text=' + encodeURIComponent(message), '_blank', 'noopener');
  };

  document.querySelectorAll('.ff-pay-btn').forEach(btn => {
    btn.onclick = () => {
      selected.method = btn.dataset.method || 'eSewa';
      document.querySelectorAll('.ff-pay-btn').forEach(other => {
        other.classList.toggle('is-active', other === btn);
        other.setAttribute('aria-checked', String(other === btn));
      });
    };
  });

  renderFFPackages();
  updateSelectedBox();

  const backBtn = $('ff-back-gaming');
  if (backBtn) {
    backBtn.onclick = () => closeFreeFireProduct(true);
  }
  const crumbGaming = $('ff-crumb-gaming');
  if (crumbGaming) {
    crumbGaming.onclick = () => closeFreeFireProduct(true);
  }
  const heroLink = $('hero-ff-link');
  if (heroLink) {
    heroLink.onclick = (e) => {
      e.preventDefault();
      openFreeFireProduct();
    };
  }
}

function openFreeFireProduct() {
  closeDialog('product-dialog');
  const ff = $('free-fire');
  if (ff) {
    ff.hidden = false;
    ff.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  try {
    if (window.location.hash !== '#free-fire' && window.location.hash !== '#product=free-fire') {
      history.pushState(null, '', '#product=free-fire');
    }
  } catch (e) { void e; }
}

function closeFreeFireProduct(toGaming = false) {
  const ff = $('free-fire');
  if (ff) ff.hidden = true;
  if (toGaming) {
    const gamingCat = state.categories.find(c => (c.name || '').toLowerCase().includes('gaming'));
    if (gamingCat) {
      selectCategory(gamingCat.id);
    } else {
      selectCategory('');
    }
    const catEl = $('catalog');
    if (catEl) catEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      history.pushState(null, '', '#category=gaming');
    } catch (e) { void e; }
  }
}

function handleRoute() {
  const hash = (window.location.hash || '').toLowerCase();
  if (hash === '#free-fire' || hash === '#product=free-fire' || hash.includes('free-fire') || hash.includes('freefire')) {
    openFreeFireProduct();
  } else if (hash.includes('category=gaming') || hash === '#gaming') {
    closeFreeFireProduct();
    const gamingCat = state.categories.find(c => (c.name || '').toLowerCase().includes('gaming'));
    if (gamingCat) selectCategory(gamingCat.id);
  } else if (hash === '#catalog' || hash === '#categories') {
    closeFreeFireProduct();
  }
}

function bindUI() {
  const menuBtn = $('menu-button');
  const navShell = document.querySelector('.nav-shell');
  if (menuBtn && navShell) {
    const closeMenu = () => {
      navShell.classList.remove('menu-open');
      menuBtn.setAttribute('aria-expanded', 'false');
    };
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      const expanded = navShell.classList.toggle('menu-open');
      menuBtn.setAttribute('aria-expanded', String(expanded));
    };
    document.querySelectorAll('.nav-links a').forEach(a => {
      a.addEventListener('click', closeMenu);
    });
    document.addEventListener('click', (e) => {
      if (navShell.classList.contains('menu-open') && !navShell.contains(e.target)) {
        closeMenu();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && navShell.classList.contains('menu-open')) {
        closeMenu();
      }
    });
  }
  document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => closeDialog(button.dataset.close));
  const allSubBtn = document.querySelector('.category[data-category=""]');
  if (allSubBtn) allSubBtn.onclick = () => selectCategory('');
  if ($('footer-login')) $('footer-login').onclick = () => openAuth('login');
  if ($('footer-orders')) $('footer-orders').onclick = openOrders;
  if ($('reset-filter')) $('reset-filter').onclick = () => { state.search = ''; const field = $('catalog-search'); if (field) field.value = ''; selectCategory(''); };
  if ($('product-sort')) $('product-sort').onchange = event => { state.sort = event.target.value; state.page = 1; loadProducts(); };
  if ($('catalog-search')) {
    const field = $('catalog-search');
    const wrap = $('catalog-search-wrap');
    const syncClear = () => { if (wrap) wrap.classList.toggle('has-value', field.value.length > 0); };
    const applySearch = () => { state.search = field.value.trim(); state.page = 1; loadProducts(); };
    field.addEventListener('input', () => { syncClear(); clearTimeout(state.catalogSearchTimer); state.catalogSearchTimer = setTimeout(applySearch, 350); });
    field.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); clearTimeout(state.catalogSearchTimer); applySearch(); } });
    if ($('catalog-search-clear')) $('catalog-search-clear').onclick = () => { field.value = ''; syncClear(); clearTimeout(state.catalogSearchTimer); applySearch(); field.focus(); };
  }
  if ($('discovery-prev')) $('discovery-prev').onclick = () => $('discovery-rail').scrollBy({ left: -320, behavior: 'smooth' });
  if ($('discovery-next')) $('discovery-next').onclick = () => $('discovery-rail').scrollBy({ left: 320, behavior: 'smooth' });
  
  const grid = $('product-grid');
  if (grid) {
    grid.addEventListener('click', event => {
      const ffBtn = event.target.closest('[data-freefire]');
      if (ffBtn) {
        event.preventDefault();
        openFreeFireProduct();
        return;
      }
      const groupView = event.target.closest('[data-group-view]');
      if (groupView) {
        event.preventDefault();
        if (groupView.dataset.groupView && groupView.dataset.groupView.toLowerCase().includes('free fire')) {
          openFreeFireProduct();
          return;
        }
        // If a duration pill was picked on a multi-plan Buy Now, order that variant directly.
        if (groupView.classList.contains('card-buy') && groupView.dataset.selectedVariant) {
          openGroupWithPlan(groupView.dataset.groupView, groupView.dataset.selectedVariant);
          return;
        }
        openGroup(groupView.dataset.groupView);
        return;
      }
      const groupBuy = event.target.closest('[data-group-buy]');
      if (groupBuy) {
        event.preventDefault();
        startOrder(groupBuy.dataset.groupBuy);
        return;
      }
      const buyBtn = event.target.closest('[data-buy]');
      if (buyBtn) {
        event.preventDefault();
        startOrder(buyBtn.dataset.buy);
        return;
      }
      const viewBtn = event.target.closest('[data-product]');
      if (viewBtn) {
        event.preventDefault();
        openProduct(viewBtn.dataset.product);
        return;
      }
      const card = event.target.closest('.product-card[data-group-key]');
      if (card) {
        if (card.dataset.groupKey && card.dataset.groupKey.toLowerCase().includes('free fire')) {
          openFreeFireProduct();
          return;
        }
        openGroup(card.dataset.groupKey);
      }
    });
    grid.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('.product-card[data-group-key]');
      if (card && event.target === card) { event.preventDefault(); openGroup(card.dataset.groupKey); }
    });
  }

  setupDiscoveryAutoScroll();
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
}

function setupDiscoveryAutoScroll() {
  const rail = $('discovery-rail');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !rail) return;
  let paused = false;
  let resumeTimer;
  const pause = () => { paused = true; clearTimeout(resumeTimer); };
  const resume = () => { clearTimeout(resumeTimer); resumeTimer = setTimeout(() => { paused = false; }, 2400); };
  ['mouseenter', 'focusin', 'pointerdown', 'touchstart'].forEach(type => rail.addEventListener(type, pause, { passive: true }));
  ['mouseleave', 'focusout'].forEach(type => rail.addEventListener(type, resume, { passive: true }));
  setInterval(() => {
    if (paused || rail.scrollWidth <= rail.clientWidth) return;
    if (rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 2) rail.scrollTo({ left: 0, behavior: 'smooth' });
    else rail.scrollLeft += 1;
  }, 90);
}

async function startWhatsAppOrder(productId) {
  if (!productId) return;

  let product = (state.catalog || []).find(p => p.id === productId);
  if (!product) {
    try {
      product = await api('/products/' + encodeURIComponent(productId));
    } catch {
      product = null;
    }
  }

  let waNumber = '9779705985657';
  try {
    const settings = await api('/settings');
    if (settings && settings.whatsapp_number) {
      waNumber = String(settings.whatsapp_number).replace(/[^0-9]/g, '') || waNumber;
    }
  } catch { /* use default */ }

  const pName = product ? product.name : 'Subscription';
  const pPrice = product ? formatMoney(product.price) : '';

  if (state.user) {
    try {
      const order = await api('/orders', { method: 'POST', body: JSON.stringify({ product_id: productId, request_key: generateUUID() }) });
      const ref = paymentReference(order);
      const message = 'Hello Digi Prime Nepal, I want to order ' + order.product_name + ' (' + formatMoney(order.price) + '). Order reference: #' + ref;
      window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent(message), '_blank', 'noopener');
      closeDialog('product-dialog');
      toast('Order created! Opening WhatsApp to complete details...', 'success');
      return;
    } catch (error) {
      console.warn('Could not record order in DB:', error.message);
    }
  }

  // Guest order directly to WhatsApp with zero barrier
  const guestMsg = 'Hello Digi Prime Nepal, I want to order ' + pName + (pPrice ? ' (' + pPrice + ')' : '') + '. Please share payment details (eSewa / Khalti / QR).';
  window.open('https://wa.me/' + waNumber + '?text=' + encodeURIComponent(guestMsg), '_blank', 'noopener');
  closeDialog('product-dialog');
  toast('Opening WhatsApp to chat with Digi Prime Nepal...', 'success');
}

async function init() {
  if ($('year')) $('year').textContent = new Date().getFullYear();
  bindUI();
  setupSearch();
  setupMotion();
  setProductLoading();
  await Promise.allSettled([initAccount(), loadProviders(), loadCategories(), loadSettings(), loadCampaign(), loadProducts()]);
  handleRoute();
  window.addEventListener('hashchange', handleRoute);

  const urlParams = new URLSearchParams(window.location.search);
  const authQuery = urlParams.get('auth');
  if (authQuery === 'google') {
    toast('Welcome! Signed in with Google.', 'success');
    window.history.replaceState({}, document.title, window.location.pathname);
    try {
      const saved = sessionStorage.getItem('dn_pending_action');
      if (saved) {
        state.pendingAction = JSON.parse(saved);
        sessionStorage.removeItem('dn_pending_action');
        resumePendingAction();
      }
    } catch (e) { void e; }
  } else if (authQuery === 'google-unavailable') {
    toast('Google sign-in is currently unavailable.', 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (authQuery === 'google-failed') {
    const errorMsg = urlParams.get('message') || 'Google sign-in could not be completed. Please try again.';
    toast(errorMsg, 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

init();

/* ── Interactive card spotlight (mouse-following brand-colored glow) ──── */
(function cardSpotlight() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const grid = document.getElementById('product-grid');
  const carousel = document.getElementById('flash-carousel');

  const SPOTLIGHT_CSS = `
    .product-card, .flash-deal-card { --mx: 50%; --my: 50%; }
    .product-card .card-spotlight, .flash-deal-card .card-spotlight {
      position: absolute; inset: 0; border-radius: inherit;
      background: radial-gradient(
        380px circle at var(--mx) var(--my),
        hsla(var(--bh, 0), var(--bs, 80%), var(--bl, 50%), .15) 0%,
        transparent 65%
      );
      pointer-events: none; z-index: 1;
      opacity: 0;
      transition: opacity .35s ease;
    }
    .product-card:hover .card-spotlight, .flash-deal-card:hover .card-spotlight { opacity: 1; }
  `;
  const style = document.createElement('style');
  style.textContent = SPOTLIGHT_CSS;
  document.head.appendChild(style);

  function ensureSpotlight(card) {
    if (!card.querySelector('.card-spotlight')) {
      const el = document.createElement('div');
      el.className = 'card-spotlight';
      el.setAttribute('aria-hidden', 'true');
      card.insertBefore(el, card.firstChild);
    }
  }

  function handleMove(e) {
    const card = e.target.closest('.product-card, .flash-deal-card');
    if (!card || card.classList.contains('skeleton')) return;
    ensureSpotlight(card);
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
    card.style.setProperty('--my', (e.clientY - rect.top) + 'px');
  }

  if (grid) grid.addEventListener('mousemove', handleMove);
  if (carousel) carousel.addEventListener('mousemove', handleMove);
})();

