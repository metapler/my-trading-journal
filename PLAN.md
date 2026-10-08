# PLAN.md — Crypto Trading Journal

## 0. Tujuan Proyek

Bangun aplikasi web personal untuk mencatat dan memantau trading crypto dengan fitur utama:

- Menambahkan token berdasarkan nama, ticker, atau smart contract.
- Mendukung multi-chain dan menghindari salah identifikasi token hanya berdasarkan ticker.
- Mencatat transaksi BUY/DCA/SELL sebagai source of truth.
- Mengambil harga token terkini dari provider eksternal seperti Dexscreener dan/atau CoinMarketCap.
- Menghitung posisi secara otomatis:
  - quantity tersisa
  - total modal
  - average buy
  - current value
  - unrealized PnL
  - realized PnL
  - PnL %
  - harga BEP
  - persentase kenaikan yang dibutuhkan untuk kembali ke BEP
- Mendukung DCA simulator sebelum user benar-benar menambahkan transaksi baru.
- Menyediakan dashboard, halaman detail token, journal, watchlist, dan basic analytics.
- Menjadi fondasi yang mudah dikembangkan ke wallet import, alerts, analytics lanjutan, dan AI insights.

---

# 1. Stack yang Digunakan

## Frontend

- React
- Vite
- TypeScript
- React Router
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS
- Recharts atau Lightweight Charts untuk visualisasi sederhana
- Lucide React untuk icon

## Backend

- Node.js
- TypeScript
- Express
- Prisma ORM
- PostgreSQL
- Zod untuk request validation
- Axios/fetch untuk external API
- Pino untuk logging
- Helmet
- CORS
- Decimal.js atau Prisma Decimal untuk semua perhitungan finansial

## Database

- PostgreSQL
- PostgreSQL adalah SATU-SATUNYA service yang berjalan di Docker.
- Frontend dan backend berjalan langsung di host machine.

## Testing

- Vitest
- React Testing Library
- Supertest untuk backend API

---

# 2. Arsitektur Repository

Gunakan struktur berikut:

```text
trading-journal/
├─ frontend/
│  ├─ src/
│  │  ├─ api/
│  │  ├─ components/
│  │  ├─ features/
│  │  ├─ hooks/
│  │  ├─ layouts/
│  │  ├─ lib/
│  │  ├─ pages/
│  │  ├─ routes/
│  │  ├─ types/
│  │  └─ main.tsx
│  ├─ .env.example
│  └─ package.json
│
├─ backend/
│  ├─ prisma/
│  │  ├─ schema.prisma
│  │  └─ seed.ts
│  ├─ src/
│  │  ├─ config/
│  │  ├─ controllers/
│  │  ├─ middleware/
│  │  ├─ modules/
│  │  │  ├─ assets/
│  │  │  ├─ portfolio/
│  │  │  ├─ prices/
│  │  │  ├─ transactions/
│  │  │  ├─ journal/
│  │  │  └─ watchlist/
│  │  ├─ providers/
│  │  │  ├─ dexscreener/
│  │  │  └─ coinmarketcap/
│  │  ├─ services/
│  │  ├─ utils/
│  │  ├─ app.ts
│  │  └─ server.ts
│  ├─ tests/
│  ├─ .env.example
│  └─ package.json
│
├─ docker-compose.yml
├─ .gitignore
├─ README.md
└─ PLAN.md
```

Jangan membuat frontend/backend menjadi Docker container untuk MVP.

---

# 3. Prinsip Arsitektur Penting

## 3.1 Transaction adalah Source of Truth

JANGAN menyimpan `avgBuy`, `PnL`, atau `currentPosition` sebagai nilai manual utama.

Simpan transaksi:

- BUY
- SELL

DCA adalah BUY tambahan.

Nilai berikut dihitung dari transaksi:

- quantity tersisa
- average buy
- cost basis
- realized PnL
- unrealized PnL
- BEP
- total invested

Dengan pendekatan ini, histori posisi tetap dapat direkonstruksi kapan pun.

---

## 3.2 Jangan Identifikasi Token Berdasarkan Ticker Saja

Contoh ticker seperti `PEPE`, `ABC`, atau `AI` dapat dimiliki oleh banyak token berbeda.

Identitas utama token DEX harus minimal:

```text
chain + contractAddress
```

Untuk token provider terpusat yang tidak menggunakan kontrak sebagai identifier utama, simpan juga provider-specific ID.

---

## 3.3 Semua Perhitungan Finansial Menggunakan Decimal

JANGAN menggunakan JavaScript floating-point biasa untuk perhitungan uang.

