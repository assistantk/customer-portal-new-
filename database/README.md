# Customer Registration — Database & Backend Setup

Oracle-backed Customer Registration application with FOIS migration-ready schema.

> Active local deployment note: the application in this workspace uses the MySQL schema
> (`mysql_schema.sql`) and Node backend. The Oracle/Supabase material below is legacy migration
> documentation and is not used by the active registration flow.

## MySQL Document Verification

Run `07_add_document_verification.sql` after `mysql_schema.sql` when upgrading an existing
database. It adds PAN verification status and per-GSTIN registered address, GSTIN verification
status, and address verification status. Documents are stored as files under `backend/uploads`
and only their metadata/reference is stored in MySQL.

PAN processing is `PDF -> text extraction -> OCR fallback -> PAN detection -> normalized
comparison -> VERIFIED`. GST processing is `GST PDF -> text extraction -> OCR fallback ->
GSTIN and registered-address detection -> GSTIN comparison -> address similarity comparison ->
VERIFIED`. The backend exposes `POST /api/documents/pan/scan` and
`POST /api/documents/gstin/scan`, and re-scans files during PAN/GST uploads before persisting
verification metadata. GST address matching gives the PIN code priority and tolerates case,
line breaks, punctuation, whitespace, and common abbreviations.

Both Old User and New Entry flows use the same backend checks. Multiple GSTIN rows are kept
independent, so each state/GSTIN is verified against its own PDF and address. Invalid PDFs,
OCR failures, undetected values, identifier mismatches, and address mismatches are rejected;
the frontend cannot mark a document verified by itself.

## Architecture

```
┌──────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│   Frontend (Vite │ ───▶ │  Backend (Express│ ───▶ │  Oracle Database    │
│   + React + TS)  │ HTTP │   + oracledb)    │ JDBC │  TEST / FOIS PROD  │
└──────────────────┘      └──────────────────┘      └─────────────────────┘
     /customer-reg           /api/*                       MEMGLBLCUST
                                                           MEMGLBLHNDGAGNT
                                                           MEMWGONOWNRSHIP
                                                           MEMWGONOWNRPRTY
                                                           MEMCUSTOMER       (NEW)
                                                           MEMCUSTOMERGSTIN  (NEW)
```

The **frontend never connects to Oracle directly**. All DB access goes through the
Express API, which uses environment variables for credentials.

---

## 1. Database — Script Execution Order

Run the following `database/*.sql` scripts in order as a DBA or schema owner:

| Order | Script | Purpose |
|-------|--------|---------|
| 1 | `01_create_tables.sql` | Creates FOIS reference tables + new MEMCUSTOMER / MEMCUSTOMERGSTIN tables + GSTIN sequence |
| 2 | `02_constraints.sql` | PKs, FKs, Unique + Check constraints (PAN, GSTIN, mobile, pincode, Active flags) |
| 3 | `03_indexes.sql` | Performance indexes on search columns + FK columns |
| 4 | `04_sample_data.sql` | **TEST ONLY** — 2 customers, multi-state GSTINs, duplicate-code scenario |
| 5 | `05_add_gstin_file_path.sql` | Adds Supabase Storage object path metadata for existing databases |

Example execution using Oracle SQL\*Plus or SQL Developer:

```sql
@01_create_tables.sql
@02_constraints.sql
@03_indexes.sql
@05_add_gstin_file_path.sql
-- for TEST / DEV only:
@04_sample_data.sql
COMMIT;
```

### Sample Data Summary (04_sample_data.sql)

| Entity | Count | Notes |
|--------|-------|-------|
| `MEMGLBLCUST` | 3 rows | `NYIL`, `NYI1`, `SCC0`. **`NYI2` intentionally free** to test duplicate-code fallback generation (`NYIL` → `NYI1` → `NYI2`) |
| `MEMGLBLHNDGAGNT` | 2 rows | `ATPL`, `RPAL` |
| `MEMCUSTOMER` | 2 rows | `CUST001` (NY Infra, Global `NYIL`, 1 GSTIN) · `CUST002` (Sharma Construction, Handling `ATPL`, 4 GSTINs) |
| `MEMCUSTOMERGSTIN` | 5 rows | 1 UP GSTIN for CUST001 · Delhi / WB / MH / KA for CUST002 |

