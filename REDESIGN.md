# REDESIGN.md — Trading Journal

## 1. Tujuan dan aturan utama

Redesign aplikasi Trading Journal yang sudah dibangun, dengan **panel chart nilai portofolio sebagai elemen besar dan fokus utama dashboard**. Pertahankan kemampuan mencatat BUY/DCA/SELL, melihat average buy, PnL, BEP, journal, watchlist, dan simulasi DCA.

Dokumen ini ditulis dari PLAN dan kode HTML referensi; source code aplikasi aktual belum diperiksa. Karena itu, nama komponen, route baru, dan kontrak tambahan di bawah merupakan spesifikasi target, bukan klaim tentang implementasi saat ini.

Instruksi untuk agent:

1. Audit repository sebelum mengedit. Gunakan implementasi aktual sebagai dasar integrasi.
2. Lakukan refactor bertahap, bukan membuat aplikasi pengganti dari nol.
3. Pertahankan React + Vite + TypeScript, backend yang ada, PostgreSQL, dan library yang sudah cocok. Hanya database yang berjalan melalui Docker.
4. Pertahankan ledger transaksi, identitas token, precision Decimal, financial engine, validasi, ownership, dan API provider yang sudah bekerja.
5. `REDESIGN.md` menggantikan arahan tampilan pada PLAN, bukan aturan bisnisnya. Bila ditemukan bug perhitungan, pisahkan perbaikannya dan sertakan regression test.
6. Jangan mereset database, menjalankan seed destruktif, menghapus fitur, mengganti authentication, atau melakukan major upgrade dependency demi tampilan.
7. Gunakan data sebenarnya. Data fixture hanya untuk test atau preview development yang diberi label; tidak boleh masuk dashboard produksi.
8. Kerjakan seluruh tahap wajib secara berurutan. Catat blocker nyata dan lanjutkan pekerjaan independen yang masih dapat diselesaikan.

### Hasil yang harus dirasakan pengguna

Dalam beberapa detik pengguna dapat melihat nilai posisi aktif, arah perubahannya, modal posisi aktif, unrealized/realized PnL, serta posisi yang perlu diperiksa. Aksi mencatat transaksi tersedia tanpa harus mencari di banyak menu.

## 2. Menerjemahkan referensi menjadi produk

Referensi Aurum adalah karya visual dengan market feed simulasi. Ambil bahasa visual dan proporsi panelnya, lalu ubah isi sesuai kebutuhan trading journal.

| Elemen referensi | Keputusan redesign |
|---|---|
| Latar `#07080a`, panel gelap | Dipertahankan sebagai fondasi |
| Garis emas tipis dan glint di atas panel | Dipertahankan secara terbatas, terutama panel utama |
| Angka monospace dengan tabular numerals | Dipertahankan untuk uang, harga, quantity, persentase, waktu, kontrak |
| Chart mendominasi sekitar dua pertiga area utama | Diperkuat: target 70–75% area konten utama desktop |
| Candlestick indeks sintetis | Diganti line/area chart nilai posisi aktif berbasis histori nyata |
| Depth of market | Diganti ringkasan PnL dan modal posisi aktif |
| Sector heat fiktif | Diganti alokasi aset nyata berbentuk bar dan daftar yang mudah dibandingkan |
| Toggle 1m/5m/1h | Diganti rentang histori 24H/7D/30D/90D/ALL |
| Sonar, random walk, tick 130 ms | Tidak dibawa ke aplikasi |
| Marquee ticker di footer | Tidak menjadi bagian default; daftar watchlist statis lebih berguna |
| Teks 10px dan opacity sangat rendah | Diganti ukuran dan kontras yang nyaman dibaca |
| `overflow:hidden` pada body | Diganti document scrolling normal |
| Nama “Aurum Exchange” | Hanya referensi estetika; pertahankan nama aplikasi pengguna |

Karakter visual: tenang, presisi, luas, mudah dipindai. Hindari neon berlebihan, glow pada semua angka, banyak kartu kecil yang bersaing, atau dashboard yang menyerupai layar order execution.

## 3. Prioritas implementasi

| Prioritas | Cakupan |
|---|---|
| P0 — wajib | Audit, design tokens, app shell, hero chart, data history yang jujur, summary PnL, positions, status data, responsive, alur transaksi tetap bekerja |
| P1 — wajib setelah P0 | Konsistensi detail aset, simulator DCA, journal, watchlist, transactions, analytics yang sudah ada, accessibility dan QA |
| P2 — opsional | Hide balances, preferensi density, marker transaksi pada chart bila mapping waktunya valid |
| Di luar scope | Order book, trading execution, wallet import baru, alerts baru, AI insights, TWR/IRR baru, redesign autentikasi, light theme baru |

History adalah tambahan fungsional minimum bila aplikasi belum memilikinya. Jangan memperluas pekerjaan menjadi platform analytics baru.

## 4. Struktur informasi dan navigasi

Gunakan navigasi utama: Dashboard, Positions, Transactions, Watchlist, Journal, Analytics, DCA Simulator, Settings. Pertahankan route yang sudah tersedia dan deep link lama; nama tampilan boleh dirapikan tanpa mengganti URL.

### App shell

