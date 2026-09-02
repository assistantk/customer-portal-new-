# Customer Registration Portal - MASTER PROJECT DOCUMENTATION

## 1. Project Overview
The CRIS Customer Registration Portal is a web application designed to process and manage customer and handling agent registrations for Indian Railways' CRIS FOIS system. It allows users to register as a new entity (generating a unique 4-character Global Customer Code or Handling Agent Code) or look up existing records to update missing information, interacting directly with the CRIS Oracle database schema.

## 2. Technology Stack
The application uses the following active technologies:
- **Frontend**: React (built with Vite)
- **Backend**: Java / Spring Boot
- **Database Connectivity**: JDBC
- **Database**: CRIS Oracle Database
- **Dependencies**: `ojdbc8` (Oracle JDBC Driver), Spring Web, Spring Mail

*(Note: Earlier implementations using Node.js, Express, Prisma, or MySQL are deprecated and no longer actively used for Oracle database operations).*

## 3. Project Structure
- `frontend/`: Contains the React/Vite frontend application (components, pages, services).
- `src/main/java/com/cris/customerportal/`: The Java Spring Boot backend source code.
  - `controller/`: REST API controllers (`CustomerController.java`).
  - `service/`: Business logic and JDBC database operations (`CustomerServiceImpl.java`).
- `src/main/resources/`: Contains backend configuration files (`application.properties`).
- `pom.xml`: Maven dependencies, including the Oracle JDBC driver.

## 4. Application Pages
- **Login**: User authentication screen.
- **Home**: Main portal dashboard.
- **Old User**: Allows existing customers/agents to pull their record via their code, view current data, and submit updates.
- **New Entry**: Registration form for brand new Global Customers or Handling Agents.
- **Verification Screen**: 
  - **Customer Code Verification**: Look up and verify a customer by their 4-character code.
  - **GSTIN Verification**: Search for a customer using their GSTIN.

## 5. DATABASE — CRIS ORACLE
**VERY IMPORTANT**: This application uses the existing CRIS Oracle database. No new tables are created. 

The application interacts with the following actual CRIS tables:
- **`MEMGLBLCUST`** → Stores Customer / Global Customer Code data.
- **`MEMGLBLHNDGAGNT`** → Stores Handling Agent data.
- **`MEMWGONOWNRSHIP`** → Wagon Ownership data (currently reserved/future use).
- **`MEMWGONOWNRPRTY`** → Wagon Ownership Party data (currently reserved/future use).

### CRIS Column Definitions

**`MEMGLBLCUST`** (Global Customer)
- `MAVGLBLCUSTCODE` → Customer/Global Code (Primary Identifier)
- `MAVGLBLCUSTNAME` → Company/Customer Name
- `MAVGLBLCUSTADDRTEXT` → Address
- `MAVGNBLCUSTCITYNAME` → City
- `MAVCENTBLNG` → Central Billing flag
- `MAVPCOCODE` → PCO Code (Pincode)
- `MAVEDMNDFLAG` → Amendment flag
- `MADIMPLDATE` → Implementation date (set to `SYSDATE`)
- `MAVIMPLREMK` → Implementation remark (used for Operating Division)
- `MADEDMNDDATE` → End/Amendment date
- `MAVCUSTGSTINNUMB` → GSTIN Numbers
- `MAVCUSTPANNUMB` → PAN Number

**`MEMGLBLHNDGAGNT`** (Handling Agent)
- `MAVHNDGAGNTCODE` → Handling Agent Code (Primary Identifier)
- `MAVHNDGAGNTNAME` → Handling Agent Name
- `MAVHNDGAGNTADDRTEXT` → Address
- `MAVHNDGAGNTCITYNAME` → City
- `MAVCENTBLNG` → Central Billing flag
- `MAVPCOCODE` → PCO Code (Pincode)
- `MAVEDMNDFLAG` → Amendment flag
- `MADIMPLDATE` → Implementation date (set to `SYSDATE`)
- `MAVIMPLREMK` → Implementation remark (used for Operating Division)
- `MADEDMNDDATE` → End/Amendment date

## 6. FORM → DATABASE MAPPING