Try Old User flow with `CUST001` and `CUST002`.

---

## 2. FOIS Table Preservation Guarantee

The following tables & columns are reproduced **verbatim** from FOIS.
**Do not rename, retype, or resize without FOIS team sign-off:**

### MEMGLBLCUST (FOIS Global Customer Master)

| Column | Type | Nullable |
|--------|------|----------|
| `MAVGLBLCUSTCODE` | `VARCHAR2(4)` | NOT NULL · **PK** |
| `MAVGLBLCUSTNAME` | `VARCHAR2(45)` | ✓ |
| `MAVGLBLCUSTADDRTEXT` | `VARCHAR2(100)` | ✓ |
| `MAVGNBLCUSTCITYNAME` | `VARCHAR2(30)` | ✓ |
| `MAVCENTBLNG` | `VARCHAR2(1)` | ✓ |
| `MAVPCOCODE` | `VARCHAR2(3)` | ✓ |
| `MAVEDMNDFLAG` | `VARCHAR2(1)` | ✓ |
| `MADIMPLDATE` | `DATE` | ✓ |
| `MAVIMPLREMK` | `VARCHAR2(35)` | ✓ |
| `MADEDMNDDATE` | `DATE` | ✓ |

### MEMGLBLHNDGAGNT (FOIS Handling Agent Master)

| Column | Type | Nullable |
|--------|------|----------|
| `MAVHNDGAGNTCODE` | `VARCHAR2(4)` | NOT NULL · **PK** |
| `MAVHNDGAGNTNAME` | `VARCHAR2(45)` | NOT NULL |
| `MAVHNDGAGNTADDRTEXT` | `VARCHAR2(100)` | ✓ |
| `MAVHNDGAGNTCITYNAME` | `VARCHAR2(30)` | ✓ |
| `MAVCENTBLNG` | `VARCHAR2(1)` | ✓ |
| `MAVPCOCODE` | `VARCHAR2(3)` | ✓ |
| `MAVEDMNDFLAG` | `VARCHAR2(1)` | ✓ |
| `MADIMPLDATE` | `DATE` | ✓ |
| `MAVIMPLREMK` | `VARCHAR2(35)` | ✓ |
| `MADEDMNDDATE` | `DATE` | ✓ |

### MEMWGONOWNRSHIP · MEMWGONOWNRPRTY

Also kept exactly as supplied — column names, data types, PKs unchanged.

### Migration to FOIS Production

When moving from **TEST ORACLE → FOIS ORACLE**:

1. Skip `04_sample_data.sql`.
2. Run scripts 01 → 02 → 03 against a FOIS change window.
3. Only the two *new* tables and supporting indexes will be created; existing FOIS rows in `MEMGLBLCUST`, `MEMGLBLHNDGAGNT`, `MEMWGONOWNRSHIP`, `MEMWGONOWNRPRTY` are **left untouched** (no `CREATE OR REPLACE`, no drops, no column mutations).
4. Point the backend at the FOIS connection string via environment variables (change only `.env`, no code edits).

---

## 3. Backend — Run Locally

### 3.1 Install

```powershell
cd backend
copy .env.example .env
# Edit .env and fill Oracle credentials
npm install
```

### 3.2 Environment Variables (backend/.env)

All DB configuration is external — no credentials in source.