- Desktop: sidebar 216–232px, topbar sekitar 64px, content padding 24px, gap 20px. Sidebar tidak lebih menonjol daripada konten.
- Topbar: judul halaman di kiri; status harga, Refresh, dan primary CTA `Tambah transaksi` di kanan. `Tambah aset` menjadi aksi sekunder.
- Sidebar: icon Lucide 18–20px, label yang jelas, active state menggunakan latar tipis + indikator emas + `aria-current="page"`.
- Tablet: sidebar menjadi rail sekitar 64–72px dengan accessible label, atau drawer bila area konten terlalu sempit.
- Mobile: header ringkas dengan menu drawer dan tombol tambah transaksi. Tidak ada sidebar permanen maupun footer ticker yang menutup konten.
- Jangan menambahkan menu, tombol ekspor, atau notifikasi yang belum punya implementasi nyata.
- Bahasa UI mengikuti bahasa aplikasi yang sudah konsisten. Bila belum ada kebijakan, gunakan Bahasa Indonesia dengan istilah BUY, SELL, DCA, PnL, dan BEP; pusatkan copy agar mudah disesuaikan.

## 5. Layout dashboard — chart sebagai fokus

### Desktop lebar, viewport ≥1280px

Setelah sidebar, gunakan grid konten dengan kolom `minmax(0, 1fr) 300px`; rail kanan boleh mencapai 320px pada layar lebar. Target chart sekitar 70–75% dari area konten, tidak termasuk sidebar. Lebar konten maksimum sekitar 1680px agar tetap nyaman pada monitor ultrawide.

| Area | Posisi dan isi |
|---|---|
| Page heading | “Dashboard”, deskripsi singkat opsional; jangan membuat banner besar |
| Hero portfolio | Kiri, panel terbesar: nilai terkini, perubahan nilai pada periode, range selector, chart, legend, kualitas data |
| Portfolio summary | Kanan atas: modal aktif, unrealized PnL + %, realized PnL kumulatif, jumlah posisi aktif |
| Asset allocation | Kanan bawah: top 5 aset + Others, persentase dan nilai, link ke Positions |
| Positions preview | Baris berikutnya, melintasi dua kolom; maksimal 8 posisi dengan “Lihat semua” |
| Recent activity | Bagian bawah: 5 transaksi terakhir dan link ke Transactions |

Hero panel target tinggi 520–600px, termasuk header dan controls; **plot chart desktop minimal 340px**. Pada viewport 1440×900, nilai utama dan plot harus terlihat sebelum scroll. Jangan menaruh deretan summary cards besar di atasnya. Dua panel kanan boleh mengikuti tinggi hero tanpa memaksa teks kosong memenuhi ruang.

### Tablet, viewport 768–1279px

Hero mengambil lebar penuh, plot 300–380px. Summary dan allocation pindah ke baris berikutnya dalam dua kolom jika cukup lebar. Positions berada sesudahnya. Gunakan container-aware layout jika sidebar mengurangi ruang secara signifikan.

### Mobile, viewport <768px

Urutan DOM: header → hero → summary → allocation → positions → activity. Padding 16px, gap 16px, plot minimal 240px. Nilai utama 30–36px. Range selector dapat wrap dengan rapi; chart tidak boleh menyebabkan horizontal page overflow.

Pada layar 320–390px, sederhanakan jumlah axis ticks dan gunakan positions cards. Biarkan halaman scroll; jangan memaksa seluruh dashboard muat satu layar atau menurunkan ukuran teks.

## 6. Design system

Gunakan CSS variables dan mapping ke sistem styling yang sudah terpasang. Jangan mencampur pola konfigurasi Tailwind dari major version berbeda.

```css
:root {
  --bg: #07080a;
  --surface: #0c0e12;
  --surface-raised: #12161c;
  --surface-hover: #191e26;
  --text: #e8e6df;
  --text-secondary: #b4b6bc;
  --text-muted: #9297a1;
  --border: #282d35;
  --border-accent: rgba(212, 175, 55, 0.22);
  --gold: #d4af37;
  --positive: #2ee59d;
  --negative: #ff5c7a;
  --focus: #e8c85b;
  --font-sans: ui-sans-serif, system-ui, 'Helvetica Neue', Arial, sans-serif;
  --font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --radius-panel: 16px;
  --radius-control: 10px;
}
```

Nilai ini merupakan baseline desain. Uji kontras pada background yang benar-benar dirender, termasuk hover, disabled, transparansi, dan tooltip; jangan mengasumsikan semua kombinasi lolos.

| Aspek | Ketentuan |
|---|---|
| Body | 14–16px, line-height 1.5 |
| Page title | 22–28px, semibold |
| Nilai portfolio | 40–48px desktop; 30–36px mobile; medium/light yang tetap terbaca |
| Panel heading | 12px, medium, uppercase opsional, letter-spacing sekitar 0.08em |
| Data tabel | 13–14px; angka rata kanan |
| Metadata | 12px minimum untuk informasi yang harus dibaca |
| Spacing | Kelipatan 4px; utama 8, 12, 16, 20, 24, 32 |
| Panel | Surface solid/subtil, border 1px; glint emas hanya aksen dekoratif |
| Primary CTA | Warm off-white dengan teks gelap; emas digunakan pada selected state dan aksen |
| Profit/loss | Mint/rose + tanda +/− dan label; neutral/unknown tidak diberi warna profit |
| Motion | Hover/focus 120–180ms; pergantian panel maksimal sekitar 200ms |

Semua angka memakai `font-variant-numeric: tabular-nums`. Matikan animasi angka bergulir. Background boleh memiliki radial glow statis sangat lembut; jangan memakai canvas dekoratif atau grain di atas teks/chart. Batasi emas agar tidak bersaing dengan warna PnL.

## 7. Hero chart: spesifikasi visual dan interaksi

### 7.1 Header panel

Urutan konten:

1. Label `Nilai posisi aktif` dan unit `USD`.
2. Nilai saat ini, misalnya `$12,482.42` — contoh desain, bukan data default.
3. `Perubahan nilai 30D: +$842.12 (+7.23%)` hanya jika titik pembanding valid.
4. Keterangan tetap: `Mencakup perubahan akibat BUY/SELL. Bukan persentase return.`
5. Range selector `24H · 7D · 30D · 90D · ALL`, di dalam hero; default 30D jika mencukupi, selain itu ALL dengan rentang tersedia yang jelas.

