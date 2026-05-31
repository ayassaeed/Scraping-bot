# Scraping AI Bot — Cloud Edition (v2)

A production-ready, cloud-hosted web scraping API + browser UI.
Access it from any device — laptop, phone, tablet — no local setup required.

---

## What's new in v2

| Feature | v1 (local) | v2 (cloud) |
|---|---|---|
| Job persistence | In-memory (lost on restart) | **Redis** (survives restarts) |
| Multi-device access | ❌ localhost only | ✅ Any browser, any device |
| Browser UI | ❌ Needs frontend separately | ✅ Served by Express |
| Auth | ❌ Open | ✅ API key auth |
| Health check | ❌ | ✅ `/api/health` |
| Docker | Basic | Production-hardened, non-root |

---

## Deploy in 5 minutes

### Option A — Railway (recommended, easiest)

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a **Redis** plugin (one click in Railway dashboard)
4. Set these environment variables in Railway:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   API_KEYS          = your-secret-key-1,your-secret-key-2
   ```
5. Deploy — Railway auto-detects `railway.json` and `Dockerfile`
6. Copy the public URL — open it on any device

**Cost**: Free tier gives ~$5/month credit. Redis plugin is free up to 25MB.

---

### Option B — Render

1. Push to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your repo — Render reads `render.yaml` automatically
4. Set `ANTHROPIC_API_KEY` and `API_KEYS` in the dashboard (Environment tab)
5. Click Deploy

**Cost**: Free tier (web service sleeps after 15min idle, wakes on request).

---

### Option C — Fly.io

```bash
# Install flyctl, then:
fly auth login
fly launch          # auto-detects Dockerfile, creates fly.toml
fly redis create    # create Redis instance
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly secrets set API_KEYS=your-key-1,your-key-2
fly secrets set REDIS_URL=<redis-url-from-above>
fly deploy
```

**Cost**: Free tier — 3 shared VMs, 3GB storage.

---

### Option D — Docker on any VPS (DigitalOcean, Hetzner, etc.)

```bash
# On your server:
git clone your-repo && cd scraping-ai-bot-cloud
cp .env.example .env && nano .env    # fill in values

# Start with Docker Compose
docker compose up -d
```

Add a `docker-compose.yml`:
```yaml
version: '3.9'
services:
  bot:
    build: .
    ports: ["3001:3001"]
    env_file: .env
    depends_on: [redis]
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes: [redis-data:/data]

volumes:
  redis-data:
```

---

## Using the web UI

1. Open your cloud URL in any browser
2. If you set `API_KEYS`, paste your key in the top-right field
3. Enter a URL + describe what to extract → click **Run scraper**
4. Watch live logs, see extracted data, copy/download results
5. Job history shows in the left sidebar — click any job to reload it

The UI works on mobile too — the sidebar hides on small screens.

---

## API usage (from code)

```bash
# From anywhere on the internet
curl -X POST https://your-app.railway.app/api/scrape/sync \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-key-1" \
  -d '{
    "url": "https://news.ycombinator.com",
    "goal": "top story titles, points, and author names",
    "format": "json"
  }'
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Your Claude API key |
| `REDIS_URL` | Recommended | Redis connection string. Falls back to in-memory if unset |
| `API_KEYS` | Recommended | Comma-separated auth keys. Unset = no auth |
| `PORT` | No | Default: 3001 |
| `NODE_ENV` | No | `production` or `development` |
| `RATE_LIMIT_PER_MIN` | No | Default: 20 requests/min per key |
| `ALLOWED_ORIGINS` | No | CORS whitelist (comma-separated) |

### Generating API keys

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

---

## Project structure

```
├── src/
│   ├── server.js              Express app — serves UI + API
│   ├── routes/
│   │   ├── scrape.js          POST /api/scrape, /api/scrape/sync
│   │   └── jobs.js            GET/DELETE /api/jobs/:id
│   ├── services/
│   │   ├── scraper.js         Playwright + Cheerio + AI extraction
│   │   ├── ai.js              Claude SDK wrapper
│   │   └── jobStore.js        Redis-backed job store (+ in-memory fallback)
│   ├── utils/
│   │   ├── formatter.js       JSON / CSV / Markdown / text
│   │   └── logger.js          Winston
│   └── middleware/
│       ├── auth.js            API key validation
│       └── errorHandler.js    Global error handler
├── public/
│   └── index.html             Browser UI (served by Express)
├── Dockerfile                 Production container
├── railway.json               Railway deployment config
├── render.yaml                Render Blueprint config
└── .env.example               All env vars documented
```