| Variable | Default | Notes |
|----------|---------|-------|
| `DB_HOST` | localhost | Oracle host |
| `DB_PORT` | 1521 | Oracle listener port |
| `DB_SERVICE` | ORCL | PDB / Service name |
| `DB_USERNAME` | **required** | Schema owner (never `SYS` / `SYSTEM`) |
| `DB_PASSWORD` | **required** | Never commit this file |
| `DB_POOL_MIN / MAX / INCREMENT` | 4 / 20 / 2 | Tune for FOIS |
| `PORT` | 4000 | API HTTP port |
| `CORS_ORIGIN` | `http://localhost:5173` | Vite dev origin |
| `CODE_MAX_LENGTH` | **4** | ⚠ Must stay at `4` until FOIS expands `VARCHAR2(4)` columns. See §4. |
| `CODE_MAX_RETRIES` | 50 | Fail-safe for unique suffix search |

### 3.3 Start Backend

```powershell
cd backend
npm run dev        # TypeScript watch (tsx) → http://localhost:4000
# or
npm run build && npm start
```

Health check: <http://localhost:4000/api/health>

---

## 4. Code Generation — 4-Character Critical Limit

**RULE:** `MAVGLBLCUSTCODE` and `MAVHNDGAGNTCODE` are `VARCHAR2(4)` in FOIS today.
The backend `CODE_MAX_LENGTH=4` (env) enforces this ceiling.

### Example flow

```
Company Name:     NY Infra Limited
                 ↓ (strip suffixes: LTD, PRIVATE, PVT, LLP, INC, LTD, etc.)
Cleaned tokens:   [NY, INFRA]
                 ↓ (first letters)
Base code:        NYIL
                 ↓ Check MEMGLBLCUST.MAVGLBLCUSTCODE
                    NYIL exists → try NYI1
                    NYI1 exists → try NYI2
                    NYI2 FREE   ✓ → reserve NYI2 in MEMGLBLCUST (row-level)
```

If FOIS later expands both columns to e.g. `VARCHAR2(5)`, set `CODE_MAX_LENGTH=5`
in the backend `.env` and restart. **No code changes required.**

### Global vs Handling uniqueness scopes

- **Global Codes** are reserved in `MEMGLBLCUST.MAVGLBLCUSTCODE`
- **Handling Agent Codes** are reserved in `MEMGLBLHNDGAGNT.MAVHNDGAGNTCODE`

The two namespaces are independent. A new customer picks EITHER a Global Code OR a
Handling Agent Code (enforced by check constraint `CK_MEMCUSTOMER_CODE_PRESENT`
and by backend validation).

### Concurrent uniqueness safety

1. API reads existing codes to pick a candidate.
2. `INSERT`s immediately (via `reserveUniqueCode`) inside a transaction.
3. On `ORA-00001` (PK / unique violation), the API retries with the next variation.
4. DB-level PKs are the final authority — no race-condition window where two
   requests get the same code.

---

## 5. REST API Reference

Base URL: `http://localhost:4000/api`

### Customers

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/customers/:customerCode` | Fetch customer master by Customer Code. 404 if missing. |
| `POST` | `/customers` | Create new customer + reserve Global/Handling code + insert GSTIN metadata |
| `PUT`  | `/customers/:customerCode` | Update existing customer master row (editable fields + PAN) |

### GSTINs

| Method | Path | Description |
|--------|------|-------------|
| `GET`    | `/customers/:customerCode/gstins` | List all GSTINs for a customer (metadata only, no file content) |
| `POST`   | `/customers/:customerCode/gstins` | Add GSTIN row — `multipart/form-data` with optional `gstinFile` (PDF ≤ 5MB) |
| `PUT`    | `/customers/:customerCode/gstins/:gstinId` | Update GSTIN row + optionally replace its Supabase PDF |
| `DELETE` | `/customers/:customerCode/gstins/:gstinId` | Remove GSTIN row from DB |
| `GET`    | `/customers/:customerCode/gstins/:gstinId/file` | Stream GSTIN file (inline download) |

### Code Generation (Dry-run + Reserve)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/codes/generate-global`   | `{ companyName, reserve?: boolean }` | Produce next unique Global Code. `reserve=true` inserts it into `MEMGLBLCUST` atomically. |
| `POST` | `/codes/generate-handling` | `{ companyName, reserve?: boolean }` | Same for Handling Agent (`MEMGLBLHNDGAGNT`). |