Summary PnL di rail kanan tetap memakai metrik posisi saat ini dan realized kumulatif. Jangan membuatnya seolah ikut berubah ketika user memilih range chart. Label cakupan waktu harus eksplisit.

### 7.2 Plot

- Gunakan line chart dengan fill gradient rendah sebagai area pendukung; garis utama warm off-white atau mint yang konsisten. Warna garis tidak berubah hanya karena user BUY.
- Gunakan interpolasi linear, tanpa smoothing yang mengarang puncak/lembah.
- Sumbu X berbasis timestamp aktual, bukan indeks titik yang menyamakan jarak antar waktu.
- Sumbu Y dalam USD. Untuk area chart gunakan baseline nol; jika kelak tersedia mode zoom Y, ganti ke line tanpa fill dan beri penanda skala.
- Grid horizontal halus, 4–6 ticks desktop dan 3–4 mobile. Kurangi grid vertikal.
- Tooltip menunjukkan waktu lengkap, nilai historis, modal aktif saat itu bila tersedia, dan kualitas data. Simpan angka headline terkini tetap stabil saat hover.
- Crosshair tipis; tidak perlu dot pada semua titik. Titik terakhir boleh diberi marker kecil tanpa pulse.
- Optional toggle `Modal aktif`: garis emas putus-putus, dengan legend “Modal posisi tersisa”. Jangan menamainya total deposit atau BEP portofolio.
- Data gap memutus garis. Jangan menghubungkan null atau melakukan forward-fill tersembunyi.
- Saat mengubah range, tampilkan loading di panel tanpa membongkar shell. Jangan menampilkan data range lama dengan label range baru.
- Pada touch, tap titik untuk membaca tooltip; sediakan cara dismiss dan tabel data alternatif. Vertical scrolling halaman tetap bekerja.
- Nilai tooltip memakai precision asli yang diformat, bukan hasil pembulatan axis.

### 7.3 Pemilihan chart library

Gunakan library yang sudah ada jika memenuhi kebutuhan. Jika belum ada, Recharts cocok sebagai pilihan awal line/area chart React. Jangan menambahkan Recharts dan Lightweight Charts sekaligus hanya untuk redesign.

Periksa versi terpasang sebelum menggunakan API responsive atau accessibility. Berikan parent chart ukuran nyata, `min-width: 0` pada grid/flex child, dan resize handling melalui API library. Hindari canvas drawing engine buatan sendiri untuk kebutuhan sederhana ini. Lihat referensi resmi [R4–R5].

## 8. Arti nilai dan perubahan: jangan menampilkan return palsu

PLAN awal mencatat posisi token dan transaksi, tetapi tidak mewajibkan ledger saldo kas/deposit/withdrawal. Default chart karena itu menampilkan **nilai pasar posisi yang masih dimiliki**, bukan total account equity.

```text
value(t) = jumlah seluruh quantity aset pada waktu t × harga valid pada waktu t
costBasis(t) = total remaining cost basis pada waktu t
deltaValue = value(end) - value(start)
deltaValuePercent = deltaValue / value(start) × 100, hanya jika value(start) > 0
```

BUY dapat menaikkan nilai chart dan SELL dapat menurunkannya tanpa mencerminkan profit/loss. Jangan menamai `deltaValuePercent` sebagai ROI, portfolio return, daily PnL, atau hasil investasi. Untuk versi ini, gunakan label **Perubahan nilai** dan penjelasan BUY/SELL.

Aturan tambahan:

- Angka headline adalah nilai terkini; delta range memakai endpoint historis dengan timestamp dan coverage yang jelas. Jika endpoint terakhir tertinggal, sebutkan waktu akhir perbandingan.
- Jangan memakai harga terkini untuk menilai seluruh transaksi masa lalu.
- Jangan memakai quantity hari ini untuk seluruh histori.
- Jangan menggunakan persentase perubahan harga 24h suatu token sebagai perubahan portofolio.
- Saat semua posisi ditutup, nilai posisi aktif memang nol; realized PnL tetap terlihat. Nol tersebut bukan berarti seluruh dana pengguna hilang.
- Jika nilai awal nol, tampilkan delta nominal dan persentase `—`; jangan membagi dengan nol.
- Jika periode belum lengkap, gunakan label `Sejak [tanggal]` dengan periode aktual, bukan “30D” pada delta yang hanya mencakup dua hari.
- Jika aplikasi aktual sudah mempunyai cash ledger dan return engine yang teruji, pertahankan lewat adapter terpisah dengan definisi yang eksplisit. Jangan menghitungnya ulang secara ad hoc di frontend.

## 9. Sumber histori dan perubahan backend minimum

### 9.1 Audit terlebih dahulu

Cari endpoint/tabel history, snapshot, scheduler, dan price history yang sudah ada. Periksa apakah datanya merekam posisi pada waktu tersebut, timezone, kualitas harga, dan efek edit/delete transaksi. Pilih salah satu jalur berikut; tidak perlu mengimplementasikan semuanya.

| Kondisi | Jalur implementasi |
|---|---|
| History valid sudah tersedia | Reuse melalui adapter; tambahkan metadata kualitas bila dibutuhkan |
| Historical prices dan ledger lengkap tersedia | Reuse rekonstruksi yang sudah teruji; seluruh aset yang pernah dimiliki harus ikut diperhitungkan |
| Hanya harga terkini tersedia | Tambahkan observed portfolio snapshots mulai sekarang; tidak melakukan backfill palsu |