Tidak boleh:

```ts
const pnl = 0.1 + 0.2;
```

Gunakan:

- Prisma Decimal
- decimal.js

Harga token crypto dapat memiliki banyak digit di belakang koma.

---

# 4. Phase 1 — Bootstrap Repository

## Task

1. Buat root project.
2. Buat aplikasi Vite React TypeScript di `/frontend`.
3. Buat Node.js TypeScript Express app di `/backend`.
4. Tambahkan root `.gitignore`.
5. Tambahkan `README.md`.
6. Tambahkan script development yang jelas di masing-masing package.
7. Pastikan frontend dan backend dapat berjalan bersamaan di dua terminal.

## Backend minimum

Implementasikan:

```http
GET /api/health
```

Response:

```json
{
  "status": "ok"
}
```

## Acceptance Criteria

- `npm run dev` di frontend berhasil.
- `npm run dev` di backend berhasil.
- Browser dapat membuka frontend.
- `/api/health` memberikan HTTP 200.
- TypeScript tidak menghasilkan error.

---

# 5. Phase 2 — PostgreSQL dengan Docker

Buat `docker-compose.yml` di root.

Contoh requirement:

```yaml
services:
  postgres:
    image: postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: trading_journal
      POSTGRES_PASSWORD: trading_journal
      POSTGRES_DB: trading_journal
    ports:
      - "5432:5432"
    volumes:
      - trading_journal_data:/var/lib/postgresql/data

volumes:
  trading_journal_data:
```

Jangan memasukkan frontend/backend ke compose file.

## Tambahkan backend `.env.example`

```env
PORT=3001
DATABASE_URL="postgresql://trading_journal:trading_journal@localhost:5432/trading_journal"
FRONTEND_URL="http://localhost:5173"

DEXSCREENER_BASE_URL=""
COINMARKETCAP_BASE_URL=""
COINMARKETCAP_API_KEY=""
```

Jangan commit `.env`.

## Commands yang harus didokumentasikan

```bash
docker compose up -d
docker compose down
docker compose logs -f postgres
```

## Acceptance Criteria

- PostgreSQL dapat dijalankan via Docker.
- Backend berjalan di host.
- Prisma dapat terhubung ke PostgreSQL.
- Data tetap ada setelah container direstart.

---

# 6. Phase 3 — Prisma dan Database Schema

Buat schema awal yang mengutamakan ledger transaksi.

## Enum

```text
TransactionType
- BUY
- SELL
```

```text
AssetStatus
- ACTIVE
- CLOSED
- WATCHLIST
```

## Model: Asset

Field minimum:

```text
id
name
symbol
chain
contractAddress
provider
providerAssetId
dexId
pairAddress
quoteSymbol
imageUrl
status
createdAt
updatedAt
```

Rules:

- `contractAddress` nullable untuk asset yang berasal dari provider yang tidak bergantung pada contract.
- Jika contract tersedia, uniqueness harus mempertimbangkan `chain + contractAddress`.
- Jangan menggunakan symbol sebagai unique key.
- Simpan alamat sesuai kebutuhan chain.
- Jangan otomatis lowercase semua smart contract karena tidak semua chain case-insensitive.

## Model: Transaction

Field minimum:

```text
id
assetId
type
quantity
pricePerToken
fee
executedAt
note
createdAt
updatedAt
```

Gunakan Decimal untuk:

```text
quantity
pricePerToken
fee
```

## Model: Journal

Field minimum:

```text
id
assetId
thesis
entryReason
invalidation
target
riskLevel
strategy
tags
postTradeReview
exitReason
createdAt
updatedAt
```

Untuk MVP, `tags` boleh menggunakan JSON/string array sesuai dukungan Prisma/Postgres.

## Model: Watchlist

Jika status pada Asset dianggap belum cukup, buat model terpisah:

```text
id
assetId
targetEntryPrice
note
createdAt
updatedAt
```

## Opsional: PriceSnapshot

Jangan gunakan tabel ini untuk menyimpan tick realtime setiap beberapa detik.

Gunakan hanya untuk snapshot yang bermakna, misalnya:

- saat BUY
- saat SELL
- manual snapshot
- daily portfolio snapshot di versi berikutnya

Field:

```text
id
assetId
price
marketCap
fdv
liquidity
volume24h
capturedAt
source
```

## Acceptance Criteria

- Migration berhasil.
- Seed berhasil.
- Prisma Studio dapat membaca data.
- Decimal fields benar.
- Index dibuat pada:
  - transaction.assetId
  - transaction.executedAt
  - asset.chain + asset.contractAddress
  - asset.symbol