### Error handling

- All errors return `{ success: false, message, statusCode, details? }`.
- Oracle errors are mapped to safe HTTP statuses:
  - `ORA-00001` (unique) → `409 Conflict` with offending field
  - `ORA-02290` (check) → `400 Bad Request`
  - `ORA-02291/2292` (FK) → `409 Conflict`
- In production (`NODE_ENV=production`) stack traces and raw SQL messages are stripped.
- The frontend never sees Oracle credentials or connection strings.

---

## 6. Frontend — Run Locally

```powershell
# from project root
npm install
# (backend must also be running on :4000 — Vite proxies /api there)
npm run dev
# → http://localhost:5173/customer-registration
```

Vite proxy is pre-configured in `vite.config.ts`:

```ts
proxy: {
  '/api': { target: process.env.VITE_API_BASE_URL || 'http://localhost:4000' }
}
```

---

## 7. End-to-End Flow Checklist

### Old User Flow (Default page)

1. Open `/customer-registration` → **Old User** is active.
2. Enter `CUST002` → click **Search Database**.
3. Form auto-populates:
   - Company, Address, City, Pincode, PAN, Email, Mobile
   - Handling Agent Code `ATPL`
   - 4 existing GSTIN rows (Delhi / WB / Maharashtra / Karnataka) each with file name + `Download` link.
4. Update PAN, add a new GSTIN row, attach a file for it.
5. Click **Submit Request** →
   - Customer master → `UPDATE MEMCUSTOMER`
   - New GSTIN → `INSERT MEMCUSTOMERGSTIN`
   - Updated GSTINs → `UPDATE MEMCUSTOMERGSTIN`
   - Removed GSTINs → `DELETE MEMCUSTOMERGSTIN`
6. Form is reloaded from DB to confirm changes.

### New Entry Flow

1. Switch to **+ New Entry** → form resets blank.
2. Type a company name (e.g. `NY Infra Limited`) → blur the field →
   API generates a unique code (`NYIL` → `NYI1` → `NYI2` as needed).
3. Toggle between **Global Code** / **Handling Agent** — the generated code updates.
4. Fill PAN, Email, Mobile, Address, etc.
5. Add 4 GSTIN rows with States + numbers.
6. Click **Submit Request** → transaction commits (code → MEMCUSTOMER → all GSTINs together; any failure rolls back entirely).

### Duplicate Code Scenario

1. Run `04_sample_data.sql` (it pre-seats `NYIL` + `NYI1` in `MEMGLBLCUST`).
2. New Entry → enter `NY Infra Limited` → blur → the UI shows
   a toast: `Base "NYIL" already taken → generated unique NYI2`
   (variation 3).

---

## 8. Constraints / Validation Matrix

| Check | DB | Backend | Frontend |
|-------|:--:|:-------:|:--------:|
| Required fields (name, GSTIN state & number) | ✓ via NOT NULL + check | ✓ validators | ✓ per-row errors |
| PAN format `AAAAA9999A` | `CK_MEMCUSTOMER_PAN_FORMAT` | `isValidPAN()` | live regex icon |
| GSTIN 15-char format | `CK_MEMCUSTGSTIN_FORMAT` | `isValidGSTIN()` | live regex icon + state-code cross-check |
| GSTIN uniqueness per customer | `UQ_MEMCUSTGSTIN_CUST_GSTIN` | ✓ (list dedupe) | dedupe validation toast |
| 10-digit Indian mobile | `CK_MEMCUSTOMER_MOBILE` | `isValidIndianMobile()` | input mask (digits only) |
| 6-digit pincode | `CK_MEMCUSTOMER_PINCODE` | `isValidPincode()` | input mask |
| PCO / STD 2-3 digits | `CK_MEMCUSTOMER_PCOCODE` | `isValidPCO()` | input mask |
| Active flag Y/N | `CK_MEMCUSTOMER_ACTIVEFLAG` + GSTIN equivalent | ✓ validators | (default Y, not exposed) |
| Exactly one of Global / Handling code | `CK_MEMCUSTOMER_CODE_PRESENT` | ✓ `validateCustomer` | radio toggle + helper |
| Code length ≤ 4 | `VARCHAR2(4)` PK column + backend check | `CODE_MAX_LENGTH` env | `maxLength=4` input + FOIS disclaimer |
| GSTIN file type PDF | (back-end multer) | `ALLOWED_GSTIN_FILE_TYPES` | input `accept=` |
| GSTIN file ≤ 5 MB | Supabase Storage path metadata, multer `limits.fileSize` | `MAX_GSTIN_FILE_SIZE` | per-file size toast |
| No SQL injection / raw SQL exposure | — | parameterized queries via `oracledb` binds | all calls through `/api` proxy, no raw SQL |

