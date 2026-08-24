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
USE customer_portal;

-- Verify new customers
SELECT * FROM customers;

-- Verify global codes were properly reserved
SELECT * FROM global_customers;

-- Verify handling agent codes
SELECT * FROM handling_agents;

-- Verify GSTIN records attached to customers
SELECT * FROM customer_gstins;
```