| Application Form Field | CRIS Table | CRIS Column |
| :--- | :--- | :--- |
| Global Customer Code | `MEMGLBLCUST` | `MAVGLBLCUSTCODE` |
| Handling Agent Code | `MEMGLBLHNDGAGNT` | `MAVHNDGAGNTCODE` |
| Company Name (Global) | `MEMGLBLCUST` | `MAVGLBLCUSTNAME` |
| Company Name (Agent) | `MEMGLBLHNDGAGNT` | `MAVHNDGAGNTNAME` |
| Address (Global) | `MEMGLBLCUST` | `MAVGLBLCUSTADDRTEXT` |
| Address (Agent) | `MEMGLBLHNDGAGNT` | `MAVHNDGAGNTADDRTEXT` |
| City (Global) | `MEMGLBLCUST` | `MAVGNBLCUSTCITYNAME` |
| City (Agent) | `MEMGLBLHNDGAGNT` | `MAVHNDGAGNTCITYNAME` |
| Pincode (Global) | `MEMGLBLCUST` | `MAVPCOCODE` |
| Pincode (Agent) | `MEMGLBLHNDGAGNT` | `MAVPCOCODE` |
| PAN | `MEMGLBLCUST` | `MAVCUSTPANNUMB` |
| GSTIN | `MEMGLBLCUST` | `MAVCUSTGSTINNUMB` |
| Operating Division (Global)| `MEMGLBLCUST` | `MAVIMPLREMK` |
| Operating Division (Agent)| `MEMGLBLHNDGAGNT` | `MAVIMPLREMK` |

> **Unmapped Fields**: `Email`, `Mobile`, and `Zone` are collected by the frontend forms but **do not** have corresponding columns in the CRIS Oracle schema. They are deliberately excluded from `INSERT` and `UPDATE` statements to prevent database crashes.

## 7. OLD USER FLOW
1. **Customer Code entered**: The user enters an existing 4-character code.
2. **JDBC lookup**: The Java backend executes a `SELECT` query against `MEMGLBLCUST` or `MEMGLBLHNDGAGNT`.
3. **Existing CRIS record fetched**: The database returns the existing record.
4. **Form population**: Available data is populated into the React form. Missing/NULL values remain empty.
5. **User update**: The user modifies the information.
6. **Submit**: The frontend posts the data to the Java backend.
7. **Oracle UPDATE**: An Oracle `UPDATE` query modifies the specific record. It **does not** create a new customer record.
8. **Database verification**: The changes are confirmed, and an audit email is generated.

## 8. NEW ENTRY FLOW

**Global Customer Code:**
1. User enters new company information and selects Global Code.
2. The Java backend generates a unique 4-character code and verifies it against `MEMGLBLCUST`.
3. The backend executes an `INSERT INTO MEMGLBLCUST` statement with the exact mapped schema values.

**Handling Agent Code:**
1. User enters new company information and selects Handling Agent Code.
2. The Java backend generates a unique 4-character code and verifies it against `MEMGLBLHNDGAGNT`.
3. The backend executes an `INSERT INTO MEMGLBLHNDGAGNT` statement.

## 9. GSTIN FUNCTIONALITY
- Multiple GSTINs can be added via the frontend UI.
- They are concatenated into a string payload and stored directly in the `MAVCUSTGSTINNUMB` column of the `MEMGLBLCUST` table.
- Handling Agents do not store GSTINs in their respective table based on the current CRIS schema.
- Verification/search can be performed using the GSTIN string via a `LIKE` SQL query in the Java backend.

## 10. VERIFICATION SCREEN
**1. Customer Code:**
- User searches by code.
- Java backend performs an exact match `SELECT` against the database.
- Results are displayed in a clean tabular format.

**2. GSTIN:**
- User searches by GSTIN.
- Java backend performs a wildcard `LIKE` search against `MAVCUSTGSTINNUMB`.
- The matched customer record is returned and displayed.

## 11. DATABASE OPERATIONS
The Java backend (`CustomerServiceImpl.java`) executes native Oracle SQL using `PreparedStatement` interfaces to prevent SQL injection.

**Transactions & Handling**: Connections are managed by the Spring Datasource pool.
**Errors**: Exceptions trigger a `RuntimeException`, and duplicate codes automatically trigger regeneration during New Entry.

*Examples for manual verification in Oracle SQL Developer:*
```sql
-- View all global customers
SELECT * FROM MEMGLBLCUST;

-- View all handling agents
SELECT * FROM MEMGLBLHNDGAGNT;

-- Search for a specific global customer
SELECT * FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = 'ABCD';

-- Search for a specific GSTIN
SELECT * FROM MEMGLBLCUST WHERE MAVCUSTGSTINNUMB LIKE '%07ABCDE1234F1Z5%';
```

## 12. DBA EMAIL / SQL AUDIT
When a database operation occurs, the system uses `JavaMailSender` to send an email to the DBA containing a **READY-TO-EXECUTE** Oracle SQL query.