---

## 9. Authentication Tables

### MEMUSERS (User Login/Registration)

Created by `06_create_users_table.sql`. Stores portal user accounts.

| Column | Type | Notes |
|--------|------|-------|
| `MAVUSERID` | `NUMBER IDENTITY` | Auto-generated PK |
| `MAVEMAIL` | `VARCHAR2(255)` | Unique, NOT NULL |
| `MAVUSERNAME` | `VARCHAR2(100)` | Unique, NOT NULL |
| `MAVPASSWORDHASH` | `VARCHAR2(255)` | bcrypt hash — **NEVER plaintext** |
| `MACACTIVEFLAG` | `CHAR(1)` | Default `'Y'` |
| `MADCREATEDDATE` | `DATE` | Default `SYSDATE` |

**Sign Up Flow:**

```
User enters: Email + Username + Password + Confirm Password
    ↓
Frontend validates (format, match, strength)
    ↓
POST /api/auth/register
    ↓
Backend validates → checks duplicate email → checks duplicate username
    ↓
bcrypt.hash(password, 10) → INSERT INTO MEMUSERS
    ↓
"Account created successfully. Please sign in."
    ↓
Redirect to Login page
```

**Login Flow:**

```
User enters: Username + Password + Captcha
    ↓
POST /api/auth/login
    ↓
SELECT from MEMUSERS WHERE username matches
    ↓
bcrypt.compare(password, stored hash)
    ↓
Success → redirect to application
```

**Dev-mode bypass:** If `MEMUSERS` table does not exist and `NODE_ENV !== 'production'`, login accepts any credentials so the app is usable during development without Oracle auth setup.

---

## 10. How to Check Database Data Manually

Use **Oracle SQL\*Plus**, **SQL Developer**, or any Oracle client.

### Connect to the Database

```sql
-- Using SQL*Plus
sqlplus <username>/<password>@<host>:<port>/<service_name>

-- Example:
sqlplus customer_admin/mypassword@localhost:1521/ORCL
```

### List All Tables

```sql
SELECT table_name FROM user_tables ORDER BY table_name;
```

### View All Data in Each Table

```sql
-- Global Customer Codes
SELECT * FROM MEMGLBLCUST;

-- Handling Agent Codes
SELECT * FROM MEMGLBLHNDGAGNT;

-- Registered Customers
SELECT * FROM MEMCUSTOMER;

-- Customer GSTINs
SELECT * FROM MEMCUSTOMERGSTIN;

-- User Accounts (passwords are hashed — you won't see plaintext)
SELECT MAVUSERID, MAVEMAIL, MAVUSERNAME, MACACTIVEFLAG, MADCREATEDDATE
FROM MEMUSERS;
```

### Filtered Queries

