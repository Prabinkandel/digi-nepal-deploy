require('./config/dns')();
const dns = require('node:dns');
if (!process.env.VERCEL) {
  // NB: dns.setServers must resolve before it is called, otherwise SRV lookup
  // starts on the old server list. Delay it until the next event-loop tick.
  try {
    setImmediate(() => {
      try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (e) { void e; }
    });
  } catch (e) { void e; }
}

const path = require('path');
require('dotenv').config({ path: [path.join(__dirname, '../.env'), path.join(__dirname, '.env')], quiet: true });
const express = require('express');

// Patch Express 4 router layer to catch unhandled async errors and pass them to error middleware
try {
  const Layer = require('express/lib/router/layer');
  const originalHandleRequest = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function (req, res, next) {
    const fn = this.handle;
    if (fn.length > 3) return originalHandleRequest.apply(this, arguments);
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') {
        result.catch(next);
      }
      return result;
    } catch (err) {
      return next(err);
    }
  };
} catch (e) {
  void e;
}

const session = require('express-session');
const helmet = require('helmet');
const { csrfSynchronisedProtection } = require('./middleware/csrf');

const connectDB = require('./config/db');

// Warm up DB connection in background
connectDB().catch(err => {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[DB Initial Warmup]', err.message);
  }
});

const app = express();
const PORT = process.env.PORT || 3001;
let sessionStore = new session.MemoryStore();
if (process.env.MONGO_URI && process.env.NODE_ENV !== 'test') {
  try {
    const connectMongo = require('connect-mongo');
    const storeOptions = { mongoUrl: process.env.MONGO_URI, stringify: false };
    let store;
    if (typeof connectMongo.create === 'function') {
      store = connectMongo.create(storeOptions);
    } else if (connectMongo.default && typeof connectMongo.default.create === 'function') {
      store = connectMongo.default.create(storeOptions);
    } else if (connectMongo.MongoStore && typeof connectMongo.MongoStore.create === 'function') {
      store = connectMongo.MongoStore.create(storeOptions);
    } else if (typeof connectMongo === 'function') {
      const OldMongoStore = connectMongo(session);
      store = new OldMongoStore({ url: process.env.MONGO_URI, stringify: false });
    }
    if (store) {
      if (store.collectionP && typeof store.collectionP.catch === 'function') {
        store.collectionP.catch(err => console.error('[Session Store DB Warning]', err.message));
      }
      if (typeof store.on === 'function') {
        store.on('error', err => console.error('[Session Store Warning]', err.message));
      }
      sessionStore = store;
    }
  } catch (err) {
    console.error('[Session] Error initializing MongoStore', err);
  }
}

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'production' || process.env.VERCEL) app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: { directives: {
    defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'https:', 'data:'], connectSrc: ["'self'"],
    objectSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'self'"], frameAncestors: ["'none'"]
  }},
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'no-referrer' }
}));

// Pre-DB Health Check so uptime checks and cold starts never hang
app.get('/api/health', (req, res) => {
  const mongoose = require('mongoose');
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({
    status: 'ok',
    database: dbStates[mongoose.connection.readyState] || 'unknown',
    env: process.env.NODE_ENV || 'development'
  });
});

app.use((req, res, next) => {
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState === 1) return next();
  connectDB().then(() => next()).catch(err => {
    console.error('[DB Error]', err.message);
    res.status(503).json({ error: 'Database service unavailable. Please check configuration.' });
  });
});

app.use(express.json({ limit: '128kb' }));
app.use(express.urlencoded({ limit: '128kb', extended: false }));
app.use(session({
  name: process.env.NODE_ENV === 'production' ? '__Host-dn.sid' : 'dn.sid',
  secret: process.env.SESSION_SECRET || 'development-local-secret-change-me-please',
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 1000
  }
}));

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const originHeader = req.get('origin');
    if (originHeader) {
      try {
        const originUrl = new URL(originHeader);
        const hostHeader = req.get('host');
        const matchesHost = originUrl.host === hostHeader;
        const matchesAppUrl = process.env.APP_URL && originUrl.origin === new URL(process.env.APP_URL).origin;
        const isLocal = originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1';
        const isVercel = originUrl.hostname.endsWith('.vercel.app');
        if (!matchesHost && !matchesAppUrl && !isLocal && !isVercel) {
          return res.status(403).json({ error: 'This request came from another site.' });
        }
      } catch {
        return res.status(403).json({ error: 'Invalid origin header.' });
      }
    }
  }
  next();
});