---

# 7. Phase 4 — Financial Calculation Engine

Buat calculation engine terpisah dari controller.

Contoh:

```text
backend/src/modules/portfolio/calculations.ts
```

Engine harus berupa pure functions sebanyak mungkin.

## Cost Basis Method untuk MVP

Gunakan moving weighted-average cost basis.

### BUY

Sebelum BUY:

```text
oldQuantity
oldAverageCost
```

BUY baru:

```text
buyQuantity
buyPrice
buyFee
```

Hitung:

```text
oldCostBasis = oldQuantity × oldAverageCost

newBuyCost =
  buyQuantity × buyPrice
  + buyFee

newQuantity =
  oldQuantity + buyQuantity

newAverageCost =
  (oldCostBasis + newBuyCost)
  / newQuantity
```

### SELL

Untuk SELL:

```text
grossProceeds =
  sellQuantity × sellPrice

netProceeds =
  grossProceeds - sellFee

soldCostBasis =
  sellQuantity × averageCostBeforeSell

realizedPnL =
  netProceeds - soldCostBasis
```

Dengan average-cost method, SELL tidak mengubah average cost dari quantity tersisa.

---

# 8. Rumus Position

Untuk setiap asset:

```text
remainingQuantity
averageBuy
remainingCostBasis
currentPrice
currentValue
unrealizedPnL
unrealizedPnLPercent
realizedPnL
bepPrice
recoveryToBepPercent
```

## Current Value

```text
currentValue =
  remainingQuantity × currentPrice
```

## Unrealized PnL

```text
unrealizedPnL =
  currentValue - remainingCostBasis
```

## Unrealized PnL %

Jika `remainingCostBasis > 0`:

```text
unrealizedPnLPercent =
  unrealizedPnL
  / remainingCostBasis
  × 100
```

## BEP Price

Jika fee BUY dimasukkan ke cost basis:

```text
bepPrice =
  remainingCostBasis
  / remainingQuantity
```

## Recovery to BEP

Jika current price di bawah BEP:

```text
recoveryToBepPercent =
  ((bepPrice / currentPrice) - 1)
  × 100
```

Jika current price >= BEP:

```text
recoveryToBepPercent = 0
```

Contoh:

```text
Average/BEP = $100
Current = $50

Recovery =
((100 / 50) - 1) × 100
= 100%
```

## Edge Cases yang WAJIB Ditest

- hanya 1 BUY
- beberapa BUY/DCA
- BUY + partial SELL
- BUY + full SELL
- BUY lagi setelah partial SELL
- fee = 0
- fee > 0
- current price = 0/null
- extremely small token price
- extremely large token quantity
- SELL lebih besar dari quantity tersedia harus ditolak
- zero quantity harus ditolak
- negative price harus ditolak

## Acceptance Criteria

Unit test seluruh formula harus lulus sebelum membuat dashboard.

---

# 9. Phase 5 — Price Provider Abstraction

Jangan panggil Dexscreener atau CoinMarketCap langsung dari React.

Frontend hanya memanggil backend.

Alasan:

- menyembunyikan API key
- caching
- provider fallback
- standardisasi response
- mengurangi duplicate request

## Interface

Buat interface seperti:

```ts
interface PriceProvider {
  searchAssets(query: string): Promise<AssetSearchResult[]>;
  getCurrentPrice(asset: AssetIdentifier): Promise<CurrentPrice>;
}
```

Normalized response:

```ts
type CurrentPrice = {
  priceUsd: string;
  source: string;
  fetchedAt: string;
  liquidityUsd?: string;
  volume24hUsd?: string;
  marketCapUsd?: string;
  fdvUsd?: string;
};
```

Gunakan string/Decimal saat berpindah antar boundary finansial.

---

# 10. Phase 6 — Dexscreener Integration

Gunakan Dexscreener sebagai provider utama untuk token berdasarkan smart contract/pair.

Implementasikan service/provider terpisah.

## Flow Search

User memasukkan:

```text
ticker / token name / contract address
```

Backend:

1. Deteksi apakah input terlihat seperti contract address.
2. Query provider.
3. Normalize response.
4. Jika satu token memiliki beberapa pair, jangan otomatis mengambil pair sembarangan.
5. Ranking kandidat berdasarkan kombinasi:
   - exact contract match
   - chain
   - liquidity
   - volume
6. Tampilkan kandidat ke user bila ambigu.
7. Simpan pair yang dipilih user.

## Data yang sebaiknya dinormalisasi

