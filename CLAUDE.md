# Spitwater ERP — Project Bible
> Read this entire file before touching any code.
> This is the authoritative reference for architecture, conventions, and current state.

---

## What This Project Is

A full custom ERP system for **Spitwater Australia** — an Australian pressure washer distributor with three revenue streams:
- **Retail** — direct sales to end customers
- **Wholesale** — dealer network (B2B portal)
- **Service** — in-house and field repairs

Built from scratch to replace a patchwork of spreadsheets and legacy tools.

---

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Database | SQL Server 2014 on SERVER006 | DB: `Development_04052026` |
| Backend | Node.js + Express | No ORM — raw `mssql` driver only |
| Frontend | React 18 + Vite | CSS Modules, no Tailwind, no component library |
| Auth | JWT + refresh tokens | bcryptjs for passwords |
| Logging | Winston | `/server/logs/` |
| Package manager | npm | Not yarn |

**Two React apps planned:**
- `/client` — internal ERP (current focus)
- `/client-dealer` — dealer portal (Phase 6+, not started)

---

## Project Structure

```
C:\Projects\spitwater-erp\
├── server/                     ← Express backend
│   ├── server.js               ← Entry point (port 3000)
│   ├── package.json
│   ├── .env                    ← NEVER commit — secrets live here
│   ├── .env.example            ← Safe template — commit this
│   ├── .gitignore
│   ├── config/
│   │   ├── db.js               ← SQL Server connection pool
│   │   └── logger.js           ← Winston logger
│   ├── middleware/
│   │   ├── auth.js             ← JWT verify, requireRole(), requireMinRole()
│   │   └── errorHandler.js     ← asyncHandler wrapper, global error handler
│   ├── routes/
│   │   ├── auth.js             ← /api/auth/* — login, refresh, logout, /me
│   │   ├── users.js            ← /api/users/* — user management
│   │   ├── contacts.js         ← /api/contacts/* — contacts + companies
│   │   ├── dashboard.js        ← /api/dashboard/* — KPIs, activity, docs
│   │   ├── settings.js         ← /api/settings/* — org, smtp, numbering, warehouses, audit
│   │   ├── teams.js            ← /api/teams/* — team management
│   │   └── invite-accept.js    ← /api/invite/* — accept invite flow
│   ├── utils/
│   │   ├── jwt.js              ← signAccessToken, signRefreshToken, verifyToken
│   │   └── password.js         ← hashPassword, verifyPassword (bcrypt)
│   └── scripts/
│       ├── test-db.js          ← node scripts/test-db.js — verify DB connection
│       ├── seed-admin.js       ← Creates first org + super_admin user
│       └── reset-password.js   ← Resets a user password (bypasses shell ! issue)
│
├── client/                     ← React/Vite frontend
│   ├── vite.config.js          ← Proxies /api → localhost:3000, host:true for LAN
│   ├── index.html
│   └── src/
│       ├── main.jsx            ← Entry point
│       ├── App.jsx             ← Router — all routes defined here
│       ├── styles/
│       │   └── global.css      ← Design tokens, reset, shared classes
│       ├── context/
│       │   └── AuthContext.jsx ← Global auth state, login/logout, role helpers
│       ├── api/                ← One file per domain, all use axios client
│       │   ├── client.js       ← Axios instance with JWT interceptor + auto-refresh
│       │   ├── auth.js
│       │   ├── users.js
│       │   ├── contacts.js
│       │   ├── dashboard.js
│       │   └── settings.js     ← settingsApi + teamsApi + inviteApi
│       ├── components/
│       │   └── layout/
│       │       ├── DashboardShell.jsx   ← SAP-style shell: topbar + sidenav + <Outlet/>
│       │       └── DashboardShell.module.css
│       └── pages/
│           ├── auth/
│           │   ├── LoginPage.jsx / .module.css
│           │   └── AcceptInvitePage.jsx / .module.css
│           ├── dashboard/
│           │   ├── HomePage.jsx / .module.css  ← Live KPIs, activity, documents
│           │   └── ProfilePage.jsx
│           ├── contacts/
│           │   ├── ContactsPage.jsx / .module.css   ← List + detail panel
│           │   ├── ContactModal.jsx / .module.css   ← Create/edit form
│           │   └── ContactDetail.jsx / .module.css  ← Right-side panel
│           ├── admin/
│           │   ├── AdminHomePage.jsx / .module.css  ← Admin dashboard
│           │   ├── UsersPage.jsx / .module.css      ← User management
│           │   └── TeamsPage.jsx / .module.css      ← Team management
│           ├── settings/
│           │   ├── SettingsPage.jsx / .module.css   ← Tabbed settings shell
│           │   └── sections/
│           │       ├── OrgSettings.jsx      ← Organisation details
│           │       ├── SmtpSettings.jsx     ← SMTP profiles + test
│           │       ├── NumberingSettings.jsx← Numbering series + live preview
│           │       ├── WarehouseSettings.jsx← Warehouses
│           │       ├── AuditLog.jsx         ← Searchable audit log viewer
│           │       └── Section.module.css   ← Shared section styles
│           └── NotFoundPage.jsx
│
├── ERP_SCHEMA_COMPLETE.sql     ← Full DB schema — already deployed to SERVER006
└── CLAUDE.md                   ← This file
```

