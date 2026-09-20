# Xeoscape

A generic, store-type-agnostic point-of-sale (POS) desktop application, licensed to **Xeoscape**.

Xeoscape is a point-of-sale and shop ERP for **clothing retail**. Product fields, validation rules, and the UI are built around garments — type, colour, size, fabric, MRP vs selling price — and the app includes a barcode label generator for tagging stock.

> Earlier versions shipped as a multi-industry build (pharmacy, grocery, restaurant and so on). That has been reduced to the Apparel / Fashion edition. The store-type mechanism itself is intact, so another edition can be reintroduced by adding entries to `config/store-types.json`, `config/product-fields.json` and `config/activation-keys.json` — no code changes.

**Architecture:** a thin native **Tauri** (Rust) shell wraps an unchanged **Node.js/Express** backend, which persists data with the embedded **NeDB** database. The backend runs as a background "sidecar" process that the shell starts automatically and controls; you never interact with it directly.

---

## Table of Contents

1. [Requirements](#requirements)
2. [First-Time Setup](#first-time-setup)
3. [Running in Development](#running-in-development)
4. [Building the Installer](#building-the-installer)
5. [Running Tests](#running-tests)
6. [Project Structure](#project-structure)
7. [Configuration](#configuration)
8. [Activation & Login](#activation--login)
9. [Data, Backups & Migrations](#data-backups--migrations)
10. [CSV Bulk Import](#csv-bulk-import)
11. [API Overview](#api-overview)
12. [Troubleshooting](#troubleshooting)
13. [License](#license)

---

## Requirements

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 18.x or later | 20.x/22.x LTS recommended |
| npm | 9.x or later | Ships with Node.js |
| [Rust](https://rustup.rs/) | stable, latest | Needed only to build/run the desktop shell (`npm run tauri:dev` / `tauri:build`) — not needed just to run the backend via `npm run server` |
| Tauri prerequisites (Windows) | — | Microsoft C++ Build Tools + WebView2 Runtime (usually already present on Windows 10 1803+ / Windows 11). Full list: <https://v2.tauri.app/start/prerequisites/> |

You do **not** need to separately install the WiX Toolset, NSIS, or any other installer-building tool — Tauri's own bundler downloads and manages what it needs automatically the first time you run a build.

---

## First-Time Setup

```bash
cd Xeoscape
npm install
```

That's the only setup step needed before development. `npm install` pulls in everything: Express/NeDB (runtime), Jest (tests), `@yao-pkg/pkg` (backend packaging), and `@tauri-apps/cli` (the Tauri build tool). Rust dependencies are fetched separately by Cargo the first time you actually run a Tauri command (see below) — that first run downloads ~250-300MB of crates and takes a few minutes; subsequent builds are much faster since Cargo caches them.

---

## Running in Development

There are two ways to run the app while working on it:

### Option A — Backend only, in a browser (fastest iteration)

```bash
npm run server
```

Starts the Express backend at `http://127.0.0.1:4173`, which also serves the frontend. Open that URL in any browser. This is the quickest way to test backend/frontend changes — no Rust/Tauri involved at all.

### Option B — Full desktop app via Tauri

```bash
npm run tauri:dev
```

This packages the backend into a standalone binary, then launches the real native app window (menu bar, icon, everything) with hot-reload on the Rust side. The first run will download and compile ~250-300 Rust crates (several minutes); after that, rebuilds are fast.

The default port is **4173**; override it with `PORT=5000 npm run server` if needed (also update `src-tauri/tauri.conf.json`'s `devUrl`/window `url` and `src-tauri/src/main.rs`'s `BACKEND_PORT` constant to match if you change it permanently).

---

## Building the Installer

```bash
npm run tauri:build
```

This:
1. Compiles the Node backend into a standalone executable via `pkg` (`src-tauri/binaries/xeoscape-backend-x86_64-pc-windows-msvc.exe`)
2. Builds the Rust shell and bundles both into a Windows installer

**Output:** `src-tauri/target/release/bundle/msi/Xeoscape_2.1.0_x64_en-US.msi` — a single self-contained file, no companion files needed (unlike the old Squirrel-based installer, which needed a `RELEASES` file and `.nupkg` alongside the `.exe`).

The unpacked app (for quick testing without installing) is at `src-tauri/target/release/xeoscape.exe` — running it directly also launches the backend sidecar automatically.

> If a build fails partway through, delete `src-tauri/target` and `src-tauri/binaries/*` before retrying, and make sure your project folder isn't inside a OneDrive-synced directory — active cloud sync can interfere with the many small files a Rust/installer build writes.

---

## Running Tests

```bash
npm test              # everything
npm run test:unit     # core managers, cart logic, CSV helpers, backups
npm run test:integration   # live API integration tests
```

Expected: **9 test suites / 65 tests, all passing.** These only exercise the Node backend directly — no Rust toolchain needed to run them.

```bash
npm run lint
```

---

## Project Structure

```
Xeoscape/
├── server.js                # Express server -- the whole backend; also the pkg entry point
├── renderer.js               # Frontend entry point (loaded by index.html)
├── index.html                 # App shell
├── app.config.js               # Central app configuration, data-dir resolution
├── build.js                     # Production build orchestration (gulp -> pkg -> tauri build)
├── api/                          # Express route handlers
├── core/                          # Business logic (products, inventory, transactions,
│                                     reports, backups, NeDB store wrapper, logger)
├── config/                         # store-types.json, product-fields.json,
│                                      permissions.json, activation-keys.json
├── scripts/
│   └── seed-grocery.js               # Sample catalog seeder
├── data/
│   ├── schemas/                        # Schema + validation reference
│   ├── migrations/                      # v2-migration.js (legacy -> flexible schema)
│   └── store/                            # Dev-mode NeDB data files (created on first run)
├── assets/
│   ├── css/                                # Stylesheets
│   ├── images/                              # Logo, icon, placeholder product image
│   └── js/
│       ├── core/                              # app.js, router.js, event-bus.js, session.js
│       ├── modules/                            # products, cart, checkout, customers,
│       │                                          transactions, settings (incl. backups)
│       ├── shared/                              # api-client, utils, validators, formatters
│       ├── ui/                                   # modal, table, notification, CSV import modal
│       └── native_menu/                           # Tauri menu event bridge
├── src-tauri/                                       # Rust desktop shell
│   ├── src/main.rs                                    # Spawns backend sidecar, builds native
│   │                                                     menu, shows window once backend is ready
│   ├── Cargo.toml
│   ├── tauri.conf.json                                 # Window, bundle (MSI), sidecar config
│   ├── capabilities/default.json                        # Tauri v2 permission grants
│   ├── icons/                                             # Generated from assets/images/icon.ico
│   └── binaries/                                           # Packaged backend .exe lands here (gitignored)
├── tests/
│   ├── unit/                                                # product/transaction/backup managers,
│   │                                                           CSV helpers, cart logic
│   └── integration/                                           # api.test.js (live server)
├── gulpfile.js                                                  # CSS/JS bundling pipeline
├── jest.config.js
└── LICENSE
```

---

## Configuration

### Store type

This build ships a single store type, `apparel`, so there is nothing to switch between. Its
product fields live in `config/product-fields.json` and cover garment type, department, size,
colour, fabric, brand, MRP, selling price, HSN code and stock levels.

To add another edition, add matching entries to `config/store-types.json`,
`config/product-fields.json` and `config/activation-keys.json` — no code changes required.

### App settings

`app.config.js` controls the app name, port, default window size, and data directory resolution (which automatically adapts to dev / packaged-binary / Tauri-sidecar contexts — see comments in that file for details).

### Roles & permissions

`config/permissions.json` (`admin`, `manager`, `cashier`).

---

## Activation & Login

Activation is required before first use; login is required on every launch.

### Activation key

| Store Type | Activation Key |
|---|---|
| Apparel / Fashion | `APRL-FASH-3K8N-2026` |

A key both unlocks the app and sets the matching store type. These live in plain text in `config/activation-keys.json` — a licensing/edition gate, not cryptographic DRM. Change them before commercial distribution if real key management is needed.

### Login

Default account, auto-created on first run if no users exist:
- **Username:** `admin`
- **Password:** `admin`

Change its password and add staff accounts from the Users screen once logged in.

---

## Barcode Labels

Garment tags are generated and printed from inside the app — no separate label software.

### Generating barcodes

Clothing stock often arrives with no scannable code at all. Two formats are available:

| Format | Looks like | Use it for |
|---|---|---|
| **CODE128** | `TSHI-BLU-M-0042` | Readable in-store SKUs. A stock count or returns desk can read the tag without a scanner. |
| **EAN-13** | `2000000000015` | A standard 13-digit retail barcode. Prints far narrower, so it fits small tags. |

Allocation happens server-side (`POST /api/inventory/barcodes/generate`), because uniqueness
can only be checked against the whole catalogue and two tills adding stock at once must not be
handed the same number. In-store EAN-13 codes use the GS1 `20–29` restricted-distribution
prefix, so they can never collide with a real manufacturer's barcode on branded stock.

Codes are returned but **not** reserved — nothing is consumed until a product is saved with
one, so an abandoned "New Product" form doesn't burn numbers.

- **Per garment**: the 🏷 button on any product row, or **Generate** next to Barcode / SKU in
  the product form.
- **In bulk**: Settings → Barcode Labels.

### Tagging stock in, and selling it

Booking a delivery in and printing its tags is one step, deliberately. A printed barcode that
isn't backed by a product scans to nothing at the till — it can never be sold and can never
deduct stock. So **Add to stock & queue labels** does all of it at once:

1. Allocates a barcode for the garment.
2. Creates the product in inventory (type, colour, size, price).
3. Books the quantity in as a **restock** movement, so the arrival shows in stock history.
4. Queues that many labels to print.

The quantity is both the stock booked in and the number of tags printed, which is what keeps
the two in step — twelve tees arriving means twelve in stock and twelve tags.

From then on the loop is automatic:

```
tag in 13 → print 13 tags → stick on garments
                ↓
        scan tag at the till
                ↓
     sale deducts stock: 13 → 10
```

Overselling is refused, and a return puts the garment back on the rail.

**A repeat delivery restocks the existing line.** Eight more navy medium tees next month are
the same product, so they reuse the existing barcode and the stock figure goes to 20 — rather
than creating a second product whose totals have to be added up by hand. Matching is on
garment type, colour and size, ignoring case and spacing. A change to any of those three is a
genuinely different garment and gets its own barcode.

Matching requires all three attributes. A partial match is deliberately *not* treated as the
same garment: quietly merging a delivery into the wrong line is far more damaging than a
duplicate someone can spot and merge later.

**Reprints don't touch stock.** A torn tag is replaced from the catalogue search, or from the
🏷 button on a product row. Neither changes the stock figure.

### Printing

**Settings → Barcode Labels** builds a batch. Garments can be added from the catalogue, or
typed in directly — pick the garment type (T-Shirt, Cargo Pant, Half Pant…), enter the colour
and size, and a barcode is allocated on the spot.

The label carries the garment type, colour and size, plus an optional price, product name and
store name. Print sizes:

| Stock | Sizes |
|---|---|
| Thermal roll | 32×19, 38×25, 40×30, 50×25, 50×30, 58×40, 75×50 mm |
| A4 label sheet | 65, 24, 21 or 14 per page |
| Custom | Any size from 15×8 mm up to A4 |

For part-used sheets, **Skip labels on first sheet** leaves the peeled-off positions blank so
the sheet can be fed back through.

### A note on label width

Everything is laid out in millimetres and printed via a CSS `@page` rule matching the loaded
stock. This matters: without a declared page size the browser assumes A4 and scales the label,
which changes the printed bar width and stops the code scanning.

For the same reason the app warns when a code is too long for the chosen stock. A readable SKU
like `TSHI-BLU-M-0042` on a 38 mm tag prints bars about 0.167 mm wide — below the ~0.19 mm most
handheld scanners resolve. It previews perfectly and then fails at the till. When that warning
appears, use wider stock, switch to EAN-13, or shorten the code.

## Data, Backups & Migrations

Data persists via **NeDB** (an embedded, file-based database — see `core/nedb-store.js`), one `.nedb` file per collection (`products.nedb`, `transactions.nedb`, etc.), stored under a data directory that's resolved automatically depending on context (project-relative in dev, next to the OS's app-data folder when running as the packaged Tauri app).

### Automatic backups

Settings → Data Backups lets you back up on demand or configure automatic daily/weekly backups with a configurable retention count. Each backup is a full timestamped copy of the data directory, kept as a sibling folder (never inside the data directory itself). Backups can be downloaded as a `.zip`, deleted, or restored.

**Restore is applied on the next app restart**, not immediately — this is deliberate: swapping a database's files while it's actively open risks corruption or file-lock errors. A safety snapshot of your current data is always taken automatically right before a restore is applied.

### Seeded sample catalog

```bash
node scripts/seed-grocery.js               # seeds ./data/store
node scripts/seed-grocery.js /path/to/dir  # seeds a custom directory
```
Safe to re-run — existing categories/products (matched by name) are skipped, not duplicated.

### Legacy migration

If migrating from a pre-2.0, single-purpose version of the app:
```bash
node data/migrations/v2-migration.js ./data/store
```
Idempotent — safe to run multiple times.

---

## CSV Bulk Import

Both **Products** and **Categories** support bulk import via CSV, from their respective toolbar "Import CSV" buttons:

1. Click **Download CSV Template** — the columns match the apparel field set (`garmentType`, `size`, `color`, `material`, `mrp`, `hsnCode` and so on).
2. Fill in the template and save it.
3. Choose the file and click **Import**.

Each row is validated independently — a bad row is skipped and reported with its row number and reason, without blocking the rest of the import. Column format notes:
- **number/currency** columns: plain numbers, no currency symbols or thousands separators
- **boolean** columns: `true`/`false`, `1`/`0`, or `yes`/`no`
- **date** columns: `YYYY-MM-DD`

Same template/import pattern is available directly via the API — see below.

---

## API Overview

All endpoints are under `/api`.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Health check |
| GET | `/api/settings` | App info + current store type |
| GET | `/api/settings/store-types` | List available store types |
| POST | `/api/settings/store-type` | Switch active store type |
| GET | `/api/inventory/fields` | Current store type's product field schema |
| POST | `/api/inventory/barcodes/generate` | Allocate unused barcode(s) for garment tagging |
| POST | `/api/inventory/products/tag-in` | Tag a delivery and book it into stock in one step |
| GET/POST | `/api/inventory/products` | List / create products |
| PUT/DELETE | `/api/inventory/products/:id` | Update / delete a product |
| GET | `/api/inventory/products/csv-template` | Download product CSV template |
| POST | `/api/inventory/products/csv-import` | Bulk-import products from CSV |
| GET | `/api/categories/csv-template` | Download category CSV template |
| POST | `/api/categories/csv-import` | Bulk-import categories from CSV |
| GET/POST | `/api/customers` | List / create customers |
| GET/POST | `/api/transactions` | List transactions / checkout |
| POST | `/api/transactions/hold` | Hold an order (Open Tabs), no stock deducted |
| POST | `/api/transactions/:id/pay` | Complete a previously-held order |
| POST | `/api/transactions/:id/void` | Void a transaction (restores stock if it was completed) |
| GET | `/api/transactions/reports/summary` | Sales summary report |
| GET | `/api/transactions/reports/top-products` | Best sellers |
| POST | `/api/users/authenticate` | Staff login |
| GET/POST | `/api/backups` | List / create backups |
| GET | `/api/backups/:name/download` | Download a backup as `.zip` |
| POST | `/api/backups/:name/restore` | Stage a restore (applies on next app restart) |
| GET/PUT | `/api/backups/settings` | Auto-backup schedule/retention settings |

---

## Troubleshooting

**`cargo`/Rust build errors on first `tauri:dev`/`tauri:build`**
The error message points at the exact line — Rust's compiler errors are usually very specific. Common ones: a missing semicolon, a version mismatch between a crate and what's declared in `Cargo.toml`. Paste the exact error if unsure.

**Installed app opens a plain black console window alongside the real app window**
Fixed by `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` at the top of `src-tauri/src/main.rs` (present in this version) — a required attribute for any Rust GUI app on Windows, without which Windows shows a console window by default in release builds.

**App window stays stuck on "Loading Xeoscape..." forever**
This means `renderer.js` (or some other static file) 404'd when the *packaged* binary tried to serve it. Any file served over HTTP by `express.static` (rather than `require()`'d by Node) must be explicitly listed in `package.json`'s `"pkg": { "assets": [...] }` array, or `pkg`'s static analysis won't know to embed it in the compiled binary. Check the app's log file (see below) for 404s, or compare against what's already listed there.

**Where's the log file?**
`%APPDATA%\Xeoscape\logs\app.log` on Windows (Help → View Logs in the app menu jumps straight there). Every `console.log`/`console.error` from the backend is mirrored here, since a packaged GUI app doesn't reliably show output in a terminal.

**Port 4173 already in use**
`PORT=5050 npm run server` (and update `src-tauri/tauri.conf.json` / `main.rs` to match if this needs to be permanent).

**Tests fail with an ES module / `import` syntax error**
Confirm `npm install` completed fully — `babel-jest`, `@babel/core`, `@babel/preset-env` are required to transform the frontend's ES module syntax for Jest.

**Build fails with a file-lock/EBUSY error**
Move the project out of any OneDrive/cloud-synced folder before building — active sync can lock files mid-write during both Rust compilation and `pkg`'s packaging step.

**Data seems "reset"**
Data lives under the resolved data directory's `*.nedb` files (see [Data, Backups & Migrations](#data-backups--migrations)). Deleting them resets the app to blank — expected, useful for testing. Restore from an automatic backup if this was unintentional.

---

## License

This software is licensed to **Xeoscape** under a proprietary license — see [`LICENSE`](./LICENSE) for full terms.

Portions of the point-of-sale UI, payment flow, and settings model were adapted from PharmaSpot, an MIT-licensed open-source project by Patterns Digital Limited. See [`NOTICE.md`](./NOTICE.md) for the required third-party attribution.