```text
token name
symbol
chain
contract
pair address
DEX
quote asset
price USD
liquidity
volume 24h
market cap / FDV jika tersedia
image/logo jika tersedia
```

## Safety

Jangan percaya ticker/name dari input user saja.

Saat user paste smart contract, selalu tampilkan hasil resolver sebelum menyimpan.

## Acceptance Criteria

- Search by smart contract bekerja.
- Search biasa menampilkan beberapa candidate.
- Pair liquidity rendah tidak diam-diam menggantikan pair utama.
- Error provider ditangani tanpa crash.

---

# 11. Phase 7 — CoinMarketCap Adapter

CoinMarketCap bersifat optional/fallback.

Gunakan untuk:

- asset yang mudah dipetakan dengan provider ID
- top centralized assets
- metadata yang lebih bersih bila tersedia

JANGAN expose API key ke React.

Provider resolution harus deterministic.

Contoh:

```text
contract token / DEX asset
→ Dexscreener

providerAssetId tersedia dan ditandai CMC
→ CoinMarketCap
```

Jangan berganti provider pada setiap request jika bisa menyebabkan price source berubah tanpa disadari user.

Simpan `preferredPriceProvider` pada Asset jika diperlukan.

---

# 12. Phase 8 — Price Cache dan Realtime-Like Tracking

Untuk MVP, "realtime" berarti polling harga terkini secara berkala, BUKAN WebSocket tick-by-tick.

## Backend Cache

Tambahkan in-memory TTL cache.

Contoh:

```text
price TTL: 10–20 detik
metadata TTL: 5–30 menit
```

Tujuan:

- mengurangi API calls
- menghemat CoinMarketCap credits
- menghindari rate limit

Cache key minimal:

```text
provider + chain + contract/pair/providerAssetId
```

## Frontend

TanStack Query:

```text
refetchInterval: 15–30 detik
refetchOnWindowFocus: true
```

Tambahkan indicator:

```text
Last updated: 12:34:56
```

Tambahkan manual refresh button.

Jangan menampilkan "live" jika data sebenarnya stale.

---

# 13. Phase 9 — Core Backend API

Buat endpoint berikut.

## Health

```http
GET /api/health
```

## Asset Search

```http
GET /api/assets/search?q=...
```

## Create Asset

```http
POST /api/assets
```

## Assets

```http
GET /api/assets
GET /api/assets/:id
PATCH /api/assets/:id
```

## Transactions

```http
GET /api/assets/:id/transactions
POST /api/assets/:id/transactions
PATCH /api/transactions/:id
DELETE /api/transactions/:id
```

Setiap perubahan transaksi harus menyebabkan position dihitung ulang dari ledger.

## Prices

```http
GET /api/prices?assetIds=id1,id2,id3
GET /api/assets/:id/price
```

Gunakan batch endpoint untuk dashboard agar frontend tidak membuat puluhan request terpisah.

## Positions

```http
GET /api/positions
GET /api/positions/:assetId
```

Response position harus sudah mengandung computed metrics.

## Portfolio

```http
GET /api/portfolio/summary
```

Response minimum:

```text
totalCostBasis
portfolioValue
unrealizedPnL
unrealizedPnLPercent
realizedPnL
openPositions
closedPositions
```

## DCA Simulator

```http
POST /api/dca/simulate
```

Request:

```json
{
  "assetId": "...",
  "additionalCapital": "200",
  "buyPrice": "0.00123",
  "fee": "0"
}
```

Response:

```text
currentAverageBuy
projectedAverageBuy
currentBep
projectedBep
currentQuantity
projectedQuantity
additionalQuantity
currentRecoveryToBepPercent
projectedRecoveryToBepPercent
projectedTotalExposure
```

DCA simulator TIDAK membuat transaksi.

---

# 14. Phase 10 — Input Validation dan Error Handling

Gunakan Zod untuk semua input.

Validasi minimal:

```text
quantity > 0
price > 0
fee >= 0
executedAt valid
assetId exists
SELL <= quantity tersedia
```

Buat centralized error middleware.

Normalized error response:

```json
{
  "error": {
    "code": "INSUFFICIENT_POSITION",
    "message": "Sell quantity exceeds current position."
  }
}
```

Jangan expose stack trace ke client di production.

---

# 15. Phase 11 — Frontend Foundation

Buat layout utama dengan dark mode sebagai default.

## Sidebar

```text
Dashboard

Portfolio
- Positions
- Transactions
- Watchlist

Journal
- Trade Journal

Analytics
- Performance

Tools
- DCA Calculator

Settings
```

Untuk MVP, menu yang belum selesai boleh diberi badge `Coming soon`, tetapi route utamanya jangan menghasilkan broken page.