// Serve uploaded images with short cache
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '7d', immutable: false
}));
// Serve static assets with long cache (CSS, JS, images, fonts, SVG)
app.use(express.static(path.join(__dirname, '..'), {
  setHeaders(res, filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    if (['svg','png','jpg','jpeg','webp','gif','woff','woff2','ttf','ico'].includes(ext)) {
      res.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400'); // 7 days for images/fonts
    } else if (['css','js'].includes(ext)) {
      res.set('Cache-Control', 'no-cache'); // always revalidate CSS/JS so edits are live
    } else if (ext === 'html') {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));

// ── ROUTES ────────────────────────────────────────────────────────────────────
// Authentication requests establish a session; all other state-changing API calls require a per-session CSRF token.
app.use('/api', (req, res, next) => {
  const publicAuthAction = req.method === 'POST' && /^\/auth\/(login|register|send-otp|login-otp|verify-otp|forgot-password|reset-password)$/.test(req.path);
  if (publicAuthAction || (req.method === 'GET' && req.path === '/auth/csrf')) return next();
  return csrfSynchronisedProtection(req, res, next);
});
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/offers',     require('./routes/offers'));
app.use('/api/campaigns',  require('./routes/campaigns'));
app.use('/api/upload',     require('./routes/upload'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/payments',   require('./routes/payments'));
app.use('/api/settings',   require('./routes/settings'));
app.use('/api/media',      require('./routes/media'));


// ── CONTACT API ───────────────────────────────────────────────────────────────
app.use('/api/contact',    require('./routes/contact'));

// ── STATIC PAGES ──────────────────────────────────────────────────────────────
const staticPages = { '/about': 'about.html', '/contact': 'contact.html', '/privacy': 'privacy.html', '/terms': 'terms.html', '/refund': 'refund.html', '/admin': 'admin.html' };
for (const [route, file] of Object.entries(staticPages)) {
  app.get(route, (req, res) => res.sendFile(path.join(__dirname, '..', file)));
}

// ── SEO FILES ─────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => res.sendFile(path.join(__dirname, '..', 'robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(__dirname, '..', 'sitemap.xml')));

// Keep API failures machine-readable and avoid exposing stack traces or internals.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const isApi = (req.path && req.path.startsWith('/api/')) ||
                (req.originalUrl && req.originalUrl.startsWith('/api/')) ||
                (req.baseUrl && req.baseUrl.startsWith('/api'));
  if (isApi) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : (error.name === 'ZodError' ? 400 : 500);
    const message = error.name === 'ZodError' && error.errors?.[0]?.message
      ? error.errors[0].message
      : (status === 500 ? 'Something went wrong. Please try again.' : (error.message || 'Request failed.'));
    if (status === 500) console.error('[API 500 ERROR]', req.method, req.originalUrl || req.path, error);
    return res.status(status).json({ error: message });
  }
  return next(error);
});
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found.' });
  const indexPath = path.join(__dirname, '../index.html');
  try { if (require('node:fs').existsSync(indexPath)) return res.status(404).sendFile(indexPath); } catch (e) { void e; }
  res.redirect('/');
});

// ── START ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  connectDB().then(() => app.listen(PORT, () => {
    console.log(`\n🚀 Digi Prime Nepal server running at http://localhost:${PORT}`);
    console.log(`📦 API endpoints at http://localhost:${PORT}/api`);
    console.log(`🖥️  Admin panel at http://localhost:${PORT}/admin`);
  })).catch(() => { console.error('Database startup failed. Check MONGO_URI and network access.'); process.exitCode = 1; });
}

module.exports = app;