**Default jika belum ada histori: observed snapshots.** Referensi HTML random walk, harga eksekusi transaksi saja, dan current-price API bukan pengganti historical valuation.

### 9.2 Observed snapshots

Usulan field minimum, sesuaikan model yang ada:

```text
PortfolioSnapshot
id
portfolioId / owner scope sesuai arsitektur aplikasi
capturedAt                  timestamp pengamatan sebenarnya, UTC
bucketStart                 bucket 5 menit, UTC, untuk deduplication
portfolioValueUsd           Decimal nullable jika valuasi tidak lengkap
knownValueUsd               Decimal subtotal aset yang memiliki quote layak
activeCostBasisUsd          Decimal
quality                     complete | stale | partial | unavailable
pricedAssetCount
totalAssetCount
oldestPriceAt               nullable; waktu quote paling tua yang dipakai
ledgerRevision              versi ledger pada saat snapshot
```

- Tambahkan unique key `(portfolio scope, bucketStart)` dan index `(portfolio scope, capturedAt)`. Gunakan scope lokal yang stabil jika belum multi-user; jangan membuat auth baru untuk fitur ini.
- Backend job berjalan di proses host yang sudah ada, setiap 5 menit. Tidak perlu service Docker baru atau Redis. Snapshot tidak bergantung pada dashboard yang sedang terbuka.
- Gunakan quote cache/provider abstraction yang sama. Snapshot tidak boleh memanggil provider per tick atau menulis row setiap polling frontend.
- Baca ledger secara konsisten; bila revision berubah saat quotes dikumpulkan, ulangi/skip capture agar tidak mencampur posisi sebelum dan sesudah transaksi.
- Untuk MVP simpan pengamatan pertama per bucket dengan konflik insert diabaikan, sehingga dua tab/worker tidak membuat duplikat atau menimpa history. Capture awal saat job mulai jika bucket belum ada.
- Gunakan `capturedAt` sebenarnya; `bucketStart` hanya kunci dedup. Jangan mengaku snapshot dibuat pada awal bucket jika faktanya terlambat.
- Saat backend berhenti, histori berhenti. Setelah restart, lanjutkan dari waktu saat itu dan tampilkan gap. Jangan mengisi masa offline dengan harga terbaru.
- Pertahankan semua snapshot dalam tahap ini; jangan menambah retention yang menghapus data tanpa kebutuhan terukur.
- Bila deployment beberapa instance, dedup database tetap wajib dan eksekusi job perlu single-runner/advisory lock agar request provider tidak berlipat.
- Timestamp, quality, dan scope harus berasal dari backend. Financial values dikirim sebagai decimal strings.

Observed snapshots merupakan catatan yang pernah diamati. BUY/SELL baru mengubah current summary segera dan snapshot berikutnya mengikuti jadwal. Label `Terkini` dan `Histori sampai ...` boleh berbeda; jangan menyamakan keduanya diam-diam.

Jika transaksi lama diedit, dihapus, atau dimasukkan backdated, jangan menghitung ulang observed history memakai harga sekarang. Simpan penanda waktu perubahan dan periode yang terdampak; tampilkan “Histori sebelum koreksi ledger” pada periode tersebut. Nonaktifkan delta lintas periode terdampak sampai tersedia rebuild valid dari historical prices. Marker transaksi opsional hanya ditampilkan bila konsisten dengan revision history.

### 9.3 Kontrak history yang disarankan

Tambahkan endpoint hanya jika belum tersedia. Adapter frontend boleh menormalisasi kontrak yang sudah ada menjadi bentuk berikut.

```http
GET /api/portfolio/history?range=30d
```

```ts
type HistoryPoint = {
  capturedAt: string; // ISO UTC
  valueUsd: string | null;
  activeCostBasisUsd: string | null;
  quality: 'complete' | 'stale' | 'partial' | 'unavailable';
};

type PortfolioHistory = {
  currency: 'USD';
  metric: 'active_positions_value';
  source: 'observed_snapshots' | 'historical_reconstruction';
  requestedRange: '24h' | '7d' | '30d' | '90d' | 'all';
  requestedFrom: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  generatedAt: string;
  intervalSeconds: number;
  coverage: 'full' | 'limited' | 'none';
  invalidatedFrom: string | null; // dampak koreksi ledger
  points: HistoryPoint[];
};
```

Endpoint melakukan validasi enum range, scope pengguna bila ada, sorting timestamp, serta pembatasan jumlah titik. Target maksimal sekitar 600 titik per response; agregasikan bucket dengan nilai terakhir yang valid dan pertahankan penanda gap/kualitas. Jangan mengambil rata-rata nilai portofolio lalu melabelinya nilai penutupan. Return metadata interval hasil agregasi.

Rentang dihitung backend memakai UTC; UI menampilkan timezone pengguna secara eksplisit pada tooltip. Bila belum ada preferensi, gunakan timezone browser; pada pengguna Indonesia tampilkan WIB jika benar-benar Asia/Jakarta. Jangan menambahkan offset dua kali.

### 9.4 State history wajib

| Kondisi | Tampilan |
|---|---|
| Belum ada transaksi | Hero tetap besar, “Mulai catat transaksi untuk membangun histori portofolio”, CTA tambah transaksi |
| Ada posisi, belum ada snapshot | Tampilkan nilai terkini dan “Histori mulai direkam sejak sekarang”; tanpa grafik palsu |
| Hanya satu titik | Satu marker dan “Menunggu pengamatan berikutnya”; bukan garis datar panjang |
| History lebih pendek daripada range | Tampilkan titik yang tersedia, rentang aktual, dan label cakupan terbatas |
| Tidak ada titik dalam range | Empty state khusus range dan tombol ALL; jangan mengganti range diam-diam |
| Provider gagal pada sebagian aset | Penanda partial; subtotal diketahui dilabeli jelas; jangan dianggap total portfolio |
| Gap/offline | Garis terputus dan keterangan data tidak tersedia |
| Error fetch history | Error lokal dengan Retry; summary dan positions tetap dapat dipakai |
| Refresh background | Pertahankan data valid sebelumnya, indikator kecil; jangan skeleton seluruh dashboard |