## App Shell

Buat:

- responsive sidebar
- mobile navigation
- top bar
- loading state
- error state
- empty state
- toast notification

---

# 16. Phase 12 — Dashboard

Dashboard harus menjawab:

```text
Berapa nilai portfolio saya sekarang?
Berapa modal yang masih berada di posisi aktif?
Berapa unrealized PnL?
Berapa realized PnL?
Posisi mana yang paling untung/rugi?
```

## Summary Cards

Tampilkan:

```text
Portfolio Value
Active Cost Basis
Unrealized PnL
Realized PnL
Open Positions
```

## Positions Table

Kolom:

```text
Token
Chain
Quantity
Avg Buy
Current Price
Cost Basis
Current Value
PnL
PnL %
Need to BEP
Last Updated
```

Behavior:

- profit positif: visual hijau
- loss negatif: visual merah
- neutral/unknown: netral
- click row → token detail
- sortable
- search/filter sederhana
- skeleton saat harga sedang di-fetch

Jangan hanya bergantung pada warna.
Tetap tampilkan tanda `+` / `-`.

---

# 17. Phase 13 — Add Token Flow

Buat modal/page:

```text
Add Token
```

Input:

```text
Search name, ticker, or contract address
```

Flow:

1. User mengetik query.
2. Debounce sekitar 300–500 ms.
3. Frontend memanggil backend.
4. Backend memanggil provider.
5. Kandidat muncul.
6. Kandidat menunjukkan minimal:
   - logo
   - name
   - symbol
   - chain
   - shortened contract
   - price
   - liquidity
   - DEX
7. User memilih asset.
8. Asset disimpan.
9. User diarahkan ke form BUY pertama atau watchlist.

Untuk smart contract, tampilkan full contract pada detail/tooltip dan tombol copy.

---

# 18. Phase 14 — Add Transaction Flow

Form BUY/SELL:

```text
Type
Quantity
Price per Token
Fee
Date & Time
Note
```

Tambahkan helper:

```text
Total =
quantity × price + fee
```

Untuk SELL:

```text
Estimated proceeds =
quantity × price - fee
```

Setelah save:

- invalidate query asset
- invalidate transactions
- invalidate position
- invalidate portfolio
- tampilkan toast
- position langsung dihitung ulang

---

# 19. Phase 15 — Token Detail Page

Route:

```text
/assets/:id
```

Header:

```text
Token Name / Symbol
Chain
Contract
Current Price
24h data jika tersedia
Last updated
```

## Position Panel

```text
Quantity
Average Buy
Current Price
BEP
Cost Basis
Current Value
Unrealized PnL
Realized PnL
Need to BEP
```

## Transactions

Timeline/table:

```text
Date
Type
Price
Quantity
Fee
Value
```

## Actions

```text
Add BUY / DCA
Add SELL
Simulate DCA
Edit Journal
```

Full candlestick history boleh ditunda jika provider saat ini tidak menyediakan historical candles yang cocok.

Jangan membuat chart palsu.

---

# 20. Phase 16 — DCA Simulator UI

DCA simulator adalah salah satu fitur utama.

Form:

```text
Current price
Additional capital
Fee
```

Optional:

```text
Custom buy price
```

Jika custom buy price kosong:

```text
gunakan latest current price
```

Tampilkan before/after:

```text
                 Before       After
Average Buy      $...         $...
BEP              $...         $...
Quantity         ...          ...
Cost Basis       $...         $...
Need to BEP      ...%         ...%
Exposure         $...         $...
```

Tambahkan CTA terpisah:

```text
Add This DCA as Transaction
```

Jangan otomatis menambahkan transaksi dari simulator.

---

# 21. Phase 17 — Journal

Pada detail asset buat journal.

## Pre-trade

```text
Entry reason
Trade thesis
Strategy
Invalidation
Target
Risk level
Tags
```

## Post-trade

```text
Exit reason
Post-trade review
What went well?
What went wrong?
What should change next time?
```

MVP tidak perlu AI.

Fokus pada data terstruktur yang kelak dapat dianalisis.

---

# 22. Phase 18 — Watchlist

User dapat menambahkan token tanpa BUY.

Field:

```text
Asset
Current price
Target entry
Distance to target
Note
```

Formula:

```text
distanceToTargetPercent =
(targetEntry - currentPrice)
/ currentPrice
× 100
```

Pastikan label jelas apakah target berada di atas atau di bawah current price.

Price alerts otomatis dapat ditunda ke V2.

---

# 23. Phase 19 — Basic Analytics

