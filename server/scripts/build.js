const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const output = path.join(root, 'dist');
const publicFiles = [
  'index.html', 'admin.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html', 'refund.html',
  'style.css', 'animations.css', 'auth.css', 'storefront-polish.css', 'payment-overrides.css', 'store-ui.css', 'mobile-ux.css',
  'responsive-fix.css', 'card-premium.css', 'gaming-trust.css', 'admin.css', 'pages.css', 'tokens.css',
  'app.js', 'admin.js', 'pages.js', 'logo.png', 'digi-prime-nepal-logo.png', 'logo mm.png', 'dashain-sale-banner.png', 'dashain-sale-banner.jpg',
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

// Homepage stylesheets in the exact order index.html links them. The build
// concatenates their minified contents into a single dist/site.css and points
// dist/index.html at it, so the homepage makes one CSS request instead of
// eleven render-blocking ones. Cascade order is unchanged, and none of these
// files use @import or relative url() references, so concatenation is safe.
// The individual files are still emitted for the other pages.
const homepageCssBundle = [
  'tokens.css', 'style.css', 'animations.css', 'auth.css', 'storefront-polish.css',
  'payment-overrides.css', 'store-ui.css', 'mobile-ux.css', 'card-premium.css',
  'gaming-trust.css', 'responsive-fix.css'
];

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

function bundleHomepageCss() {
  const parts = [];
  for (const file of homepageCssBundle) {
    const source = path.join(root, file);
    if (!fs.existsSync(source)) continue;
    parts.push(minifyCss(fs.readFileSync(source, 'utf8')));
  }
  if (!parts.length) return;
  fs.writeFileSync(path.join(output, 'site.css'), parts.join('\n'));
  const indexPath = path.join(output, 'index.html');
  if (!fs.existsSync(indexPath)) return;
  const html = fs.readFileSync(indexPath, 'utf8');
  const block = /<link rel="stylesheet" href="tokens\.css[^>]*>[\s\S]*?<link rel="stylesheet" href="responsive-fix\.css[^>]*>/;
  if (!block.test(html)) {
    console.warn('Homepage CSS link block not found; leaving dist/index.html unchanged.');
    return;
  }
  fs.writeFileSync(indexPath, html.replace(block, '<link rel="stylesheet" href="site.css?v=1">'));
  console.log(`Bundled ${parts.length} homepage stylesheets into site.css`);
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  for (const file of publicFiles) {
    await copyPublicFile(file);
  }
  bundleHomepageCss();

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
  console.log('Public site build complete. Server source and private data are excluded.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
