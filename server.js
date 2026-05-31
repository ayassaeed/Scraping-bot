import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { scrapeRouter } from './routes/scrape.js';
import { jobRouter } from './routes/jobs.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ── Security ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'DELETE'],
}));

app.use(express.json({ limit: '1mb' }));

// ── Serve static web UI ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Rate limiting (per IP) ─────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_PER_MIN || '20'),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip,
  message: { error: 'Rate limit exceeded. Try again in a minute.' },
});
app.use('/api/', apiLimiter);

// ── Auth (API key, skipped for UI routes) ─────────────────────────
app.use('/api/', authMiddleware);

// ── API routes ─────────────────────────────────────────────────────
app.use('/api/scrape', scrapeRouter);
app.use('/api/jobs', jobRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
  });
});

// ── SPA fallback — serve index.html for all non-API routes ─────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Error handler ──────────────────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`🤖 Scraping AI Bot v2 running on http://localhost:${PORT}`);
  logger.info(`   Auth: ${process.env.API_KEYS ? 'enabled' : 'disabled (set API_KEYS to enable)'}`);
});

export default app;