---

## Database

**Server:** SERVER006 (SQL Server 2014)
**Database:** `Development_04052026`
**Auth:** SQL Authentication as `sa`
**Connection config:** `server/.env` — never committed

### Key facts about the schema
- **148 tables** — all deployed and live
- **No DELETE statements anywhere** — ever. This is a hard rule. Use `is_void = 1` or `is_active = 0`.
- **FIFO mandatory** for inventory — `fifo_cost_layers` table, consumed via `sp_fifo_consume` stored procedure
- **Double-entry accounting** — every business event posts a journal entry atomically
- **Audit log is immutable** — trigger prevents UPDATE/DELETE on `audit_log`
- **Org-scoped** — every query filters by `org_id = req.user.orgId`

### Schema was deployed with:
```sql
-- Run in SSMS against Development_04052026
-- File: ERP_SCHEMA_COMPLETE.sql (idempotent — safe to re-run)
```

### Key tables (most referenced)
```
organisations         ← Single org (id=1, Spitwater Australia)
org_settings          ← Org config, email settings, XLS settings
users                 ← All system users
org_members           ← Links users to org with role
invites               ← Pending invite tokens
refresh_tokens        ← Stored hashed refresh tokens
audit_log             ← Immutable event log
chart_of_accounts     ← AU standard CoA (seeds via setup wizard)
tax_codes             ← GST, FRE, EXP etc. (seeds via setup wizard)
contacts              ← Customers, suppliers, dealers
contact_addresses     ← Billing/shipping addresses
companies             ← Company records linked to contacts
products              ← Product master (ERP IS the PIM)
stock_levels          ← qty_on_hand per product per warehouse
fifo_cost_layers      ← FIFO cost tracking (mandatory)
documents             ← All transactional docs: invoice, quote, PO, etc.
document_lines        ← Line items
journal_entries       ← Double-entry accounting
journal_lines         ← Debit/credit lines
smtp_configurations   ← SMTP profiles
email_queue           ← Outbound email queue
email_log             ← Permanent email audit log
numbering_series      ← Invoice/PO/job number sequences
warehouses            ← Physical stock locations
service_jobs          ← Service/repair jobs
warranties            ← Warranty registrations
```

---

## Authentication & Security

### JWT flow
1. `POST /api/auth/login` → returns `accessToken` (8h) + `refreshToken` (7d)
2. All protected routes: `Authorization: Bearer <accessToken>`
3. On 401: Axios interceptor auto-refreshes using `POST /api/auth/refresh`
4. On refresh failure: force logout, redirect to `/login`
5. `POST /api/auth/logout` → revokes refresh token in DB

### Roles (highest to lowest)
```
super_admin  → can do everything, bypasses all role checks
admin        → can manage users, settings, all data
editor       → can create/edit business data
viewer       → read-only
```

### Middleware usage
```js
router.use(requireAuth);                          // All routes in file need auth
router.get('/list', asyncHandler(handler));        // No role restriction beyond auth
router.post('/', requireMinRole('editor'), ...);  // Editor and above
router.delete('/', requireRole('admin'), ...);    // Admin and super_admin only
```

### Password note
- PowerShell `!` character causes issues in readline prompts
- Use `reset-password.js` script to set passwords — it reads from the file, not a prompt

---

## Backend Conventions

