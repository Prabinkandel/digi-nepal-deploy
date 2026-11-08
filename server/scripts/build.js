const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const output = path.join(root, 'dist');
const publicFiles = [
  'index.html', 'admin.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html', 'refund.html',
  'style.css', 'animations.css', 'auth.css', 'storefront-polish.css', 'payment-overrides.css', 'store-ui.css', 'mobile-ux.css',
  'responsive-fix.css', 'card-premium.css', 'card-clean.css', 'gaming-trust.css', 'admin.css', 'admin-mobile.css', 'pages.css', 'tokens.css', 'theme.css',
  'app.js', 'admin.js', 'pages.js', 'theme.js', 'logo.png', 'digi-prime-nepal-logo.png', 'logo mm.png', 'dashain-sale-banner.png', 'dashain-sale-banner.jpg',
  'robots.txt', 'sitemap.xml'
];

// Conservative CSS minifier: strips comments and collapses whitespace while
// leaving string literals and url(...) contents untouched. It deliberately
// keeps spaces around '+' and '-' (calc() needs them) and before ':' (a space
// before a pseudo-class changes selector meaning), so it cannot change what
// any rule does — it only removes bytes that carry no meaning.
function minifyCss(css) {
  let out = '';
  let i = 0;
  const n = css.length;
  const pushSpace = () => { if (out && !out.endsWith(' ') && !out.endsWith('{')) out += ' '; };
  while (i < n) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') { // comment
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") { // string literal: copy verbatim
      let j = i + 1;
      while (j < n && css[j] !== ch) { if (css[j] === '\\') j++; j++; }
      out += css.slice(i, Math.min(j + 1, n));
      i = Math.min(j + 1, n);
      continue;
    }
    if ((ch === 'u' || ch === 'U') && css.slice(i, i + 4).toLowerCase() === 'url(') { // url(...): copy verbatim
      const end = css.indexOf(')', i + 4);
      const stop = end === -1 ? n : end + 1;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    if (/\s/.test(ch)) { // collapse whitespace runs to one space
      while (i < n && /\s/.test(css[i])) i++;
      pushSpace();
      continue;
    }
    if (ch === '{' || ch === '}' || ch === ';' || ch === ',' || ch === '>') {
      out = out.replace(/ $/, '');
      if (ch === '}' && out.endsWith(';')) out = out.slice(0, -1);
      out += ch;
      i++;
      while (i < n && /\s/.test(css[i])) i++;
      continue;
    }
    if (ch === ':') { // drop space after ':' only (never before it)
      out += ch;
      i++;
      while (i < n && /\s/.test(css[i])) i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out.trim();
}

// Oversized brand images: the sources are 2123px wide (~900 KB) but render at
// ~191 CSS px, so dist copies are downscaled to 512px wide with sharp (already
// a runtime dependency). Any failure falls back to copying the original file,
// so image handling can never break the build.
const oversizedImages = ['digi-prime-nepal-logo.png', 'logo.png', 'logo mm.png'];

async function copyPublicFile(file) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) return;
  const dest = path.join(output, file);
  if (file.endsWith('.css')) {
    const original = fs.readFileSync(source, 'utf8');
    const minified = minifyCss(original);
    fs.writeFileSync(dest, minified);
    const saved = original.length ? Math.round((1 - minified.length / original.length) * 100) : 0;
    console.log(`Minified ${file}: ${original.length} -> ${minified.length} bytes (-${saved}%)`);
    return;
  }
  if (oversizedImages.includes(file)) {
    try {
      const sharp = require('sharp');
      await sharp(source).resize({ width: 512, withoutEnlargement: true }).toFile(dest);
      console.log(`Resized ${file}: ${fs.statSync(source).size} -> ${fs.statSync(dest).size} bytes`);
      return;
    } catch (err) {
      console.warn(`Image resize unavailable for ${file} (${err.message}); copying original.`);
    }
  }
  fs.copyFileSync(source, dest);
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  for (const file of publicFiles) {
    await copyPublicFile(file);
  }

  // Copy static uploads to dist if present
  const uploadsSource = path.join(root, 'uploads');
  const uploadsDest = path.join(output, 'uploads');
  if (fs.existsSync(uploadsSource)) {
    fs.mkdirSync(uploadsDest, { recursive: true });
    for (const item of fs.readdirSync(uploadsSource)) {
      const srcFile = path.join(uploadsSource, item);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, path.join(uploadsDest, item));
      }
    }
  }
  // Copy bundled brand logo banners to dist if present
  const logosSource = path.join(root, 'logos');
  const logosDest = path.join(output, 'logos');
  if (fs.existsSync(logosSource)) {
    fs.mkdirSync(logosDest, { recursive: true });
    for (const item of fs.readdirSync(logosSource)) {
      const srcFile = path.join(logosSource, item);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, path.join(logosDest, item));
      }
    }
  }
  console.log('Public site build complete. Server source and private data are excluded.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