## 10. Summary, allocation, dan positions

### Portfolio summary

Gunakan satu panel dengan 4 baris, bukan 4 kartu besar:

- **Modal aktif:** remaining cost basis.
- **Unrealized PnL:** nominal + persentase terhadap cost basis posisi aktif.
- **Realized PnL:** hasil SELL kumulatif sesuai engine yang ada.
- **Posisi aktif:** jumlah posisi quantity > 0.

Tooltip menjelaskan perbedaan modal aktif, total nilai, dan realized PnL. Tidak perlu menambahkan “portfolio BEP” sebagai satu harga karena portofolio berisi banyak aset.

### Allocation

Gunakan horizontal stacked bar dan daftar top 5 + Others. Bobot dihitung dari current value setiap posisi dibagi total current value pada snapshot harga yang sama. Warna kategori netral seperti slate/blue/purple dengan legend teks; hindari memberi kesan alokasi hijau berarti profit.

Tampilkan symbol, chain bila perlu, nilai USD, dan %. Others dapat dibuka untuk melihat sisanya. Jika semua posisi nol, tampilkan empty state. Jika ada harga hilang, label “Alokasi aset dengan harga tersedia” dan jumlah aset belum terhitung; jangan mengaku cakupan 100% portofolio.

### Positions preview dan halaman Positions

Dashboard menampilkan 8 posisi terbesar berdasarkan current value saat pemuatan awal; urutan tetap selama polling agar target klik tidak berpindah. Tombol sort atau refresh daftar eksplisit dapat mengurutkan ulang.

| Kolom utama | Isi |
|---|---|
| Aset | Logo/fallback, nama/symbol, chain |
| Avg buy | Adaptive precision |
| Harga | Harga terkini + indikator stale per aset bila perlu |
| Nilai posisi | Current value USD |
| Unrealized PnL | Nominal dan % pada dua baris |
| Ke BEP | `Butuh +25.00%`, `Sudah BEP`, atau `—` sesuai kondisi |
| Aksi | Menu detail, catat BUY/DCA, catat SELL, simulasi DCA |

Quantity, cost basis, contract, dan timestamp lengkap tersedia melalui expanded row/detail serta kolom opsional di halaman Positions. Semua informasi PLAN tetap dapat diakses.

- Search nama/symbol/contract; filter chain, open/closed, dan untung/rugi jika datanya valid.
- Sorting numeric menggunakan nilai asli, bukan string berformat. Unknown ditempatkan terakhir.
- Link nama aset dapat dibuka via keyboard/new tab; jangan hanya mengandalkan row click.
- Menu aksi tidak boleh memicu navigasi row secara bersamaan.
- Mobile memakai cards: nama, nilai, PnL, avg buy, harga, recovery, dan menu. Quantity/metadata dapat dibuka.
- Halaman Transactions yang memerlukan tabel lebar boleh memakai scroll lokal berlabel; bukan overflow seluruh halaman.

## 11. Penyempurnaan alur kerja

### Tambah aset dan transaksi

Gunakan drawer sekitar 480–560px di desktop; full-screen sheet pada mobile. Reuse komponen dialog yang aksesibel jika sudah ada.

Alur: pilih aset yang sudah ada atau cari aset baru → konfirmasi identitas chain/contract/pair → isi BUY/SELL → review total/fee/waktu → simpan. User tetap dapat menambahkan aset hanya ke watchlist tanpa BUY.

- Search debounce mengikuti implementasi PLAN; tampilkan chain, contract, DEX, liquidity, dan pair untuk kandidat ambigu.
- Bedakan aksi **mencatat transaksi** dari mengeksekusi trade di exchange.
- DCA tetap BUY tambahan, bukan tipe ledger baru.
- `Gunakan harga terkini` adalah aksi eksplisit; polling tidak boleh menimpa harga yang sedang diketik.
- Form menyimpan angka sebagai string sampai validasi Decimal. Pertahankan draft saat request gagal.
- Timezone input tanggal/waktu terlihat. Tampilkan error inline dan fokus ke field pertama yang invalid.
- Disable submit selama request; cegah double submit dan jangan retry mutation non-idempotent secara otomatis.
- Setelah berhasil, tutup/konfirmasi sesuai flow, tampilkan toast, invalidate summary, positions, transactions, detail terkait, dan history metadata yang terdampak.
- Jangan melakukan optimistic financial recalculation yang mengabaikan validasi backend.
- Edit/delete transaksi tetap meminta konfirmasi dengan dampak yang spesifik; jangan memakai konfirmasi tambahan untuk klik biasa.

### Detail aset

Header berisi identitas, chain, copy contract, current price, source, dan update time. Primary actions: `Catat BUY/DCA`, `Catat SELL`; secondary: `Simulasikan DCA`.

Position metrics tetap lengkap. Letakkan transactions dan journal pada tabs dengan route/query state yang dapat dibagikan jika pola itu sudah digunakan. Jangan menghapus thesis, invalidation, target, tags, ataupun post-trade review.

Chart harga aset hanya jika historical prices memang tersedia. Jika tidak, tampilkan position metrics dan transactions; jangan memakai chart portofolio sebagai chart token.

### DCA Simulator