Hanya hitung analytics dari data yang sudah valid.

MVP analytics:

```text
total realized PnL
total unrealized PnL
number of closed positions
number of winning positions
number of losing positions
win rate
average winner
average loser
largest realized winner
largest realized loser
```

Jika journal strategy tersedia:

```text
performance by strategy
```

Jangan menampilkan metric yang belum memiliki cukup data seolah-olah valid.

Gunakan empty-state:

```text
Not enough closed trades yet.
```

---

# 24. Phase 20 — Responsive & UI Polish

Target visual:

```text
minimal
dark
clean
trading-oriented
tidak sepadat Bloomberg terminal
```

## Design Guidelines

- Dark mode default.
- Light mode optional.
- Maximize readability angka.
- Gunakan tabular numbers untuk value finansial.
- Profit/loss menggunakan warna + simbol.
- Smart contract ditampilkan monospace.
- Cards memiliki hierarchy yang jelas.
- Hindari terlalu banyak border.
- Gunakan whitespace.
- Table tetap usable di mobile.
- Untuk mobile, positions table dapat berubah menjadi cards.

## Number Formatting

Buat formatter terpusat.

Contoh:

```text
$1,234.56
$0.00001254
1.28M
142.52K
+12.42%
-7.13%
```

Jangan memaksa semua token menjadi 2 decimal.

Gunakan adaptive precision.

---

# 25. Phase 21 — Authentication

Untuk personal-local MVP, auth boleh ditunda.

Namun schema dan architecture jangan dibuat sedemikian rupa sehingga mustahil multi-user.

Jika aplikasi akan di-host ke internet, implementasikan auth SEBELUM public deployment.

Jika auth dibuat:

- User model
- password hashing dengan Argon2/bcrypt
- secure HTTP-only cookie
- session/JWT yang tidak disimpan di localStorage jika memungkinkan
- ownership check di semua asset/transaction endpoint
- rate limit login
- CSRF strategy sesuai metode authentication

Setelah multi-user aktif:

```text
Asset
Transaction
Journal
Watchlist
```

harus terkait dengan owner/user.

Jangan membiarkan user membaca ID milik user lain.

---

# 26. Phase 22 — Testing

## Backend Unit Tests

Wajib untuk calculation engine.

Test:

```text
single buy
multiple DCA
partial sell
full sell
buy after sell
fees
BEP
recovery %
invalid sell
decimal precision
```

## Backend Integration Tests

Test endpoint:

```text
POST asset
POST BUY
POST DCA
POST SELL
GET position
GET portfolio
POST DCA simulation
```

Mock external price provider.

Jangan menggunakan API Dexscreener/CMC asli di automated test.

## Frontend Tests

Prioritas:

- add transaction form
- DCA calculator
- position rendering
- positive/negative PnL display
- error state

---

# 27. Phase 23 — Data Consistency Tests

Buat test scenario lengkap.

Contoh:

```text
BUY:
100 token @ $1

BUY:
100 token @ $0.50

Average:
$0.75

Quantity:
200

SELL:
50 token @ $1

Remaining:
150

Average:
$0.75

Sold Cost Basis:
$37.50

Gross Proceeds:
$50

Realized PnL:
$12.50
```

Lalu current price:

```text
$0.60
```

Maka:

```text
Remaining Cost Basis:
150 × 0.75 = $112.50

Current Value:
150 × 0.60 = $90

Unrealized PnL:
-$22.50

Unrealized PnL %:
-20%

Recovery to BEP:
(0.75 / 0.60 - 1) × 100
= 25%
```

Pastikan automated test menghasilkan angka tersebut.

---

# 28. Phase 24 — API Resilience

External provider dapat:

- timeout
- rate-limit
- return null
- return malformed data
- tidak menemukan pair
- mempunyai beberapa pair
- memiliki harga stale

Implementasikan:

- request timeout
- normalized errors
- retry terbatas hanya untuk request yang aman
- cache
- fallback jika memang mapping provider jelas
- UI stale-data indicator
- jangan mengubah price menjadi 0 saat provider gagal

Jika fetch gagal:

```text
currentPrice = unavailable
```

bukan:

```text
currentPrice = 0
```

Karena 0 dapat menghasilkan PnL palsu -100%.

---

# 29. Phase 25 — Security Checklist

Sebelum deploy:

- Helmet aktif.
- CORS hanya origin yang diperlukan.
- API keys hanya ada di backend.
- `.env` tidak masuk Git.
- Request body memiliki size limit.
- Semua input divalidasi.
- Prisma query tidak menerima raw SQL sembarangan.
- Error production tidak expose stack.
- Rate limit endpoint search/provider bila public.
- Dependency audit.
- Backup database.
- Authentication wajib jika app dapat diakses publik dan berisi data personal.

