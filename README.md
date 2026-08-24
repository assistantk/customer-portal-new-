# Customer Registration Portal

An IntelliJ IDEA-ready full-stack customer-registration application for Indian Railways (CRIS), designed for FOIS migration.

## Architecture

```
┌──────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│   Frontend (Vite │ ───▶ │  Backend (Express│ ───▶ │  Oracle Database    │
│   + React)       │ HTTP │  + oracledb TS)  │ SQL  │  TEST / FOIS PROD   │
└──────────────────┘      └──────────────────┘      └─────────────────────┘
     :5173 (dev)           :4000 (/api/*)                MEMGLBLCUST
     Vite proxy: /api                                    MEMGLBLHNDGAGNT
     → localhost:4000                                    MEMWGONOWNRSHIP
                                                         MEMWGONOWNRPRTY
                                                         MEMCUSTOMER       (NEW)
                                                         MEMCUSTOMERGSTIN  (NEW)
```

The **frontend never connects to Oracle directly**. All DB access goes through the Express API. Credentials are in environment variables only.

## Stack

| Layer     | Technology |
|-----------|-----------|
| Frontend  | React, Vite, Lucide icons |
| Backend   | Node.js, Express, TypeScript, `oracledb` |
| Database  | Oracle (FOIS-compatible tables) |

## Prerequisites

- **Node.js 20+** and npm
- **Oracle Instant Client** (for `oracledb` driver)
- Access to an Oracle database instance (local or remote)

## Quick Start

### 1. Database Setup

Run the SQL scripts against your Oracle instance in order:

```sql
-- As DBA or schema owner
@database/01_create_tables.sql
@database/02_constraints.sql
@database/03_indexes.sql
-- For TEST/DEV only:
@database/04_sample_data.sql
-- User authentication table:
@database/06_create_users_table.sql
COMMIT;
```

### 2. Backend

```powershell
cd backend
copy .env.example .env
# Edit .env — fill in Oracle credentials:
#   DB_HOST, DB_PORT, DB_SERVICE, DB_USERNAME, DB_PASSWORD
npm install
npm run dev
# → http://localhost:4000 (health check: /api/health)
```

### 3. Frontend