Desktop: input di kiri, hasil before/after di kanan. Mobile: input di atas hasil. Highlight average buy, BEP, recovery, quantity, cost basis, dan exposure setelah DCA.

Tampilkan label `Simulasi — belum menjadi transaksi`. Tombol `Gunakan sebagai draft BUY` membuka form berisi data simulasi; user tetap menekan Simpan di form. Simulasi tidak menulis ledger. Saat harga berubah, jangan diam-diam mengubah asumsi simulasi; tawarkan pembaruan harga.

### Journal, watchlist, analytics, settings

- Journal: layout yang nyaman menulis, section thesis/entry/review, status save, dan perlindungan draft belum tersimpan sesuai pola aplikasi.
- Watchlist: list ringkas dengan harga, target entry, jarak terhadap target dan label arah, tombol catat BUY.
- Analytics: terapkan token visual yang sama, pertahankan definisi metrik. “Belum cukup posisi tertutup” bila sampel belum tersedia.
- Settings: pertahankan konfigurasi yang ada. Hindari membuat currency switch baru tanpa data konversi historis dan definisi valuasi yang benar.

## 12. Format angka dan kualitas data

Gunakan formatter terpusat yang menerima decimal string. Jangan memakai `Number` untuk financial calculation; konversi boleh hanya pada koordinat plotting setelah validasi finite/range. Tooltip dan label membaca string asli.

| Data | Aturan |
|---|---|
| Nilai USD | Dua desimal pada summary; axis boleh compact `$12.4K` |
| Harga token kecil | Adaptive precision; nilai nonzero tidak boleh terlihat `$0.00`; detail/copy dapat membuka precision lengkap |
| Persentase | Biasanya dua desimal; prefix +/− untuk perubahan |
| Nilai unavailable | `—` + penjelasan, bukan nol |
| Nol sungguhan | `0` / `$0.00`, dengan style netral |
| Recovery | Jika harga >0 dan di bawah BEP, pakai rumus engine; jika harga nol/unavailable, `—`; jika quantity nol, tidak berlaku |
| Waktu | Label ringkas, tooltip tanggal/waktu/timezone lengkap |
| Angka panjang | Wrap/layout adaptif atau compact di daftar; full value tetap dapat diakses |

Price freshness menggunakan timestamp quote yang benar-benar dipakai. `fetchedAt` menandakan pengambilan data, bukan otomatis waktu transaksi terakhir di market; jika provider tidak memberi market timestamp, jelaskan sebagai waktu pengambilan.

Tetapkan threshold stale di konfigurasi berdasarkan polling/provider; default awal 90 detik untuk polling 30 detik dapat dipakai setelah audit. Current summary yang mencampur quotes memakai timestamp quote tertua dan status agregat terburuk.

Status yang tampil: `Diperbarui ...`, `Data tertunda`, `Sebagian harga tidak tersedia`, `Offline`, atau `Gagal memperbarui`. Jangan menampilkan indikator “Live” hanya karena timer berjalan.

Untuk partial data, nilai total penuh dan total unrealized PnL menjadi unavailable atau nilai terakhir lengkap dengan badge stale; subtotal diketahui harus terpisah dan berlabel. Aset tanpa harga tidak dihitung bernilai nol.

## 13. Accessibility dan perilaku responsif

Targetkan WCAG 2.2 AA untuk UI yang diubah; butir berikut bukan pengganti audit penuh [R1–R3].

- Kontras teks biasa minimal 4.5:1, teks besar minimal 3:1. Pastikan essential control/graphic dapat dibedakan; border dekoratif boleh subtil.
- Target interaksi produk sekitar 44×44px untuk kontrol utama/mobile. WCAG 2.2 AA mempunyai baseline 24×24px dengan pengecualian; jangan memakai pengecualian sebagai alasan membuat kontrol terlalu kecil.
- Tombol icon mempunyai accessible name; selected range memakai `aria-pressed` atau pola tabs yang benar.
- Fokus keyboard terlihat dan tidak tertutup sticky header. Drawer mengelola focus trap, Escape, label, dan mengembalikan fokus ke trigger.
- Chart memiliki judul/deskripsi, ringkasan periode, serta tombol `Lihat data` untuk tabel timestamp/nilai/status. Tooltip bukan satu-satunya cara membaca data.
- Gunakan dukungan keyboard/accessibility chart sesuai versi library, lalu uji manual [R5].
- Jangan mengumumkan seluruh angka portofolio setiap polling melalui live region. Gunakan pengumuman terbatas untuk save, error penting, dan refresh manual.
- Sediakan `Jeda pembaruan`/`Lanjutkan pembaruan` bila data diperbarui otomatis; status timestamp tetap terlihat. Jeda tampilan tidak perlu menghentikan snapshot backend.
- `prefers-reduced-motion: reduce` menonaktifkan animasi chart, pulse, transisi dekoratif; tidak sekadar memperlambatnya.
- Pada 200% zoom dan lebar 320 CSS px, controls dan teks tetap dapat diakses. Uji chart, drawer, dan tabel secara khusus.
- Error/toast tidak menjadi satu-satunya tempat informasi penting; error form tetap dekat field.

## 14. Arsitektur frontend dan performa

Sesuaikan lokasi file dengan repository; daftar ini merupakan pemisahan tanggung jawab, bukan instruksi membuat duplikasi komponen.

```text
AppShell / Sidebar / MobileNavigation / PageHeader
Panel / Button / SegmentedControl / StatusBadge / EmptyState / Skeleton
MoneyValue / PercentChange / TokenIdentity / DataFreshness
PortfolioHero / PortfolioHistoryChart / HistoryRangeControl
PortfolioSummary / AllocationPanel / PositionsPreview / RecentActivity
TransactionDrawer / AssetSearch / DcaComparison
usePortfolioHistory / portfolioHistoryAdapter / centralized formatters
```

