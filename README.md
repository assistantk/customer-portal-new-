# CRIS Freight Code Generator

The portal consists of an Angular single-page frontend and a Spring Boot REST backend. They are built and deployed as two independent WebLogic applications:

| Application | WAR | Context root | Purpose |
|---|---|---|---|
| Angular frontend | `FreightCodeWeb.war` | `/FreightCodeWeb` | Static production application |
| Spring Boot backend | `FreightCodeApi.war` | `/FreightCodeApi` | Authentication, customer APIs, and database-backed services |

The expected same-origin URLs are:

- Frontend: `http://host:port/FreightCodeWeb/`
- Backend: `http://host:port/FreightCodeApi/`
- Production API base: `/FreightCodeApi/api`

## Technology and source layout

- **Frontend:** Angular 22, TypeScript, RxJS, CSS; source in `angular-frontend/`.
- **OCR:** `pdfjs-dist` and `tesseract.js`, running in the browser.
- **Backend:** Spring Boot 2.7.12 and Java 8-compatible source; source in `src/main/java/`.
- **Database:** Oracle via JDBC/JPA. Authentication looks up users in `TMS3T.AEM_USER`.
- **Build:** npm/Angular CLI and the Maven wrapper (`mvnw.cmd`).
- **Deployment:** Two separate WebLogic WARs built by `build-war.ps1`.

```text
customer-portal-new-/
├── angular-frontend/
│   ├── deployment/WEB-INF/           # Frontend WAR descriptors
│   ├── public/assets/                 # Logos, railway background, OCR assets
│   ├── src/app/                       # Pages, layout, services, auth guards
│   ├── src/environments/              # Development and production API base URLs
│   └── src/proxy.conf.json            # Local Angular-to-Spring proxy
├── src/main/java/com/cris/customerportal/
│   ├── config/                        # CORS and authentication interceptor
│   ├── controller/                    # Auth and customer REST controllers
│   ├── repository/                    # Oracle/JDBC repositories
│   └── service/                       # Authentication and business services
├── src/main/webapp/WEB-INF/weblogic.xml # Backend context root
├── pom.xml                            # Backend WAR build
├── build-war.ps1                      # Builds both WARs
└── dist/deployment/                   # Final frontend and backend WARs
```

## Local development

### Requirements

- Java 8 or later, using a JDK compatible with the installed Maven and target WebLogic.
- Node.js/npm versions supported by the Angular dependencies in `angular-frontend/package.json`.
- Oracle and SMTP connectivity for backend functions requiring those services.

Configure the variables listed in `.env.example` for local backend use. Use approved values and do not commit credentials.

Start the Spring Boot backend from the repository root:

```powershell
.\mvnw.cmd spring-boot:run
```

By default, Spring Boot listens at `http://localhost:8080`. For local HTTP development, explicitly set `REQUIRE_HTTPS=false` and `AUTH_MODE=mock`; do not use those overrides in deployed environments. A live RMS login also requires `RMS_API_BASE_URL` to point to a TLS-enabled RMS endpoint using HTTPS.

In another PowerShell terminal, start Angular:

```powershell
Set-Location .\angular-frontend
npm ci
npm start
```

Angular listens at `http://localhost:4200`. The development environment uses `/api`; `src/proxy.conf.json` forwards those requests to `http://localhost:8080`. Angular uses hash routing, so client routes such as login can be refreshed without server-side SPA rewrite support.

## API and authentication

The `AuthController` is mapped at `/api/auth`:

| Method | Local path | Purpose |
|---|---|---|
| `GET` | `/api/auth/captcha` | Creates a session-bound CAPTCHA image; the answer is not sent to Angular |
| `POST` | `/api/auth/validate-user` | Validates `userId`, `password`, `divisionCode`, and one-time `captchaInput` before RMS authentication |
| `POST` | `/api/auth/select-designation` | Confirms the authorized designation and requests the initial OTP |
| `POST` | `/api/auth/resend-otp` | Requests an OTP resend after the server-enforced cooldown |
| `POST` | `/api/auth/verify-otp` | Verifies the OTP before creating the authenticated session |
| `POST` | `/api/auth/login` | Validates JSON `{"userId":"...","password":"...","captchaInput":"..."}` and creates a server-side session on success |
| `GET` | `/api/auth/session` | Checks the session; `/api/auth/me` is an alias |
| `POST` | `/api/auth/logout` | Invalidates the current session |