### Route pattern — always follow this exactly
```js
'use strict';
const express = require('express');
const router  = express.Router();
const { sql, pool, poolConnect } = require('../config/db');
const { requireAuth, requireRole, requireMinRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../config/logger');

router.use(requireAuth); // always first if all routes need auth

router.get('/', asyncHandler(async (req, res) => {
  await poolConnect;                          // always await this first
  const orgId = req.user.orgId;              // always scope to org

  const rows = await pool.request()
    .input('org_id', sql.Int, orgId)
    .query('SELECT * FROM table WHERE org_id = @org_id');

  return res.json({ success: true, data: rows.recordset });
}));

module.exports = router;
```

### Query result access — CRITICAL
```js
// CORRECT — always use .recordset
const result = await pool.request()...query('...');
const row    = result.recordset[0];
const rows   = result.recordset;

// WRONG — never do this (returns undefined always)
const row = result[0];
```

### Standard API response format
```js
// Success list
{ success: true, data: [...], meta: { total, page, limit, pages } }

// Success single
{ success: true, data: { id, ... } }

// Success action
{ success: true, message: 'Contact updated.' }

// Error
{ success: false, error: 'Human readable message.', code: 'OPTIONAL_CODE' }
```

### Registering a new route in server.js
```js
// In the imports section:
const myRoutes = require('./routes/my-route');

// In the routes section:
app.use('/api/my-resource', myRoutes);
```

### Audit logging — add to all create/update operations
```js
await pool.request()
  .input('org_id',      sql.Int,           req.user.orgId)
  .input('user_id',     sql.Int,           req.user.userId)
  .input('user_email',  sql.VarChar(200),  req.user.email)
  .input('user_name',   sql.NVarChar(200), req.user.name)
  .input('entity_id',   sql.BigInt,        newId)
  .input('entity_ref',  sql.NVarChar(100), refString)
  .input('description', sql.NVarChar(1000), `Created contact: ${name}`)
  .query(`
    INSERT INTO audit_log (org_id, user_id, user_email, user_name, action_type,
      entity_type, entity_id, entity_ref, description, occurred_at)
    VALUES (@org_id, @user_id, @user_email, @user_name, 'contact.create',
      'contact', @entity_id, @entity_ref, @description, GETDATE())
  `);
```

---

## Frontend Conventions

### CSS Modules — always use them
```jsx
import styles from './MyPage.module.css';
// Then: className={styles.myClass}
// For combining: className={[styles.a, styles.b].join(' ')}
// With global: className={`${styles.card} fade-up`}
```

### Global CSS classes (from global.css — use directly, no import needed)
```
Layout:  .card .card-head .card-body .card-title
Buttons: .btn .btn-primary .btn-outline .btn-ghost .btn-danger .btn-sm .btn-lg
Pills:   .pill .pill-blue .pill-green .pill-orange .pill-red .pill-grey
Forms:   .form-group .form-label .form-input
Table:   .table-wrap (wrap any <table> in this)
Modal:   .modal-backdrop .modal .modal-head .modal-body .modal-foot .modal-title
Spinner: .spinner (white, for dark backgrounds) .spinner-dark (for light backgrounds)
Anim:    .fade-up
```

### No emoji in JSX source files
Emoji in JSX causes parse errors on some Windows/Vite setups. Use unicode escapes or just avoid them:
```jsx
// WRONG
<span>☀️ Good morning</span>

// RIGHT
<span>Good morning</span>
// or
<span>{'\u2600\uFE0F'} Good morning</span>
```

### Icons — always inline SVG, never an icon library
```jsx
function MyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="..." />
    </svg>
  );
}
```

### API calls — always use the api/ layer, never fetch directly
```jsx
import { contactsApi } from '../../api/contacts';

// In component:
const { data } = await contactsApi.list({ search, type, page });
setContacts(data.data);
setMeta(data.meta);
```

### Auth context usage
```jsx
import { useAuth } from '../../context/AuthContext';

const { user, isAdmin, isSuperAdmin, isEditor, isAuthenticated, login, logout } = useAuth();
```

### Route guards in App.jsx
```jsx
<RequireAuth>     ← any logged-in user
<RequireAdmin>    ← admin or super_admin only
<GuestOnly>       ← redirects away if already logged in
```

### Adding a new page — checklist
1. Create `src/pages/mymodule/MyPage.jsx` + `MyPage.module.css`
2. Create `src/api/mymodule.js` with API functions
3. Add route to `App.jsx`
4. Add nav link to `DashboardShell.jsx`
5. Add backend route to `server/routes/mymodule.js`
6. Register in `server/server.js`

---

## Design System