```sql
-- Find a specific customer by code
SELECT * FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = 'CUST001';

-- Check if a Global Code exists
SELECT * FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = 'NYIL';

-- Check if a Handling Agent Code exists
SELECT * FROM MEMGLBLHNDGAGNT WHERE MAVHNDGAGNTCODE = 'ATPL';

-- Find all GSTINs for a customer
SELECT * FROM MEMCUSTOMERGSTIN WHERE MAVCUSTOMERCODE = 'CUST002';

-- Find a user account by username
SELECT MAVUSERID, MAVEMAIL, MAVUSERNAME, MACACTIVEFLAG
FROM MEMUSERS WHERE LOWER(MAVUSERNAME) = 'johndoe';

-- Count records in each table
SELECT 'MEMGLBLCUST' AS TBL, COUNT(*) AS CNT FROM MEMGLBLCUST
UNION ALL SELECT 'MEMGLBLHNDGAGNT', COUNT(*) FROM MEMGLBLHNDGAGNT
UNION ALL SELECT 'MEMCUSTOMER', COUNT(*) FROM MEMCUSTOMER
UNION ALL SELECT 'MEMCUSTOMERGSTIN', COUNT(*) FROM MEMCUSTOMERGSTIN
UNION ALL SELECT 'MEMUSERS', COUNT(*) FROM MEMUSERS;
```

---

## 11. How to Modify Test Data Safely

### UPDATE — Change Existing Records

⚠ **Always use a WHERE clause.** Without one, ALL rows are updated.

```sql
-- ✅ CORRECT: Update a specific customer's PAN
UPDATE MEMCUSTOMER
SET MAVPAN = 'ABCDE1234F'
WHERE MAVCUSTOMERCODE = 'CUST001';

-- Verify the update
SELECT MAVCUSTOMERCODE, MAVPAN FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = 'CUST001';

COMMIT;
```

```sql
-- ❌ DANGEROUS: This updates EVERY customer!
-- UPDATE MEMCUSTOMER SET MAVPAN = 'ABCDE1234F';
-- DO NOT RUN without a WHERE clause.
```

### INSERT — Add Test Records

```sql
-- Insert a new Global Customer Code for testing
INSERT INTO MEMGLBLCUST (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVCENTBLNG, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK)
VALUES ('TST1', 'Test Company', 'N', 'N', SYSDATE, 'Test record');

COMMIT;
```

### DELETE — Remove Test Records

⚠ **Only delete test data.** Always verify with SELECT first.

```sql
-- Step 1: Verify what you're about to delete
SELECT * FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = 'CUST001';

-- Step 2: Delete (GSTINs are auto-deleted via ON DELETE CASCADE)
DELETE FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = 'CUST001';

-- Step 3: Verify deletion
SELECT * FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = 'CUST001';
-- Should return 0 rows

COMMIT;
```

### Best Practice: Test with SELECT First

Before running any UPDATE or DELETE, run the equivalent SELECT to confirm which rows will be affected:

```sql
-- Before UPDATE:
SELECT * FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = 'CUST001';
-- Review the results, then run the UPDATE.

-- Before DELETE:
SELECT COUNT(*) FROM MEMCUSTOMERGSTIN WHERE MAVCUSTOMERCODE = 'CUST001';
-- Confirm the count, then run the DELETE.
```

---

## 12. Database Backup / Safety Guidelines

### Development Rules

1. **Never manually modify production data during development.** Use the TEST environment.
2. **Take a backup before structural changes** (ALTER TABLE, DROP, etc.):
   ```sql
   -- Export with Oracle Data Pump
   expdp <username>/<password>@<service> schemas=<schema> directory=DATA_PUMP_DIR dumpfile=backup.dmp
   ```
3. **Test UPDATE/DELETE statements with SELECT first** — see § 11 above.
4. **Use transactions** — don't set `autoCommit` for multi-step operations:
   ```sql
   -- Make changes
   UPDATE MEMCUSTOMER SET MAVPAN = 'NEWPAN1234' WHERE MAVCUSTOMERCODE = 'CUST001';
   -- Review
   SELECT * FROM MEMCUSTOMER WHERE MAVCUSTOMERCODE = 'CUST001';
   -- If correct:
   COMMIT;
   -- If wrong:
   ROLLBACK;
   ```

### Security Rules