Aturan implementasi:

1. Reuse TanStack Query; jangan membuat interval terpisah dalam setiap row atau component.
2. Current prices memakai batch endpoint dan cadence PLAN 15–30 detik sesuai konfigurasi aktual. History cukup refresh mengikuti snapshot, misalnya 5 menit, dan setelah koreksi ledger.
3. Query key history mencakup portfolio scope dan range. Cegah late response range lama menggantikan tampilan baru.
4. Cache/price source tetap di backend; tidak ada API key provider di frontend.
5. Hentikan polling tampilan saat tab hidden sesuai kebutuhan; refetch ketika kembali aktif. Jangan mengubah snapshot job backend.
6. Skeleton hanya untuk initial load, dengan ukuran panel tetap agar tidak layout shift. Background refresh mempertahankan data dan scroll.
7. Gunakan pagination yang ada pada daftar besar. Tambahkan virtualization hanya jika profiling menunjukkan kebutuhan.
8. Pisahkan render chart dari hover state seluruh dashboard. Jangan redraw animasi penuh pada setiap polling.
9. Hindari dependency UI baru jika primitive yang ada sudah memadai. Library baru harus punya alasan yang dicatat.
10. Gunakan route-level lazy loading bila arsitektur saat ini mendukung; jangan merombak bundler demi optimasi spekulatif.

## 15. Tahapan eksekusi dan acceptance criteria

### Phase 0 — Audit dan baseline

- [ ] Baca codebase project ini, reference.html, package manifests, route map, komponen, API, schema, test, dan price polling.
- [ ] Jalankan baseline build/typecheck/test yang tersedia. Catat kegagalan lama secara terpisah.
- [ ] Petakan endpoint nyata ke summary, positions, history, dan transaksi.
- [ ] Tentukan jalur history §9 dan dampak schema; catat keputusan tanpa mengarang API yang belum tersedia.
- [ ] Ambil screenshot baseline dashboard desktop/mobile jika environment mendukung.

**Gate:** agent mengetahui komponen yang diubah, aturan bisnis yang dipertahankan, dan sumber chart. Tidak ada reset/seed destruktif.

### Phase 1 — Tokens dan app shell

- [ ] Implementasikan tokens §6 dan primitive yang diperlukan.
- [ ] Rapikan sidebar/header/mobile drawer dengan route lama tetap bekerja.
- [ ] Terapkan typography, number alignment, focus state, dan spacing.

**Gate:** semua navigasi lama tetap bisa diakses; tidak ada page overflow pada 390px; primary CTA jelas; perubahan tidak memutus alur existing.

### Phase 2 — History data dan adapter

- [ ] Reuse history atau tambahkan migration additive + snapshot job minimum.
- [ ] Implementasikan kualitas data, timestamp, scope, coverage, gap, dan koreksi ledger.
- [ ] Pastikan decimal strings dan current-price service tetap digunakan dengan benar.
- [ ] Tambahkan tests khusus perilaku history yang baru, bukan menyalin seluruh financial engine.

**Gate:** endpoint history berasal dari data nyata, scoped dengan benar, tidak melakukan backfill palsu, tidak menulis snapshot setiap polling, dan tidak membuat duplikat per bucket.

### Phase 3 — Dashboard utama

- [ ] Bangun hero chart sesuai ukuran dan urutan §5–7.
- [ ] Implementasikan range, tooltip, modal aktif opsional, accessible data table, dan seluruh state §9.4.
- [ ] Tambahkan summary, allocation, positions preview, recent activity.
- [ ] Implementasikan status freshness dan delta nilai yang tidak disebut return.

**Gate:** pada 1440×900 chart menjadi panel terbesar dengan plot ≥340px; tidak ada summary cards besar di atas chart; seluruh widget terhubung API aktual.

### Phase 4 — Alur dan halaman pendukung

- [ ] Perbarui transaksi, asset detail, DCA, journal, watchlist, transactions, analytics, settings yang sudah ada.
- [ ] Pastikan input tetap stabil saat polling; flow simulasikan → draft → simpan tetap eksplisit.
- [ ] Semua data PLAN masih dapat diakses, walau sebagian dipindahkan ke detail/expanded view.

**Gate:** BUY, DCA, partial SELL, full SELL, journal save, dan watchlist tetap berfungsi. Tidak ada dead CTA atau fitur lama yang hilang.

### Phase 5 — QA dan penyelesaian

- [ ] Jalankan gate build/typecheck/lint/test repository yang relevan.
- [ ] Verifikasi visual dan interaksi sesuai matriks §16.
- [ ] Perbaiki overlap, clipping, focus, zero-width chart, dan empty/error states.
- [ ] Dokumentasikan migration/job/configuration baru, keputusan history, dan keterbatasan aktual.
- [ ] Berikan ringkasan perubahan, hasil verifikasi, dan screenshot akhir desktop/mobile bila tersedia.

**Gate:** seluruh P0/P1 selesai atau blocker dijelaskan dengan bukti; jangan menyebut selesai jika chart masih memakai fixture atau flow lama rusak.

## 16. Matriks verifikasi

Gunakan Vitest/React Testing Library dan backend tests yang sudah tersedia. Gunakan browser/E2E tooling existing untuk flow penting; tidak wajib menambah framework baru hanya untuk screenshot.