### Colour tokens (CSS variables — defined in global.css)
```css
/* Navigation / dark */
--nav-bg, --navy, --navy-mid, --navy-lt
--accent: #2F7FE8    --accent-lt: #5499ED   --accent-dim: rgba(47,127,232,0.12)
--steel: #7B93B0     --mist: #B8C9DC

/* Light UI (main content) */
--bg: #F0F4F9        --card: #FFFFFF         --border: #DDE6F0
--text: #1A2E45      --text-sub: #5A7292

/* Status */
--green / --green-dim    --orange / --orange-dim
--red / --red-dim        --purple / --purple-dim
```

### Layout dimensions
```css
--nav-width: 240px       --nav-collapsed: 60px
--topbar-h: 56px         --radius: 10px
```

---

## Current State — What's Built

### Phase 1 — Backend foundation ✅
- Express server with CORS, helmet, rate limiting, compression
- SQL Server connection pool (config/db.js)
- Winston logging
- JWT auth with auto-refresh
- Role-based middleware

### Phase 2 — Auth API ✅
- `POST /api/auth/login` — bcrypt verify, JWT issue, audit log
- `POST /api/auth/refresh` — silent token refresh
- `POST /api/auth/logout` — revoke refresh token
- `GET  /api/auth/me` — current user profile
- `POST /api/auth/change-password`
- `GET  /api/invite/verify?token=` — check invite validity
- `POST /api/invite/accept` — create account from invite, auto-login

### Phase 3 — React shell ✅
- Login page (real API call, JWT storage, role-based redirect)
- DashboardShell (SAP-style collapsible nav, topbar, user menu)
- Role-aware navigation (admin sees admin sections + settings)
- Protected routes (RequireAuth, RequireAdmin)
- Axios interceptor with silent token refresh
- AcceptInvitePage (password strength meter, auto-login after accept)

### Phase 4a — Contacts ✅
- `GET/POST /api/contacts` — list (search, filter, paginate) + create
- `GET/PATCH /api/contacts/:id` — detail + update
- `PATCH /api/contacts/:id/void` — soft archive
- `GET/POST /api/contacts/companies` — company list + create
- ContactsPage — searchable table, click-to-open detail panel
- ContactModal — 3-tab create/edit form (Details, Address, Financial)
- ContactDetail — right-side panel with archive flow

### Phase 4a — Users & Teams (admin) ✅
- `GET/POST /api/users` — list + invite
- `PATCH /api/users/:id/role` — change role
- `PATCH /api/users/:id/deactivate` — soft deactivate
- `GET/POST /api/teams` — list + create teams (stored as JSON in org_settings)
- `PATCH/DELETE /api/teams/:id` — rename/delete
- `POST/DELETE /api/teams/:id/members/:uid` — add/remove members
- UsersPage — table with role change dropdown, invite modal with link
- TeamsPage — expandable team cards, colour picker, member management

### Phase 4a — Settings ✅
All under `/settings` with sidebar tab navigation:
- **Organisation** — name, ABN, address, bank details, GST, financial year
- **Email & SMTP** — create/edit/delete/test SMTP profiles
- **Numbering Series** — create series, live number preview, seed defaults button
- **Warehouses** — create/edit warehouses, dealer visibility
- **Audit Log** — searchable, filterable, paginated audit log viewer

### Dashboard ✅
- `GET /api/dashboard/kpis` — live revenue, receivables, stock, service jobs
- `GET /api/dashboard/activity` — recent audit log formatted for display
- `GET /api/dashboard/documents` — recent documents
- HomePage shows real data, shimmer skeletons while loading, proper empty states

---

## What's NOT Built Yet (build in this order)

### Phase 4b — Products
Tables: `products`, `product_categories`, `product_images`, `price_lists`, `price_list_items`, `units_of_measure`
Routes needed: `/api/products`, `/api/categories`, `/api/price-lists`
Pages needed: ProductsPage, ProductModal, ProductDetail

### Phase 4c — Quotes → Sales Orders → Invoices
Tables: `documents`, `document_lines`, `document_kit_lines`, `document_status_log`
This is the biggest module. Key flows:
- Create quote → send by email → convert to sales order → convert to invoice → receive payment
- document_type: 'quote' | 'sales_order' | 'invoice' | 'credit_note'
- CPQ pricing cascade: promotion → special_price → discount_matrix → price_list → product default
- Every posted invoice creates a journal entry via posting_rules

