# Customer Registration Portal - MASTER PROJECT DOCUMENTATION

## 1. Project Overview
The CRIS Customer Registration Portal is an enterprise web application designed to process and manage customer, handling agent, and wagon ownership registrations for Indian Railways' CRIS FOIS system. It allows users to register as a new entity (generating a unique 4-character Global Customer Code or Handling Agent Code), look up existing records to update information, manage wagon ownership codes, and run verification lookups against the CRIS Oracle database schema.

---

## 2. Technology Stack
The application consists of the following active components:

- **Frontend**: Angular 18+ (in [`angular-frontend/`](file:///e:/customer-portal-new-/angular-frontend))
  - Styling: Vanilla CSS / Responsive Design System
  - Client-side OCR: `pdfjs-dist` + `tesseract.js` with local assets and offline language data (`eng.traineddata`)
  - Testing: Vitest (`npm test`)
- **Backend**: Spring Boot 2.7.12 (in [`src/main/java/com/cris/customerportal/`](file:///e:/customer-portal-new-/src/main/java/com/cris/customerportal))
  - Java 8+ compatibility
  - Connectivity: JDBC (`PreparedStatement`) via `ojdbc8` (Oracle JDBC Driver)
  - Security & Authentication: Database-backed sessions against `PORTAL_AUTH_USERS` with BCrypt password hashing
  - Email Integration: Spring Mail (`JavaMailSender`) for sending DBA audit SQL emails with attachments
- **Database**: CRIS Oracle Database
- **Prototypes (Legacy Reference)**:
  - `frontend/`: Earlier React/Vite prototype (preserved for reference).
  - `backend/`: Earlier Node/Express/MySQL prototype (preserved for reference; not used in production).

---

## 3. Project Structure
```
customer-portal-new-/
├── angular-frontend/               # Active Angular 18+ Application
│   ├── public/assets/              # Logos and offline OCR tessdata (eng.traineddata)
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/         # Shared UI components (notifications, etc.)
│   │   │   ├── layout/             # Header, navbar, and container layout
│   │   │   ├── pages/              # Main route views:
│   │   │   │   ├── customer-registration/ # New Entry, Old User, Ownership forms
│   │   │   │   ├── login/          # User login page
│   │   │   │   ├── signup/         # User registration page
│   │   │   │   └── verification/   # Customer & GSTIN lookup screen
│   │   │   └── services/           # Angular services:
│   │   │       ├── auth.service.ts
│   │   │       ├── customer.service.ts
│   │   │       ├── pan-ocr.service.ts  # Client-side PDF/Image OCR
│   │   │       └── notification.service.ts
│   │   └── proxy.conf.json         # Development proxy routing /api/* to :8080
│   └── package.json
├── src/main/java/com/cris/customerportal/ # Active Spring Boot Backend
│   ├── config/                     # AuthInterceptor, CorsConfig, Security
│   ├── controller/                 # AuthController, CustomerController
│   ├── dto/                        # Request and Response transfer objects
│   ├── exception/                  # GlobalExceptionHandler
│   ├── repository/                 # JDBC repositories (Auth, Customer, etc.)
│   └── service/                    # Business services and DBA email generator
├── src/main/resources/
│   └── application.properties      # Spring datasource and mail configuration
├── .env.example                    # Template for required environment variables
├── pom.xml                         # Maven dependencies & build configuration
└── README.md                       # This documentation
```

---

## 4. Key Application Features

1. **Authentication (`PORTAL_AUTH_USERS`)**:
   - Secure login, signup, and session validation using cookie-based token validation.
   - Protected routes (`AuthGuard`, `NonAuthGuard`) and automatic redirection.

2. **Customer Registration (New Entry)**:
   - Registration for new Global Customers or Handling Agents.
   - Client-side GST PDF upload with automatic OCR (extracts GSTIN, PAN, Legal/Trade Name, State, Address, City, Pincode).
   - Real-time unique 4-character code generation and database availability checking.
   - Dispatches DBA approval email with SQL statements and multipart PDF attachments.

3. **Old User Update**:
   - Customer or Agent lookup by code directly against Oracle.
   - Pre-populates existing data and allows updates.
   - Dispatches DBA approval update email.

4. **Wagon Ownership Management (`MEMWGONOWNRSHIP` & `MEMWGONOWNRPRTY`)**:
   - Section 1: Wagon Ownership Code lookup, duplicate validation, and save.
   - Section 2: Wagon Ownership Party Code lookup, duplicate validation, and save.
   - Section 1 & 2 Combined Submit for DBA approval.

5. **Verification Screen**:
   - Customer Code lookup: exact match search.
   - GSTIN lookup: search customer details by GSTIN.

---

## 5. Database Schema & Form Mapping (CRIS Oracle)

The application interacts with standard CRIS tables using `PreparedStatement` interfaces:

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
| PAN Number | `MEMGLBLCUST` | `MAVCUSTPANNUMB` |
| GSTIN Numbers | `MEMGLBLCUST` | `MAVCUSTGSTNUMB` |
| Operating Division (Global)| `MEMGLBLCUST` | `MAVIMPLREMK` (formatted as `SR.DCM/<DIV>`) |
| Operating Division (Agent)| `MEMGLBLHNDGAGNT` | `MAVIMPLREMK` |
| Wagon Ownership Code | `MEMWGONOWNRSHIP` | `MAVOWNRSHPCODE` |
| Wagon Ownership Desc | `MEMWGONOWNRSHIP` | `MAVOWNRSHPDESC` |
| Wagon Ownership Party Code | `MEMWGONOWNRPRTY` | `MAVOWNRPRTYCODE` |
| Wagon Ownership Party Desc | `MEMWGONOWNRPRTY` | `MAVOWNRPRTYDESC` |
| Portal Users | `PORTAL_AUTH_USERS` | `USER_ID`, `PASSWORD_HASH`, `USER_ROLE`, etc. |

---

## 6. Development Setup & Execution

### Prerequisites
- Java JDK 8 or higher (e.g. OpenJDK 17/21/25)
- Node.js 18+ and npm 9+
- Access to CRIS Oracle Database (or local development instance)
- Access to CRIS internal SMTP relay (or local test SMTP)

### 1. Configure Environment Variables
Copy `.env.example` to `.env` in the project root:
```bash
cp .env.example .env
```
Fill in the parameters:
- `ORACLE_DB_URL`: e.g. `jdbc:oracle:thin:@//host:1521/servicename`
- `ORACLE_DB_USERNAME`: Database username
- `ORACLE_DB_PASSWORD`: Database password
- `CRIS_SMTP_HOST`: Internal mail relay host
- `CRIS_SMTP_PORT`: e.g. `25`
- `CRIS_MAIL_USERNAME`: Sender email address
- `CRIS_MAIL_PASSWORD`: Mail password

### 2. Run the Spring Boot Backend
From the root directory:

**Windows PowerShell:**
```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-25.0.2" # Adjust to your JDK path
.\mvnw.cmd spring-boot:run
```

**Linux / macOS:**
```bash
./mvnw spring-boot:run
```
The backend starts on port `http://localhost:8080`.

### 3. Run the Angular Frontend
In a separate terminal:
```bash
cd angular-frontend
npm install
npm start
```
The frontend starts on `http://localhost:4200` with automated proxying of `/api/*` requests to `http://localhost:8080`.

---

## 7. Testing & Build Commands

### Frontend (Angular)
```bash
cd angular-frontend

# Run unit tests (single run)
npm test -- --watch=false

# Production build
npm run build
```

### Backend (Spring Boot)
```bash
# Compile and run backend tests
.\mvnw.cmd test

# Package executable JAR
.\mvnw.cmd clean package
```

---

## 8. Client-Side OCR Details
- Service: [`PanOcrService`](file:///e:/customer-portal-new-/angular-frontend/src/app/services/pan-ocr.service.ts)
- Powered by `pdfjs-dist` (for direct PDF text layer parsing) and `tesseract.js` (for scanned PDFs and images).
- Includes automatic fallback to `Legal Name` when `Trade Name` is absent or "NA".
- Extracts GSTIN, validates 15-character format, derives embedded PAN (chars 3–12), extracts state from state code, and maps principal business address components into city and pincode.
- Operates entirely inside the client browser without uploading documents to external OCR servers.