```powershell
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

Vite automatically proxies `/api/*` to `http://localhost:4000`.

## Environment Variables (backend/.env)

| Variable | Default | Notes |
|----------|---------|-------|
| `DB_HOST` | localhost | Oracle host |
| `DB_PORT` | 1521 | Oracle listener port |
| `DB_SERVICE` | ORCL | PDB / Service name |
| `DB_USERNAME` | **required** | Schema owner |
| `DB_PASSWORD` | **required** | Never commit |
| `DB_POOL_MIN / MAX / INCREMENT` | 4 / 20 / 2 | Connection pool |
| `PORT` | 4000 | API port |
| `CORS_ORIGIN` | `http://localhost:5173` | Frontend origin |
| `CODE_MAX_LENGTH` | **4** | Must stay 4 until FOIS expands VARCHAR2(4) columns |
| `CODE_MAX_RETRIES` | 50 | Unique code generation fail-safe |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/customers/:code` | Fetch customer by code |
| `POST` | `/api/customers` | Create new customer |
| `PUT`  | `/api/customers/:code` | Update existing customer |
| `GET`  | `/api/customers/:code/gstins` | List all GSTINs |
| `POST` | `/api/customers/:code/gstins` | Add GSTIN (multipart w/ file) |
| `PUT`  | `/api/customers/:code/gstins/:id` | Update GSTIN |
| `DELETE` | `/api/customers/:code/gstins/:id` | Delete GSTIN |
| `GET`  | `/api/customers/:code/gstins/:id/file` | Download GSTIN file |
| `POST` | `/api/codes/generate-global` | Generate unique Global Code |
| `POST` | `/api/codes/generate-handling` | Generate unique Handling Agent Code |
| `POST` | `/api/auth/register` | Create a new user account |
| `POST` | `/api/auth/login` | Authenticate and log in |

## FOIS Migration

When moving from TEST to FOIS production:

1. Skip `04_sample_data.sql`.
2. Run scripts 01 → 02 → 03.
3. Set `NODE_ENV=production` in `.env`.
4. Point `DB_HOST/PORT/SERVICE/USERNAME/PASSWORD` at FOIS database.
5. No code changes required — only `.env` updates.

## Sample Data (Test)

| Table | Count | Notes |
|-------|-------|-------|
| `MEMGLBLCUST` | 3 | `NYIL`, `NYI1`, `SCC0`. `NYI2` free for duplicate-code test |
| `MEMGLBLHNDGAGNT` | 2 | `ATPL`, `RPAL` |
| `MEMCUSTOMER` | 2 | `CUST001` (1 GSTIN), `CUST002` (4 GSTINs) |
| `MEMCUSTOMERGSTIN` | 5 | Multi-state GSTINs |

Test Old User flow with `CUST001` or `CUST002`.

## Project Layout

```
backend/               Node.js Express API (TypeScript + oracledb)
├── .env.example       Copy → .env, fill Oracle creds
├── src/
│   ├── server.ts      Express entry, CORS, error handler
│   ├── config/        env.ts, database.ts (pool + withTransaction)
│   ├── controllers/   customerController, gstinController, codeController
│   ├── routes/        customerRoutes, codeRoutes
│   ├── middleware/     errorHandler (ORA- mapping, stack masking)
│   └── utils/         codeGenerator, validators

frontend/              React Vite application
├── src/
│   ├── pages/         CustomerRegistration.jsx, Login.jsx, SignUp.jsx
│   ├── services/      customerService.js, authService.js (API clients)
│   └── styles/        registration.css, login.css, signup.css, zone-dropdown.css

database/              Oracle SQL scripts (run in order)
├── 01_create_tables.sql
├── 02_constraints.sql
├── 03_indexes.sql
├── 04_sample_data.sql
├── 06_create_users_table.sql   (NEW — user authentication)
└── README.md

src/                   Legacy Spring Boot (MySQL) — not used for Oracle
```

## Authentication & Sign Up Flow

### Sign Up

1. User clicks **Sign Up** on the Login page → navigated to the Sign Up page.
2. User fills in **Email ID**, **Username**, **Password**, and **Confirm Password**.
3. Client-side validation runs (required fields, email format, username format, password strength, password match).
4. `POST /api/auth/register` is called with the form data.
5. Backend validates inputs, checks for duplicate email/username, hashes the password with bcrypt, and inserts into `MEMUSERS`.
6. On success: "Account created successfully. Please sign in." → redirects to Login.

### Login

1. User enters **Username**, **Password**, and **Captcha** on the Login page.
2. `POST /api/auth/login` is called.
3. Backend looks up the user by username, verifies the password hash with bcrypt.
4. On success: user is authenticated and redirected to the Customer Registration portal.

### Validation Rules

| Field | Rules |
|-------|-------|
| Email ID | Required, valid email format, unique |
| Username | Required, 3–50 chars, starts with a letter, alphanumeric + `_` `-`, unique |
| Password | Required, min 8 chars, 1 uppercase, 1 lowercase, 1 digit, 1 special character |
| Confirm Password | Must match Password exactly |

### Database Table

`MEMUSERS` — stores user accounts (passwords are bcrypt-hashed, never plaintext).

| Column | Type | Notes |
|--------|------|-------|
| `MAVUSERID` | `NUMBER IDENTITY` | Auto-generated PK |
| `MAVEMAIL` | `VARCHAR2(255)` | Unique |
| `MAVUSERNAME` | `VARCHAR2(100)` | Unique |
| `MAVPASSWORDHASH` | `VARCHAR2(255)` | bcrypt hash |
| `MACACTIVEFLAG` | `CHAR(1)` | Default `'Y'` |
| `MADCREATEDDATE` | `DATE` | Default `SYSDATE` |

## Troubleshooting

- **Oracle connection refused:** Verify Oracle is running and `.env` credentials are correct.
- **Frontend cannot reach API:** Confirm backend is on :4000 and Vite proxy is configured.
- **ORA-12514 (listener):** Check `DB_SERVICE` matches the actual PDB/service name.
- **Port in use:** Change `PORT` in `.env` and Vite will proxy accordingly.