There are exactly four cases managed:
1. `MEMGLBLCUST` → `INSERT`
2. `MEMGLBLCUST` → `UPDATE`
3. `MEMGLBLHNDGAGNT` → `INSERT`
4. `MEMGLBLHNDGAGNT` → `UPDATE`

**Crucial Note**: The email body exclusively utilizes exact CRIS table names and column orders. Development table names (e.g., `customer_code`, `handling_agents`) or JavaScript JSON objects are strictly forbidden in these emails.

*Example Email Body:*
```sql
Operation: UPDATE
Table: MEMGLBLCUST
Code: CUST

SQL QUERY:
----------------------------------------
UPDATE MEMGLBLCUST
SET
    MAVGLBLCUSTNAME = 'NEW NAME',
    MAVGLBLCUSTADDRTEXT = 'NEW ADDRESS',
    MAVGNBLCUSTCITYNAME = 'DELHI',
    MAVPCOCODE = '110001',
    MAVCUSTPANNUMB = 'ABCDE1234F',
    MAVCUSTGSTINNUMB = '07ABCDE1234F1Z5'
WHERE MAVGLBLCUSTCODE = 'CUST';
----------------------------------------
```

## 13. DATABASE CONNECTION
The Java Spring Boot backend connects to the CRIS Oracle database using JDBC. 
Database configuration is stored in `src/main/resources/application.properties`.

**Security Note**: Credentials are provided dynamically via environment variables (e.g., `${ORACLE_DB_URL}`, `${ORACLE_DB_USERNAME}`, `${ORACLE_DB_PASSWORD}`). **Actual passwords must never be exposed** in the frontend, React code, GitHub, READMEs, or emails.

## 14. IMPORTANT DEVELOPMENT RULES
**RULES FOR FUTURE AI AGENTS:**
- READ THIS `README.md` BEFORE modifying the project.
- Understand the existing architecture before coding.
- Do not redesign the UI unless explicitly requested.
- Do not replace Oracle with MySQL/Supabase.
- Do not create duplicate CRIS tables.
- Do not rename CRIS tables.
- Do not rename CRIS columns.
- Continue using JDBC where currently implemented.
- Reuse existing database services/connections.
- Do not break existing functionality.
- Do not hard-code credentials.
- Do not make assumptions about the CRIS schema.
- Verify database changes with SELECT queries.
- Do not claim a database feature is complete until it has actually been tested.

## 15. CURRENT STATUS / KNOWN ISSUES
- **Working**: 
  - Java Spring Boot JDBC integration with Oracle.
  - New Entry code generation and `INSERT` logic.
  - Old User `SELECT` and `UPDATE` logic.
  - DBA Email notifications generating copy-paste Oracle SQL.
  - Verification lookups.
- **Partially working**: 
  - File uploads (currently designed for local filesystem, pending Oracle BLOB integration if requested).
- **Not working / Future Work**: 
  - `MEMWGONOWNRSHIP` and `MEMWGONOWNRPRTY` integration (reserved for future requirements).

## 16. HOW A NEW AI AGENT SHOULD WORK
1. Read `README.md` completely.
2. Inspect the existing project structure.
3. Identify the relevant frontend/backend files.
4. Understand the existing database/JDBC implementation.
5. Check the CRIS Oracle schema before modifying SQL.
6. Make the smallest required change.
7. Do not modify unrelated functionality.
8. Run/build the application.
9. Test the affected feature.
10. Verify database changes directly with SQL.
11. Update `README.md` if the architecture or functionality changes.

## 17. MANUAL DATABASE MANAGEMENT
To manage the database manually via **Oracle SQL Developer**:
1. Open Oracle SQL Developer.
2. Create a new connection using the host, port, and service name (do NOT use credentials found in source code; request them from the administrator).
3. Open a SQL Worksheet.
4. Run `SELECT * FROM MEMGLBLCUST;` to view global customers.
5. Run `SELECT * FROM MEMGLBLHNDGAGNT;` to view handling agents.
6. After running `INSERT` or `UPDATE` queries manually, remember to issue a `COMMIT;` statement if autocommit is disabled.

## 18. CHANGE LOG
- **2026-09-02**: Replaced local MySQL/Prisma backend with Java/JDBC Oracle backend.
- **2026-09-02**: Mapped all frontend form fields explicitly to CRIS Oracle tables (`MEMGLBLCUST`, `MEMGLBLHNDGAGNT`).
- **2026-09-02**: Implemented formatted, copy-pasteable Oracle SQL query generation for DBA notification emails.
- **2026-09-02**: Updated `README.md` to serve as the master single source of truth for the project.
