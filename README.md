# CRIS Customer Registration Portal

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

By default, Spring Boot listens at `http://localhost:8080`.

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
| `POST` | `/api/auth/login` | Validates JSON `{"userId":"...","password":"...","captchaInput":"..."}` and creates a server-side session on success |
| `GET` | `/api/auth/session` | Checks the session; `/api/auth/me` is an alias |
| `POST` | `/api/auth/logout` | Invalidates the current session |

CAPTCHA answers are single-use and validated by Spring before RMS authentication or database lookup. RMS login loads its challenge from `/api/auth/captcha` and submits the answer with the user ID, password, and division code to `/api/auth/validate-user`. Legacy login also validates the challenge before database lookup. Login accepts either `AAVUSERID` or `AAVEMAILID` from `TMS3T.AEM_USER`, with case-insensitive identifier matching. A matched account is eligible only when `AACUSERDELTFLAG = 'N'`, `AADRTRMNTDATE > SYSDATE`, `AADPSWDXPRYTIME > SYSDATE`, `AACEDSPFLAG = 'E'`, and `AAVDSGN = 'SR-DCM'`; Oracle evaluates these predicates so null or expired values fail. The backend retrieves `AAVPSWD` and asks Oracle to calculate the configured legacy representation using `DBMS_UTILITY.GET_HASH_VALUE`; it does not read `AAVOLDPSWD` or calculate a replacement hash in Java. The source expression matches the DBA expression recorded in `JdbcOraclePasswordHashService`, but its output has not been independently checked against the office CRIS database or the example stored value.

Backend authentication logs record CAPTCHA outcome, AEM lookup outcome, Oracle datasource product/current schema, eligibility rejection reason, password-comparison outcome, and session creation without logging identifiers, passwords, or hash values.

The expected unauthenticated response from session verification is `401` with JSON. Successful login returns `200` and sets the servlet-container session cookie. Protected `/api/customers/**` requests require that session. Signup currently has a frontend form, but the backend does not define `/api/auth/register`.

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
