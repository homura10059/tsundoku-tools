# AGENTS.md

Amazon.co.jp wishlist price tracker built on Cloudflare Workers + D1 + Pages. Monitors wishlists on a 4-hour cron, stores price/point snapshots, and sends Discord notifications on price drops.

## Setup

```bash
pnpm install
```

## Development

Run each server in a separate terminal:

```bash
cd apps/api && pnpm dev              # Hono API Worker → http://localhost:8787
cd apps/web && pnpm dev              # Astro frontend → http://localhost:4321
cd apps/scraper-worker && pnpm dev   # Cron Worker
```

Manually trigger the scraper cron in dev:

```bash
curl "http://localhost:8787/__scheduled?cron=0+*+*+*+*"
```

## Testing & Quality

```bash
pnpm run check           # Biome lint + format check
pnpm run check:write     # Biome auto-fix
pnpm run type-check      # TypeScript check across all packages
```

Pre-push hook runs `biome ci` + `pnpm type-check` automatically. CI runs the same checks plus `astro build` on PRs.

## Build & Deploy

```bash
# Build (web only; Workers deploy via wrangler)
pnpm run build

# Deploy individual apps
cd apps/api && pnpm deploy
cd apps/scraper-worker && pnpm deploy
cd apps/web && pnpm build && npx wrangler pages deploy dist --project-name tsundoku-tools-web

# D1 database migrations
pnpm --filter @tsundoku-tools/db run db:migrate:local    # local SQLite
pnpm --filter @tsundoku-tools/db run db:migrate:remote   # Cloudflare D1

# Regenerate migration SQL after schema changes
pnpm --filter @tsundoku-tools/db run db:generate
```

## Architecture

Full-TypeScript monorepo. All compute runs on **Cloudflare exclusively** (Workers, D1, Pages). No Node.js server; no Docker.

### Package dependency graph

```
apps/web             → @tsundoku-tools/shared
apps/api             → @tsundoku-tools/db, shared
apps/scraper-worker  → @tsundoku-tools/db, scraper, notifier, shared
packages/notifier    → @tsundoku-tools/db, shared
packages/scraper     → @tsundoku-tools/shared
packages/db          → drizzle-orm
packages/shared      → (none)
```

### Data flow

`scraper-worker`'s `scheduled()` handler runs every 4 hours:

1. Fetch active wishlists from D1
2. `scrapeWishlist()` → extract ASINs from wishlist HTML
3. `scrapeProduct()` per ASIN at **1 RPS** (token bucket in `rate-limiter.ts`)
4. Upsert `products` + insert `price_snapshots` into D1
5. `analyzeProduct()` compares latest 2 snapshots
6. Send Discord Webhook embed if thresholds crossed and cooldown elapsed
7. Record notification in `notifications` table (used for cooldown checks)

`apps/api` is a separate Hono app serving REST endpoints for the web UI. Shares the same D1 binding.

## Key Constraints

Non-obvious decisions that affect how you write code here:

- **Scraper runtime**: uses `fetch` + `HTMLRewriter` (Cloudflare built-ins), NOT Playwright. DOM selectors live in `packages/scraper/src/product.ts` and `packages/scraper/src/wishlist.ts`.
- **No compiled dist/**: workspace packages export TypeScript source directly (`"exports": { ".": "./src/index.ts" }`). Wrangler (esbuild) and Vite resolve TS at bundle time — never add a build step to packages.
- **D1 schema**: single source of truth is `packages/db/src/schema.ts`. Migration SQL in `packages/db/src/migrations/` must be kept in sync — run `db:generate` after schema changes.
- **Timestamps**: stored as ISO-8601 text strings. D1/SQLite has no native datetime type.
- **ID generation**: use `crypto.randomUUID()` (Workers global), NOT `node:crypto`.
- **Notification thresholds**: env vars on scraper-worker — `NOTIFY_MIN_PRICE_DROP_PCT` (default 5), `NOTIFY_MIN_POINT_CHANGE` (default 50), `NOTIFY_COOLDOWN_HOURS` (default 6). `DISCORD_WEBHOOK_URL` is a Wrangler secret.
- **Notification logic**: `packages/notifier/src/analyzer.ts` compares `snapshots[0]` (current) vs `snapshots[1]` (previous).
- **Web UI**: Astro `output: "static"`. React islands use `client:only="react"`. API URL via `PUBLIC_API_URL` env var. SPA routing via `public/_redirects`.

## Code Style

Enforced by Biome (`biome.json`) and TypeScript strict mode:

- Double quotes, semicolons required, trailing commas
- 2-space indent, 100-char line width
- `noUnusedVariables`: error; `noExplicitAny`: warn

## Agentic Permissions

**Run freely** (no approval needed):

- Read/write files, run lint, type-check
- `pnpm run check:write`
- `db:migrate:local`, `db:generate`
- Local dev servers

**Require explicit approval before running:**

- `pnpm deploy` or any wrangler deploy (production)
- `db:migrate:remote` (modifies live Cloudflare D1)
- Setting/rotating Wrangler secrets