| Skenario | Hasil yang harus diverifikasi |
|---|---|
| BUY 100 @1, BUY 100 @0.5, SELL 50 @1, harga 0.6, fee 0 | Quantity 150; avg 0.75; cost basis 112.50; value 90; realized +12.50; unrealized −22.50 (−20%); recovery +25% |
| BUY baru pada harga tetap | Nilai posisi dapat naik, tetapi UI tidak menyebut kenaikan tersebut return/profit |
| Full SELL | Active value nol, realized tetap tersedia; history tidak disebut kehilangan seluruh saldo |
| Harga null/provider gagal | Tidak muncul price 0 atau PnL −100% palsu |
| Harga kecil dan quantity besar | Adaptive precision benar; raw Decimal tidak rusak |
| 0/1/banyak snapshot | Empty/marker/line sesuai jumlah data; tidak ada random placeholder |
| Snapshot gap dan range terbatas | Garis terputus, available range jelas; delta 30D tidak dipaksakan |
| Edit/delete/backdated transaction | Current metrics dihitung ulang; affected history ditandai; delta lintas koreksi tidak menyesatkan |
| Snapshot concurrent/restart | Tidak duplikat; offline tidak diisi dengan harga saat restart |
| Dua pengguna bila auth sudah ada | Data snapshot, summary, dan history tidak bocor lintas owner |
| Range diganti cepat | Respons lama tidak mengganti range yang aktif |
| Submit dua kali/request gagal | Tidak membuat transaksi dobel; draft tetap ada |
| DCA simulator | Tidak membuat transaksi sebelum form disimpan |
| Keyboard/reduced motion | CTA, range, dialog, data table bisa diakses; dekorasi bergerak berhenti |
| 320, 390, 768, 1024, 1440, 1920px | Tidak ada page overflow; hero dominan; mobile readable |
| Zoom 200%, device pixel ratio tinggi | Tidak clipping; angka, axis, tooltip tetap terbaca |
| 100+ posisi | Dashboard preview terbatas; full list tidak membuat request per row |

Untuk QA visual, gunakan data development deterministik yang menampilkan profit, loss, stale, unknown, dan nama panjang. Jangan memasukkan fixture tersebut sebagai fallback production. Screenshot minimum: desktop normal, mobile normal, dan satu state history kosong/partial.

## 17. Definition of Done

- [ ] Panel chart portofolio adalah pusat dashboard, berukuran besar dan memenuhi target layout.
- [ ] Estetika obsidian/emas/mint/rose terasa konsisten dengan referensi, dengan readability lebih baik.
- [ ] Chart menampilkan nilai posisi aktif yang nyata dan memiliki definisi yang jelas.
- [ ] Histori kosong, terbatas, stale, partial, offline, dan terkoreksi ditangani secara eksplisit.
- [ ] Perubahan akibat BUY/SELL tidak dipresentasikan sebagai return investasi.
- [ ] Avg buy, PnL, recovery BEP, dan semua alur transaksi lama tetap benar.
- [ ] UI responsive, keyboard-accessible, dan tidak bergantung pada warna saja.
- [ ] PostgreSQL tetap satu-satunya komponen Docker; tidak ada rewrite stack yang tidak diperlukan.
- [ ] Tidak ada random market data, API key frontend, dead button, atau klaim live tanpa dukungan data.
- [ ] Build dan verifikasi relevan lulus; keterbatasan environment/data dijelaskan dengan jujur.

## 18. Prompt eksekusi untuk AI Agent

```text
Implementasikan REDESIGN.md pada repository Trading Journal yang sudah ada.
Baca AGENTS.md bila tersedia, PLAN.md, dan referensi 075-market-data-art.html.
Mulai dari audit singkat lalu lanjutkan implementasi bertahap sampai P0 dan P1 selesai.

Prioritas utama: hero chart nilai posisi aktif yang besar sebagai fokus dashboard,
tema obsidian dengan aksen emas halus, layout profesional, dan responsive mobile.
Pertahankan stack, route yang bekerja, ledger transaksi, financial engine, dan database.

Gunakan history yang sudah valid; jika belum ada, implementasikan observed snapshots
sesuai dokumen. Jangan membuat fake chart atau menganggap BUY/SELL sebagai return.
Reuse komponen/library yang sesuai. Jangan melakukan reset database atau major upgrade.

Setelah setiap phase, laporkan singkat:
- phase dan status;
- perubahan utama serta file terkait;
- verifikasi yang benar-benar dijalankan;
- blocker/keputusan penting;
- tahap selanjutnya.

Teruskan otomatis untuk keputusan implementasi rutin. Pada akhir pekerjaan,
berikan hasil build/test, bukti visual bila tersedia, dan keterbatasan yang masih ada.
Jangan klaim pengujian atau screenshot yang tidak benar-benar dilakukan.
```

## 19. Referensi praktik implementasi

Diakses 4 Oktober 2026. Ukuran layout, warna, prioritas, dan cadence snapshot dalam dokumen ini adalah keputusan desain proyek; bukan kewajiban dari sumber di bawah. Selalu cocokkan dokumentasi library dengan versi yang terpasang.

- **[R1] W3C — Contrast (Minimum):** rasio kontras teks. https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
- **[R2] W3C — Target Size (Minimum):** target interaksi dan pengecualiannya. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- **[R3] W3C — Pause, Stop, Hide:** kontrol atas informasi bergerak dan auto-updating. https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html
- **[R4] Recharts — Chart size:** ukuran parent dan responsive chart sesuai versi. https://recharts.github.io/en-US/guide/sizes/
- **[R5] Recharts — Accessibility:** dukungan keyboard dan accessibility layer; tetap lakukan verifikasi manual. https://github.com/recharts/recharts/wiki/Recharts-and-accessibility

Referensi internal: `PLAN(1).md` dan `075-market-data-art(1).html` yang disertakan pengguna. Dokumen ini tidak mengubah kedua file tersebut.