5. **Never expose database credentials in Git.** The `.env` file is in `.gitignore`.
6. **Never commit `.env` files** containing real passwords.
7. **Never put passwords in source code** — use environment variables only.
8. **Never use `SYS` or `SYSTEM`** as the application database user.

---

## 13. Files Summary

```
database/
├── 01_create_tables.sql        FOIS tables + MEMCUSTOMER + MEMCUSTOMERGSTIN + SEQ_…_GSTINID
├── 02_constraints.sql          PK / FK / Unique / Check (PAN, GSTIN, mobile, etc.)
├── 03_indexes.sql              Search + FK performance indexes
├── 04_sample_data.sql          Test seed data (2 customers · 5 GSTINs · NYIL→NYI1→NYI2)
├── 05_add_gstin_file_path.sql  Existing DB migration for GSTIN PDF paths
├── 06_create_users_table.sql   User authentication table (MEMUSERS)
├── schema.sql                  Consolidated schema reference (all tables + constraints)
└── README.md                   This file

backend/
├── .env.example                Copy → .env, fill Oracle creds
├── package.json                npm install ; npm run dev
├── tsconfig.json
└── src/
    ├── server.ts               Express entry, CORS, error handler
    ├── config/
    │   ├── env.ts              Dotenv loader + CODE_MAX_LENGTH wiring
    │   └── database.ts         oracledb pool + withTransaction() helper
    ├── middleware/errorHandler.ts  404, mapped ORA- errors, stack masking in prod
    ├── utils/
    │   ├── codeGenerator.ts    Strip suffixes · base code · fallback suffix · reserve w/ retry on ORA-00001
    │   ├── supabaseStorage.ts  GSTIN PDF upload/download via Supabase Storage
    │   └── validators.ts       PAN / GSTIN / mobile / pincode / customer payloads
    ├── routes/
    │   ├── customerRoutes.ts   GET POST PUT customer + GSTIN CRUD (multer upload)
    │   ├── codeRoutes.ts       POST /generate-global /generate-handling
    │   └── authRoutes.ts       POST /auth/register /auth/login
    └── controllers/
        ├── customerController.ts
        ├── gstinController.ts
        ├── codeController.ts
        └── authController.ts   Registration + Login (bcrypt hashing, dev-mode bypass)

frontend/
├── src/
│   ├── pages/
│   │   ├── Login.jsx           Login page (captcha, real auth API)
│   │   ├── SignUp.jsx          Sign Up page (vertical form, validation)
│   │   └── CustomerRegistration.jsx  Old User + New Entry
│   ├── services/
│   │   ├── authService.js      Auth API client (register, login)
│   │   └── customerService.js  Customer API client
│   ├── styles/
│   │   ├── login.css           Login page styles
│   │   ├── signup.css          Sign Up page styles
│   │   ├── registration.css    Customer Registration styles
│   │   └── zone-dropdown.css   Zone dropdown styles
│   ├── App.jsx                 Page routing (Login ↔ SignUp ↔ CustomerRegistration)
│   └── main.jsx                Entry point, CSS imports
└── vite.config.js              /api proxy to :4000
```

---

## 14. Support / FOIS Migration Checklist

Before cutting over to FOIS production:

- [ ] Confirm `CODE_MAX_LENGTH` stays 4 until FOIS team changes both PK columns.
- [ ] Configure Supabase Storage env vars for GSTIN PDF uploads.
- [ ] Run only `01_create_tables.sql` → `02_constraints.sql` → `03_indexes.sql` → `05_add_gstin_file_path.sql` → `06_create_users_table.sql` (skip sample data).
- [ ] Set backend `NODE_ENV=production` (masks Oracle error details / stack traces, disables auth dev-bypass).
- [ ] Confirm CORS origins list matches reverse-proxy / F5 URLs used for FOIS.
- [ ] Point `DB_HOST / DB_PORT / DB_SERVICE / DB_USERNAME / DB_PASSWORD` at FOIS database (only `.env` changes).
- [ ] Validate against duplicate-code concurrency test (parallel POSTs to `/codes/generate-global`).