CAPTCHA answers are single-use and validated by Spring before RMS authentication or database lookup. RMS login loads its challenge from `/api/auth/captcha` and submits the answer with the user ID, password, and division code to `/api/auth/validate-user`. Production Angular uses the same-origin relative `/FreightCodeApi/api` URL and refuses to submit login credentials unless both the page and resolved API URL use HTTPS. The backend also rejects credential-submission requests unless the servlet request is secure; TLS should terminate at the WebLogic HTTPS listener, or a trusted proxy must correctly expose the secure request to the servlet container. HTTP development is supported only with the explicit `REQUIRE_HTTPS=false` override. The live RMS API client fails at startup unless `RMS_API_BASE_URL` is an HTTPS URL without embedded credentials or query parameters, so credentials are not relayed to the former default HTTP endpoint. Backend RMS requests do not follow redirects, preventing an HTTPS endpoint from redirecting credential submissions to HTTP. Standard JVM certificate validation remains enabled. Legacy login also validates the challenge before database lookup. Login accepts either `AAVUSERID` or `AAVEMAILID` from `TMS3T.AEM_USER`, with case-insensitive identifier matching. A matched account is eligible only when `AACUSERDELTFLAG = 'N'`, `AADRTRMNTDATE > SYSDATE`, `AADPSWDXPRYTIME > SYSDATE`, `AACEDSPFLAG = 'E'`, and `AAVDSGN = 'SR-DCM'`; Oracle evaluates these predicates so null or expired values fail. The backend retrieves `AAVPSWD` and asks Oracle to calculate the configured legacy representation using `DBMS_UTILITY.GET_HASH_VALUE`; it does not read `AAVOLDPSWD` or calculate a replacement hash in Java. The source expression matches the DBA expression recorded in `JdbcOraclePasswordHashService`, but its output has not been independently checked against the office CRIS database or the example stored value.

No client-side or application-level password encryption was added. The production web tier and live RMS endpoint must provide TLS; HTTPS is the correct transport protection here, while embedding a decryption secret in Angular would not provide confidentiality from browser users or injected scripts. The password remains only in the transient login form/request, is cleared from the form when validation completes, and is not placed in browser storage. The existing CRIS/RMS password verification is unchanged.

The Angular login keeps the credentials, designation, and OTP controls in one card. The initial credentials and server-validated CAPTCHA remain visible after credential validation; the designation list comes from RMS, and selecting a designation calls the existing backend endpoint. OTP verification remains a separate required backend operation before the authenticated session is created.

The backend sends `GNRTOTP` for a user's first eligible designation selection on a day and `REGNRTOTP` for subsequent same-day login selections and explicit resends. It enforces a 60-second per-user cooldown across initial sends and resends, serializes simultaneous requests for the same user within the application instance, and returns HTTP `429` with `retryAfterSeconds` while the cooldown is active. The frontend displays the remaining time and enables resend only after the backend cooldown. OTP values are handled by RMS and are not returned to Angular or logged by the portal. The portal does not override RMS OTP expiration or verification policy.

The daily-generation date and cooldown are held in application memory. Thus the rule and per-user serialization apply to requests handled by the same running application instance, but state is not retained across restarts or coordinated across multiple backend instances. For a multi-instance deployment or restart-safe enforcement, the daily-generation marker and cooldown need shared persistent storage or enforcement by the RMS OTP service. The RMS API's `REGNRTOTP` behavior and OTP expiry policy remain authoritative; an expired OTP must be rejected by RMS rather than treated as valid by this application.

Backend authentication logs record CAPTCHA outcome, AEM lookup outcome, Oracle datasource product/current schema, eligibility rejection reason, password-comparison outcome, and session creation without logging identifiers, passwords, or hash values.

DBA request emails resolve the footer `UserID` by matching the authenticated session user ID to `TMS3T.AEM_USER.AAVUSERID`; they do not use the selected operating-division designation as the email user ID.

The admin Delete Request page offers only **Global Code** and **Handling Agent Code**. Global Code verification uses `MEMGLBLCUST.MAVGLBLCUSTCODE`; Handling Agent Code verification uses `MEMGLBLHNDGAGNT.MAVHNDGAGNTCODE`. The page requires the verified company name to be confirmed before emailing the matching DELETE SQL to the DBA. The application does not execute these DELETE statements; the DBA reviews and executes them manually.

The expected unauthenticated response from session verification is `401` with JSON. Successful login returns `200` and sets the servlet-container session cookie. Protected `/api/customers/**` requests require that session. Signup currently has a frontend form, but the backend does not define `/api/auth/register`.

The Ownership registration page checks each requested ownership table independently before looking up the same four-character code in `MEMGLBLCUST`. Existing ownership rows are submitted as DBA email UPDATE requests; absent ownership rows can be submitted as INSERT requests only when the code exists in the global-customer table. Lookup failures and codes absent from both source tables block submission; the application does not directly write ownership rows.

All frontend API services use the configured API base. Development uses `/api`; production uses `/FreightCodeApi/api`. The production frontend and backend share scheme, hostname, and port, so they are same-origin even though they have different context paths. Requests include credentials; WebLogic scopes the session cookie to the backend application context. No cross-origin proxy is required in production.

Local route check:

```powershell
curl.exe -i "http://localhost:8080/api/auth/session"
```

Expected with no session cookie: `401` and a Spring JSON response. Do not send real passwords or session cookies in shared logs or chats.

## Build both deployment WARs

From the repository root in PowerShell:

```powershell
.\build-war.ps1
```

The script performs `npm ci`, builds Angular with the production configuration, packages and checks the frontend WAR, runs the Maven backend package/tests, verifies the backend WAR contents, and copies both artifacts to:

```text
dist/deployment/FreightCodeWeb.war
dist/deployment/FreightCodeApi.war
```