---

# 30. Phase 26 — Logging

Backend minimal log:

```text
request id
method
path
status
duration
provider failure
unexpected exception
```

Jangan log:

```text
API key
password
session token
full authentication header
```

---

# 31. Phase 27 — Developer Experience

Root `README.md` harus mengandung:

## Requirements

```text
Node.js
npm
Docker
Docker Compose
```

## First Run

```bash
git clone ...
cd trading-journal

docker compose up -d

cd backend
npm install
cp .env.example .env
npx prisma migrate dev
npm run dev
```

Terminal lain:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Tambahkan command untuk:

```text
database migrate
database reset
database seed
tests
lint
typecheck
build
```

---

# 32. Phase 28 — Production Readiness

Sebelum deployment, verifikasi:

```text
frontend build berhasil
backend build berhasil
tests lulus
lint lulus
typecheck lulus
migration bersih
environment variables terdokumentasi
provider API keys tidak ada di repo
error handling provider bekerja
```

Karena requirement saat ini adalah PostgreSQL menggunakan Docker, jangan mengubah architecture development menjadi full Docker stack kecuali user meminta.

Production nanti boleh menggunakan managed PostgreSQL.

---

# 33. MVP Definition of Done

MVP dianggap selesai hanya jika semua flow berikut bekerja:

## Flow A — Add Asset

```text
Search/paste contract
→ pilih token/pair
→ simpan asset
```

## Flow B — First BUY

```text
Add BUY
→ transaction tersimpan
→ avg buy benar
→ position muncul
```

## Flow C — DCA

```text
Add BUY kedua
→ avg buy berubah
→ cost basis berubah
→ BEP berubah
```

## Flow D — Live Price

```text
Backend mengambil current price
→ frontend refresh otomatis
→ current value/PnL berubah
→ timestamp update terlihat
```

## Flow E — Recovery to BEP

Jika posisi loss:

```text
PnL = -50%
```

web dapat menunjukkan secara matematis:

```text
Need +100% to BEP
```

## Flow F — Partial SELL

```text
SELL sebagian
→ quantity turun
→ realized PnL tercatat
→ average cost quantity tersisa tetap benar
```

## Flow G — Full Exit

```text
SELL semua
→ remaining quantity = 0
→ unrealized PnL = 0
→ realized PnL final tersedia
→ position dapat dianggap CLOSED
```

## Flow H — DCA Simulator

```text
input capital tambahan
→ tampil before/after avg buy
→ tampil before/after BEP
→ tidak membuat transaction
```

## Flow I — Journal

```text
simpan thesis/strategy/review
→ reload
→ data tetap tersedia
```

---

# 34. Fitur yang TIDAK Masuk MVP

Jangan mengembangkan ini sebelum MVP stabil:

- automatic wallet sync
- blockchain transaction indexing
- exchange API sync
- WebSocket tick-by-tick
- Telegram alerts
- push notification
- AI journal coach
- advanced backtesting
- copy trading
- tax reporting
- multi-currency accounting
- complex FIFO/LIFO tax lots
- social features
- full candlestick infrastructure
- automated trading/buy/sell execution

MVP hanya tracking + journal.

---

# 35. V2 Roadmap

Setelah MVP stabil:

## Portfolio

- allocation by chain
- allocation by narrative/tag
- realized vs unrealized charts
- daily portfolio snapshots

## Journal

- calendar PnL
- trade screenshots
- strategy analytics
- holding duration
- entry/exit tags

## Alerts

- target entry alert
- target exit alert
- BEP alert
- price threshold alert

## Risk

- position sizing calculator
- risk per trade
- planned stop loss
- planned take profit
- risk/reward

## Visualization

- price chart
- average buy line
- entry markers
- sell markers
- TP/SL lines

---

# 36. V3 Roadmap

- wallet import
- automatic on-chain transaction sync
- multiple wallets
- exchange integration
- historical market snapshot
- analytics by market cap/liquidity at entry
- AI journal summarization
- behavioral pattern detection
- recurring performance review
- export CSV
- import CSV
- encrypted backup
- PWA/mobile optimization

---

# 37. Rules untuk AI Agent yang Mengeksekusi Plan

AI Agent WAJIB mengikuti aturan berikut:

