# Customer Registration Portal

A complete full-stack web application designed for processing and managing customer registrations, mimicking the behavior of Indian Railways' CRIS FOIS system.

The application allows users to register as a new customer (which generates a unique 4-character Global Customer Code or Handling Agent Code) or look up their existing customer records to update missing information.

## System Architecture

The system follows a classic 3-tier architecture with a complete local development database. All external dependencies (Oracle, Supabase) have been removed in favor of a local MySQL database with local file storage.

```
React Frontend (Vite, Port 5173)
       ↓ (HTTP REST via /api/* proxy)
Backend API (Node.js/Express, Port 4000)
       ↓ (mysql2 with Connection Pool & Transactions)
MySQL Database (Port 3306, Database: customer_portal)
```

**Security constraints enforced:**
- The React frontend **never** connects directly to MySQL.
- Database credentials exist **only** on the backend inside `.env`.
- No sensitive information (passwords) is stored in the frontend codebase.

## Prerequisites

1. **Node.js** (v18 or newer)
2. **MySQL Server** (8.0+)
3. **npm** (comes with Node.js)

## Database Setup (MySQL)

1. Ensure MySQL is running on your local machine (`localhost:3306`).
2. Log into MySQL as `root`:
   ```bash
   mysql -u root -p
   ```
3. Run the schema creation script from the root of the project:
   ```bash
   source database/mysql_schema.sql;
   ```
4. *(Optional but recommended)* Load the seed/test data:
   ```bash
   source database/mysql_seed.sql;
   ```

### Database Tables

- `global_customers`: Master table for Global Customer Codes (max 4 chars, unique).
- `handling_agents`: Master table for Handling Agent Codes (max 4 chars, unique).
- `customers`: Main application table for storing customer profile data. Links to either a global code or handling agent code.
- `customer_gstins`: Stores one-to-many state-wise GSTINs for each customer.

> Note: PAN and GSTIN PDF documents are saved to the backend local filesystem inside `backend/uploads/` instead of BLOBs to improve database performance. The file paths are stored in the database.

## Backend Setup

1. Navigate to the `backend` directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create your environment variables file:
   ```bash
   cp .env.example .env
   ```
4. Edit `.env` and set your MySQL password:
   ```
   DB_PASSWORD=YourMysqlRootPassword
   ```
5. Start the backend development server:
   ```bash
   npm run dev
   ```
   The backend runs on `http://localhost:4000`. It will auto-create the `uploads/` directory on startup.

## Frontend Setup

1. Open a new terminal and navigate to the `frontend` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. The application will be available at **http://localhost:5173**.

## Application Workflows

### 1. Old User Flow (Update Existing)
- The user enters an existing **Customer Code** (e.g., `TEST001`).
- The frontend calls `GET /api/customers/TEST001`.
- The backend queries MySQL and returns all known data (Company Name, Address, PAN, GSTINs, etc.).
- The form is auto-populated.
- The user can add missing data (e.g., upload a missing PAN card PDF) or modify existing fields.
- Clicking Submit calls `PUT /api/customers/TEST001`.
- The backend safely updates **only** the modified fields using a safe merge strategy (it will never overwrite an existing MySQL value with `NULL` simply because the frontend field was empty).

### 2. New Entry Flow (Create New)
- The user enters their **Company Name**.
- They select either "Global Code" or "Handling Agent Code".
- The frontend debounces the input and calls `POST /api/codes/generate-global` (or handling).
- The backend generates a 4-character code (e.g., `Rajesh Engineering Works` -> `REWO`).
- The backend checks MySQL (`global_customers` or `handling_agents`). If `REWO` exists, it applies suffix variations (`REW1`, `REW2`) until a unique code is found.
- The unique code is displayed on the frontend.
- When the user fills out the rest of the form (including mandatory PDF uploads) and clicks Submit, it calls `POST /api/customers`.
- The backend opens a **MySQL Transaction**.
- It inserts the code into the parent table (`global_customers` / `handling_agents`), then inserts the main record into `customers`, then inserts multiple rows into `customer_gstins`. If any step fails, the entire transaction rolls back.

## API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Backend status check |
| `GET` | `/api/customers/:code` | Fetch full profile for an existing customer |
| `POST`| `/api/customers` | Register a new customer (JSON body + transaction) |
| `PUT` | `/api/customers/:code` | Safely update an existing customer |
| `PUT` | `/api/customers/:code/pan-file` | Upload PAN PDF (multipart/form-data) |
| `GET` | `/api/customers/:code/gstins` | Fetch all GSTINs for a customer |
| `POST`| `/api/customers/:code/gstins` | Add a new GSTIN (with optional PDF) |
| `PUT` | `/api/customers/:code/gstins/:id` | Update a GSTIN / upload replacement PDF |
| `DELETE`| `/api/customers/:code/gstins/:id`| Remove a GSTIN |
| `GET` | `/api/customers/:code/gstins/:id/file`| Download/view a GSTIN PDF |
| `POST`| `/api/codes/generate-global` | Generate a unique global code |
| `POST`| `/api/codes/generate-handling` | Generate a unique handling agent code |

## Verification Queries

To manually verify that data is persisting in MySQL, use a tool like MySQL Workbench or the CLI, and run:

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

-- Verify new customers
SELECT * FROM customers;

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

-- Verify GSTIN records attached to customers
SELECT * FROM customer_gstins;
```

## Document Scanning and Verification

The active MySQL/Node implementation scans uploaded PDFs through the backend:

```
PAN PDF -> PDF text extraction -> OCR fallback -> PAN detection -> comparison -> verification
GST PDF -> PDF text extraction -> OCR fallback -> GSTIN/address detection -> comparison -> verification
```

The endpoints `POST /api/documents/pan/scan` and `POST /api/documents/gstin/scan` accept a
5 MB PDF in the `document` field. Text-based PDFs are parsed first; scanned PDFs are rendered
and OCRed with Tesseract. PAN uses `^[A-Z]{5}[0-9]{4}[A-Z]$`; GSTIN uses the standard
15-character format. GST addresses are normalized for case, punctuation, whitespace, common
abbreviations, and PIN code before similarity matching.

The existing PAN and per-customer GSTIN upload endpoints re-scan documents on the backend.
They reject invalid, unreadable, mismatched, or address-mismatched documents and only mark
records `VERIFIED` after the comparison succeeds. Each GSTIN retains its own file reference,
registered address, GSTIN status, and address status. Files remain outside the database and are
stored under the configured backend upload directory; database credentials and file paths are
never exposed to the frontend. `database/07_add_document_verification.sql` adds the metadata
columns to an existing MySQL database.

Both Old User reload/update and New Entry upload flows use the same per-document endpoints.
Submission validation blocks a pending or failed scan, and the server remains the final authority.