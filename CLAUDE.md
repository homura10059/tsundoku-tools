# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Lint & format check (Biome)
pnpm run check           # check only
pnpm run check:write     # auto-fix

# Type-check all packages
pnpm run type-check

# Build (web only has a build artifact; Workers are deployed via wrangler)
pnpm run build

# Local dev servers (run in separate terminals)
cd apps/api && pnpm dev              # Hono API Worker → http://localhost:8787
cd apps/web && pnpm dev              # Astro → http://localhost:4321
cd apps/scraper-worker && pnpm dev   # Cron Worker (manual trigger below)

# Manually trigger the scraper cron in dev
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"

# D1 database migrations
pnpm --filter @tsundoku-tools/db run db:migrate:local   # local SQLite
pnpm --filter @tsundoku-tools/db run db:migrate:remote  # Cloudflare D1

# Generate new migration files after schema changes
pnpm --filter @tsundoku-tools/db run db:generate

# Deploy individual apps
cd apps/api && pnpm deploy
cd apps/scraper-worker && pnpm deploy
cd apps/web && pnpm build && npx wrangler pages deploy dist --project-name tsundoku-tools-web
```

**Pre-push hook** runs `biome ci` + `pnpm type-check` automatically. CI runs the same checks plus `astro build` on PRs.

## Architecture

Full-TypeScript monorepo targeting **Cloudflare's platform exclusively**: Workers (API + scraper), D1 (SQLite-compatible DB), Pages (static frontend). No Node.js server; no Docker.

### Package dependency graph

```
apps/web          → @tsundoku-tools/shared
apps/api          → @tsundoku-tools/db, shared
apps/scraper-worker → @tsundoku-tools/db, scraper, notifier, shared
packages/notifier → @tsundoku-tools/db, shared
packages/scraper  → @tsundoku-tools/shared
packages/db       → drizzle-orm (external)
packages/shared   → (no deps)
```

### Data flow

The scraper-worker's `scheduled()` handler is the system's heartbeat (every 4 hours via Cron Trigger):
1. Fetches active wishlists from D1
2. Calls `packages/scraper` → `scrapeWishlist()` to get ASINs from wishlist HTML
3. Calls `scrapeProduct()` per ASIN at **1 RPS** (token bucket in `rate-limiter.ts`)
4. Writes `products` upsert + `price_snapshots` insert to D1
5. Calls `packages/notifier` → `analyzeProduct()` comparing the latest 2 snapshots
6. Sends Discord Webhook embed if thresholds are crossed and cooldown has elapsed
7. Records sent notifications in `notifications` table (used for cooldown checks)

The API Worker (`apps/api`) is a separate Hono app that only serves read/write REST endpoints for the web UI. It shares the same D1 database via binding.

### Key design constraints

- **Scraper uses `fetch` + `HTMLRewriter`** (Cloudflare Workers built-ins), not Playwright. Selectors live in `packages/scraper/src/product.ts` and `wishlist.ts` and will need updating when Amazon changes its DOM.
- **No compiled `dist/`**: all workspace packages export TypeScript source directly (`"exports": { ".": "./src/index.ts" }`). Wrangler (esbuild) and Vite resolve TS source at bundle time.
- **D1 schema** is the single source of truth in `packages/db/src/schema.ts`. The migration SQL in `packages/db/src/migrations/0001_init.sql` must be kept in sync manually when the schema changes (run `db:generate` to regenerate).
- **All timestamps** are stored as ISO-8601 text strings (D1/SQLite has no native datetime type).
- **`crypto.randomUUID()`** (Workers global) is used for all ID generation — not `node:crypto`.

### Notification logic

`packages/notifier/src/analyzer.ts` compares `snapshots[0]` (current) vs `snapshots[1]` (previous). Thresholds are env vars on the scraper-worker: `NOTIFY_MIN_PRICE_DROP_PCT` (default 5), `NOTIFY_MIN_POINT_CHANGE` (default 50), `NOTIFY_COOLDOWN_HOURS` (default 6). `DISCORD_WEBHOOK_URL` must be set as a Wrangler secret.

### Web UI

Astro with `output: "static"`. Interactive parts are React components mounted with `client:only="react"` — they fetch from the API Worker URL configured via `PUBLIC_API_URL` env var. `public/_redirects` routes all paths to `index.html` for SPA behaviour on Cloudflare Pages.