1. Kerjakan phase secara berurutan.
2. Jangan implementasikan fitur V2/V3 sebelum MVP selesai.
3. Jangan mengubah stack tanpa kebutuhan teknis yang jelas.
4. Jangan Dockerize frontend/backend.
5. PostgreSQL saja yang berjalan di Docker.
6. Jangan menggunakan ticker sebagai unique token identity.
7. Jangan menggunakan floating-point JS biasa untuk financial math.
8. Jangan expose provider API keys ke frontend.
9. Transaction ledger adalah source of truth.
10. Jangan menyimpan calculated PnL sebagai nilai manual yang dapat drift tanpa alasan.
11. Semua mutation harus divalidasi server-side.
12. Semua provider response harus dinormalisasi.
13. Jangan membuat chart/historical data palsu.
14. Jangan menyebut data sebagai realtime jika timestamp sudah stale.
15. Jika provider gagal, jangan mengganti harga menjadi 0.
16. Setelah setiap phase:
    - jalankan lint
    - jalankan typecheck
    - jalankan test terkait
    - pastikan app masih bisa start
17. Jika mengubah calculation engine, semua financial unit tests harus dijalankan ulang.
18. Jika menambah schema database:
    - buat migration
    - jangan edit production database manual
19. Pertahankan separation:
    - controller = HTTP
    - service = business logic
    - provider = external API
    - calculation = financial math
20. Jangan menggabungkan seluruh backend logic dalam satu file.

---

# 38. Urutan Eksekusi yang Direkomendasikan untuk AI Agent

Gunakan checklist ini.

```text
[ ] 01. Bootstrap frontend React + Vite + TypeScript
[ ] 02. Bootstrap backend Express + TypeScript
[ ] 03. Add health endpoint
[ ] 04. Add Docker Compose PostgreSQL
[ ] 05. Configure Prisma
[ ] 06. Create initial database schema
[ ] 07. Run first migration
[ ] 08. Build financial calculation engine
[ ] 09. Write calculation unit tests
[ ] 10. Build Asset CRUD
[ ] 11. Build Transaction CRUD
[ ] 12. Build Position calculation service
[ ] 13. Build Portfolio summary service
[ ] 14. Create PriceProvider interface
[ ] 15. Implement Dexscreener provider
[ ] 16. Implement optional CMC adapter
[ ] 17. Implement price caching
[ ] 18. Build batch price endpoint
[ ] 19. Build DCA simulation endpoint
[ ] 20. Configure frontend routing
[ ] 21. Build app shell/sidebar
[ ] 22. Build dashboard
[ ] 23. Build Add Token flow
[ ] 24. Build Add BUY/DCA flow
[ ] 25. Build Token Detail page
[ ] 26. Build SELL flow
[ ] 27. Build DCA Simulator UI
[ ] 28. Build Journal
[ ] 29. Build Watchlist
[ ] 30. Build Basic Analytics
[ ] 31. Add responsive states
[ ] 32. Add frontend tests
[ ] 33. Add backend integration tests
[ ] 34. Add logging/security middleware
[ ] 35. Run full regression tests
[ ] 36. Update README
[ ] 37. Verify production builds
[ ] 38. Tag MVP release
```

---

# 39. Checkpoint Prompt untuk AI Agent

Setelah setiap phase, AI Agent harus memberikan laporan singkat:

```text
Phase:
Status:

Files created:
- ...

Files changed:
- ...

Commands run:
- ...

Tests:
- ...

Manual verification:
- ...

Known issues:
- ...

Next phase:
- ...
```

Jangan melanjutkan ke phase berikutnya jika core acceptance criteria phase sekarang gagal.

---

# 40. Final MVP UX Target

User membuka dashboard dan dapat memahami kondisi portfolio dalam beberapa detik:

```text
Portfolio Value
$12,482.42

Active Cost Basis
$11,640.30

Unrealized PnL
+$842.12 (+7.23%)

Realized PnL
+$362.44
```

Positions:

```text
TOKEN   AVG BUY       PRICE         PNL       NEED TO BEP
SOL     $142.10       $152.40       +7.25%    —
PEPE    $0.000015     $0.000012     -20.00%   +25.00%
ABC     $0.028        $0.014        -50.00%   +100.00%
```

Saat membuka asset:

```text
PEPE

Current Price
$0.000012

Average Buy
$0.000015

Position
50,000,000 PEPE

Cost Basis
$750

Current Value
$600

Unrealized PnL
-$150 (-20%)

Need to BEP
+25%
```

Tujuan utama MVP:

> Trading journal yang akurat secara matematis, mudah dipakai, aman terhadap token ambiguity, dan memiliki fondasi data yang cukup kuat untuk analytics lanjutan.
