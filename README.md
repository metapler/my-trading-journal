# Trading Journal — Crypto Trading Journal (MVP)

Personal web app to record and monitor crypto trades. Phases 1–26 done (multi-user auth enforced, testing + data consistency + API resilience + security + logging verified):
React + Vite + TypeScript frontend (app shell + live dashboard + Add Token
search/save modal + BUY/SELL transaction modal + ledger history page + token
detail page with position panel, in-page trade journal, and handoff-driven
first BUY + DCA simulator with before/after projection and add-as-transaction
CTA + journal list + priced watchlist with neutral target distance + performance
analytics with closed-trade gating; centralized adaptive formatters, tabular
numerals, color+sign PnL, monospace contracts, mobile cards with stale flags),
Express + TypeScript backend on the host, PostgreSQL via Docker, Prisma
ledger-first schema migrated + seeded, Decimal calculation engine, provider
abstraction (Dexscreener + CoinMarketCap), TTL price cache, full REST API
(assets, transactions, prices, positions, portfolio, DCA, journal, watchlist,
analytics) with validation hardening + session-cookie auth (bcrypt, CSRF,
per-user ownership on all data routes).

## Requirements

- Node.js (v20+ recommended)
- npm
- Docker + Docker Compose (from Phase 2 onward)

## Project structure

```text
trading-journal/
├─ frontend/        # React + Vite + TS (port 5173)
├─ backend/         # Express + TS (port 3001, GET /api/health)
│  ├─ prisma/        # schema.prisma, migrations/, seed.ts
│  └─ src/           # app/server/config/controllers/middleware
├─ docker-compose.yml  # ONLY postgres service
├─ PLAN.md
├─ README.md
└─ .gitignore
```

## First run

Database (root, one terminal or background):

```bash
docker compose up -d
docker compose ps
docker compose logs -f postgres
```

Terminal 1 — backend:

```bash
cd backend
npm install
cp .env.example .env    # set AUTH_SECRET (min 32 random chars; required in prod)
npm run db:migrate      # prisma migrate dev (includes user_auth migration)
npm run db:seed         # dev@local.test / DevPassword123! + SOL ACTIVE + BTC WATCHLIST
npm run dev
# health check: http://localhost:3001/api/health -> { "status": "ok" }
# login: POST /api/auth/login (session cookie is HTTP-only; mutations need x-csrf-token)
```

Terminal 2 — frontend:

```bash
cd frontend
npm install
npm run dev
# open the URL Vite prints, default http://localhost:5173
# frontend proxies /api -> http://localhost:3001 during dev
```

## Useful commands

Backend (`cd backend`):

```text
npm run dev         # tsx watch src/server.ts (requires AUTH_SECRET in .env)
npm run build       # prisma generate + tsc -> dist/
npm start           # node dist/server.js
npm run typecheck   # tsc --noEmit
npm run lint        # typecheck (ESLint lands later if needed)
npm test            # vitest run (unit + integration, isolated test DB)
npm run db:migrate  # prisma migrate dev
npm run db:seed     # tsx prisma/seed.ts (idempotent)
npm run db:reset    # prisma migrate reset (wipes data)
npm run db:studio   # prisma studio
```

Rate limits (per IP, in-memory): general 300/min, mutations 120/min,
search + prices 60/min. Errors are always `{ error: { code, message } }` —
including 429 `RATE_LIMITED`, 413 `PAYLOAD_TOO_LARGE` (>100kb body), and
production 500s which never leak stack traces.

Database (`root`):

```text
docker compose up -d            # start postgres only
docker compose down             # stop
docker compose logs -f postgres # tail logs
```

Backup before any risky operation (PLAN §25):

```bash
docker compose exec -T postgres pg_dump -U trading_journal trading_journal > backup-$(date +%Y%m%d).sql
# restore:
docker compose exec -T postgres psql -U trading_journal -d trading_journal < backup-YYYYMMDD.sql
```

Frontend (`cd frontend`):

```text
npm run dev         # vite dev server :5173
npm run build       # tsc -b + vite build
npm run preview     # preview production build
```

## Environment

- `backend/.env.example` — copy to `backend/.env` (Phase 2: `DATABASE_URL`, provider keys).
- `frontend/.env.example` — copy to `frontend/.env` if you need `VITE_BACKEND_URL` override.
- Never commit `.env` files.

## Portfolio history (REDESIGN Phase 2 — observed snapshots)

- History starts when observation starts: the backend captures one
  `portfolio_snapshots` row per owner per 5-minute UTC bucket (first-write-wins
  on `(userId, bucketStart)`; duplicates never overwrite). No backfill, no
  fixture data — `GET /api/portfolio/history?range=24h|7d|30d|90d|all`
  returns `observed_snapshots` with `coverage: full|limited|none`.
- The capture job runs inside the existing backend process
  (`startSnapshotJob`, every 5 min, pg advisory lock for multi-instance);
  no new Docker service, no Redis. It reuses the price cache/provider
  abstraction — never per-tick provider calls, never a row per frontend poll.
- `GET /api/portfolio/history` is per-user scoped, validates the range enum
  (400 otherwise), sorts by timestamp, and caps at ~600 points via
  last-valid-per-bucket aggregation (gaps preserved, never forward-filled).
  Frontend polling for history is 5 min (`usePortfolioHistory`), separate
  from the 20s price cadence.
- Transaction create/update/delete bumps `portfolio_history_state`
  (`ledgerRevision`); backdated creates and all edits/deletes additionally
  stamp sticky `invalidatedFrom` so the UI marks "history before ledger
  correction" instead of silently recomputing.
- After `npm run db:migrate`, restart the backend so the job picks up the
  new tables. The test DB needs the same migration before `npm test`.

## Security posture (PLAN §25 checklist)

- Helmet headers on; `x-powered-by` off; `trust proxy: 1` so rate limits key on the real client IP.
- CORS: single configured origin + credentials (never `*`).
- Provider keys (`COINMARKETCAP_API_KEY`) and `AUTH_SECRET` live only in `backend/.env` (gitignored) — zero secrets in `frontend/`.
- Body limit 100kb → 413 `PAYLOAD_TOO_LARGE`; malformed JSON → 400 `VALIDATION_ERROR`.
- All input Zod-validated server-side; no raw SQL outside generated Prisma client typings.
- Production errors are `{ error: { code, message } }` with no stack traces.
- Rate limits: general 300/min, mutations 120/min, search/prices 60/min, auth 10/min.
- Audit: `npm audit --omit=dev` clean for app deps (Prisma CLI bundles an unused mysql2, not reachable from the Postgres runtime).
- Auth enforced on all data routes: bcrypt sessions (HTTP-only cookie) + per-request CSRF + per-user ownership (foreign IDs → 404).
- Logging: request id (minted/echoed via `x-request-id`), method/path/status/duration via pino-http with body-stripping serializers; provider failures + exceptions logged with codes; passwords/API keys/session tokens/CSRF/cookies redacted at serialization.

## Rules for this repo (from PLAN.md §37)

- PostgreSQL is the ONLY Docker service. Never Dockerize frontend/backend for MVP.
- Transaction ledger is source of truth; never use ticker as unique token identity.
- All financial math must use Decimal (Phase 4+), never raw JS floats.
- Never expose provider API keys to the frontend.
