const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const output = path.join(root, 'dist');
const publicFiles = [
  'index.html', 'admin.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html', 'refund.html',
  'style.css', 'animations.css', 'auth.css', 'storefront-polish.css', 'payment-overrides.css', 'store-ui.css', 'mobile-ux.css',
  'responsive-fix.css', 'card-premium.css', 'admin.css', 'pages.css', 'tokens.css',
  'app.js', 'admin.js', 'logo.png', 'digi-prime-nepal-logo.png', 'dashain-sale-banner.png', 'dashain-sale-banner.jpg',
  'robots.txt', 'sitemap.xml'
];

fs.mkdirSync(output, { recursive: true });
for (const file of publicFiles) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(output, file));
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
console.log('Public site build complete. Server source and private data are excluded.');