### Phase 4d — Purchasing
Tables: `documents` (purchase_order, goods_receipt), `fifo_cost_layers`, `landed_costs`
Flows: Raise PO → receive goods → FIFO layers created → landed cost allocation

### Phase 4e — Service Jobs
Tables: `service_jobs`, `service_job_lines`, `service_appointments`, `labour_entries`, `warranties`, `warranty_claims`

### Phase 4f — Inventory / WMS
Tables: `stock_levels`, `stock_movements`, `bin_stock`, `pick_waves`, `picking_lists`, `stocktake_sessions`

### Phase 4g — Accounting
Tables: `journal_entries`, `journal_lines`, `accounting_periods`, `bas_periods`, `chart_of_accounts`
Pages: Journal viewer, BAS calculator, Aged receivables report

### Phase 5 — Email sending (nodemailer)
Background worker polling `email_queue` every 30s. Templates with token substitution.

### Phase 6 — Dealer portal
Separate React app `/client-dealer`. Dealer login, available stock, order placement, warranty registration.

---

## Environment Variables (.env)

```env
# Server
PORT=3000
NODE_ENV=development

# Database — SQL Server 2014
DB_SERVER=SERVER006
DB_PORT=1433
DB_DATABASE=Development_04052026
DB_USER=sa
DB_PASSWORD=<actual password — never commit>
DB_ENCRYPT=false
DB_TRUST_CERT=true
DB_WINDOWS_AUTH=false

# JWT
JWT_SECRET=<64+ char random hex — generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
JWT_EXPIRES_IN=8h
JWT_REFRESH_EXPIRES_IN=7d

# CORS — Vite dev server + LAN access
CORS_ORIGIN=http://localhost:5173,http://192.168.x.x:5173

# Bcrypt
BCRYPT_ROUNDS=10
LOG_LEVEL=debug
```

---

## LAN Access (other machines on the network)

1. `client/vite.config.js` must have `host: true` in `server:` config
2. Windows Firewall: open ports 3000 and 5173
3. CORS_ORIGIN in `.env` must include `http://YOUR-IP:5173`
4. Other users access: `http://YOUR-IP:5173`

---

## Git Workflow

```powershell
# Check status
git status

# Stage all changes
git add .

# Commit
git commit -m "Phase 4b: Products — list, detail, create/edit"

# Push
git push origin main
```

**Never commit:**
- `server/.env` (in .gitignore)
- `server/node_modules/`
- `client/node_modules/`
- `server/logs/*.log`

---

## Running the App

```powershell
# Terminal 1 — Backend (from server/)
npm run dev          # nodemon, auto-restarts on save, port 3000

# Terminal 2 — Frontend (from client/)
npm run dev          # Vite, hot reload, port 5173

# Test DB connection
node scripts/test-db.js

# Create first admin (if starting fresh)
node scripts/seed-admin.js

# Reset a password (avoids PowerShell ! issue)
node scripts/reset-password.js
```

---

## Important Business Rules

1. **No DELETE** — ever. Void with `is_void = 1`. Deactivate with `is_active = 0`.
2. **FIFO only** — inventory must use `fifo_cost_layers` + `sp_fifo_consume`. No average cost.
3. **Every document posts a journal** — atomically. Document status only changes if journal succeeds.
4. **Org scoping** — every query must filter by `org_id`. Never return cross-org data.
5. **Australian GST** — 10% standard rate. Tax codes: GST, FRE, EXP, INP, GNA, N-T.
6. **No ORM** — raw `mssql` driver queries only. Typed inputs always (prevents SQL injection).
7. **Correction documents** — invoice errors → credit note + reissue. Never edit posted docs.
8. **Audit everything** — every create/update writes to `audit_log`.
9. **Passwords** — never store plain text. Always bcrypt. Never log passwords.

---

## First Admin User

- Email: `edoardo@spitwater.com`
- Role: `super_admin`
- Org: Spitwater Australia (id=1)
- Password: set via `reset-password.js` (don't type special chars in PowerShell prompts)

---

## Useful Commands for Claude Code

```bash
# Read a file before editing
cat server/routes/contacts.js

# Check syntax before saving
node --check server/routes/myroute.js

# Run DB connection test
cd server && node scripts/test-db.js

# Check what's registered in server.js
grep "require\|app.use" server/server.js

# Find all route files
ls server/routes/

# Find all page components
find client/src/pages -name "*.jsx" | sort

# Git status
git status
git log --oneline -10
```