It stops with a nonzero exit code if a build or archive validation fails. The backend WAR is also generated at `target/FreightCodeApi.war`.

Equivalent manual Windows commands:

```powershell
Set-Location .\angular-frontend
npm ci
npm run build -- --configuration production
Set-Location ..
.\mvnw.cmd clean package
```

Use `build-war.ps1` to create both WARs and publish them together; the manual commands above only build the Angular bundle and backend WAR, not the frontend WAR.

## WebLogic deployment

Deploy both WARs independently to the same Managed Server or cluster:

1. Deploy `dist/deployment/FreightCodeApi.war`; confirm its effective context root is `/FreightCodeApi`.
2. Deploy `dist/deployment/FreightCodeWeb.war`; confirm its effective context root is `/FreightCodeWeb`.
3. Configure the Oracle and SMTP environment variables for the backend deployment/server.
4. Confirm both deployments are **Active** and the frontend is served from the same origin as the backend.

The Angular production base href is `/FreightCodeWeb/`, and its production API base is `/FreightCodeApi/api`. The frontend WAR has its own `WEB-INF/weblogic.xml`; the backend context is set in `src/main/webapp/WEB-INF/weblogic.xml`. Do not set `server.servlet.context-path` to a competing value in Spring configuration.

Angular uses hash URLs (for example `/FreightCodeWeb/#/login`, `/FreightCodeWeb/#/register`). The server only needs to serve the frontend context's `index.html`; it does not need SPA rewrite rules.

### Production smoke checks

Replace the address below with the deployed origin:

```powershell
curl.exe -i "http://host:port/FreightCodeApi/api/auth/session"
```

Without a session, expect `401` with JSON. A WebLogic HTML `404` means the request is not reaching the Spring mapping; verify the backend WAR is active, the effective context root is `/FreightCodeApi`, and the URL is routed to the correct Managed Server.

For an intentional login test, first request a CAPTCHA and retain the cookie; then solve the returned image and submit its answer with the credentials. Use a private trusted client with valid credentials and a cookie jar:

```powershell
curl.exe -i -c .\session-cookies.txt "http://host:port/FreightCodeApi/api/auth/captcha"
curl.exe -i -b .\session-cookies.txt -c .\session-cookies.txt -X POST "http://host:port/FreightCodeApi/api/auth/login" `
  -H "Content-Type: application/json" `
  --data-raw '{"userId":"YOUR_USER_ID","password":"YOUR_PASSWORD","captchaInput":"SOLVED_CAPTCHA"}'
curl.exe -i -b .\session-cookies.txt "http://host:port/FreightCodeApi/api/auth/session"
curl.exe -i -b .\session-cookies.txt -X POST "http://host:port/FreightCodeApi/api/auth/logout"
```

The expected successful statuses are login `200`, session `200`, and logout `200`. Delete the local cookie file after testing; never share it. Do not run logout against another user's session.

## WebLogic compatibility and cookie settings

Spring Boot 2.7.12 uses Spring Framework 5.3, Java 8-compatible bytecode, and the `javax.servlet` API. The Maven WAR excludes embedded Tomcat and its Servlet/EL APIs; WebLogic must supply the servlet container and EL implementation. The source repository does not specify the production WebLogic version, so confirm the actual WebLogic release and supported JDK/Servlet specifications with the server administrator. This Spring Boot line requires a Servlet 3.1-compatible container; Jakarta-only servlet containers are not compatible without upgrading/migrating the application.

Session management remains container-backed. Deploying frontend and backend under distinct contexts on the same origin allows the browser to send the backend session cookie to `/FreightCodeApi` when API requests include credentials. For production, use HTTPS and confirm WebLogic's session-cookie `HttpOnly`, `Secure`, and `SameSite` settings match the organization's policy; do not force `Secure` cookies while serving over plain HTTP.

### CAPTCHA deployment notes

The backend renders CAPTCHA images with Java AWT in headless mode and tries the logical SansSerif, Dialog, and Monospaced fonts. On Linux WebLogic hosts, configure the server JVM with:

```text
-Djava.awt.headless=true
```

Install `fontconfig` and an available font package, such as `dejavu-sans-fonts` on RPM-based distributions or `fonts-dejavu-core` on Debian-based distributions. Check the WebLogic startup log for the CAPTCHA AWT font-rendering self-check result.

After deploying the backend WAR, open `https://host/FreightCodeApi/api/auth/captcha` directly or request it with `curl -i`. A successful response is JSON containing an `image` data URI and sets the session cookie. A rendering failure returns HTTP `503` with JSON `success: false` and a `message`; an HTML maintenance page or redirect means the request is not reaching the CAPTCHA controller.

The CAPTCHA endpoint creates the HTTP session with `request.getSession(true)`. The repository's backend and frontend WebLogic descriptors do not override session-cookie settings. Keep the cookie scoped to `/FreightCodeApi` (the normal context path for the backend), and ensure the browser accepts it for the deployed HTTPS origin. `Secure` should be enabled for HTTPS, and `SameSite=Lax` is suitable when the frontend and backend are served from the same origin; do not configure `SameSite=None` without `Secure`.
