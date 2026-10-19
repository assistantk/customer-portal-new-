# CRIS Customer Registration Portal — Deployment Checklist

This document details the prerequisite information, infrastructure provisions, and configuration parameters required from **CRIS IT**, the **Database Administrator (DBA)**, and the **DevOps / Application Team** prior to production deployment.

---

## 1. Responsibilities Matrix & Checklist

| # | Item Description | Responsible Owner | Target Environment | Status | Notes / Reference |
|---|------------------|-------------------|--------------------|--------|-------------------|
| **1** | **Linux Server Infrastructure** | CRIS IT | Staging / Prod | `Pending` | Approved OS, IP, SSH access |
| 1.1 | Approved Linux distribution & version (Ubuntu 22.04 / 24.04 LTS recommended) | CRIS IT | Staging / Prod | `Pending` | Verify enterprise package repositories |
| 1.2 | Server IP address, hostname & SSH key-based access | CRIS IT | Staging / Prod | `Pending` | Dedicated deployment/admin user |
| 1.3 | Network routing & egress to Oracle Database on port `1521` | CRIS IT / Network | Staging / Prod | `Pending` | Test via `nc -zv <db-host> 1521` |
| 1.4 | Inbound firewall rules (Port 80 HTTP, Port 443 HTTPS, Port 22 SSH only) | CRIS IT / Security | Staging / Prod | `Pending` | Direct port 8080 access blocked from WAN |
| 1.5 | Outbound firewall rules (Port 1521 to Oracle DB, Port 25/587 to SMTP relay) | CRIS IT / Network | Staging / Prod | `Pending` | Restrict egress to internal CRIS hosts |
| **2** | **Oracle Database Provisioning** | DBA | Staging / Prod | `Pending` | JDBC connectivity & permissions |
| 2.1 | Pre-production / Test DB JDBC URL (`ORACLE_DB_URL`) | DBA | Staging / Test | `Pending` | Format: `jdbc:oracle:thin:@//<host>:<port>/<service>` |
| 2.2 | Pre-production / Test DB Username (`ORACLE_DB_USERNAME`) | DBA | Staging / Test | `Pending` | Least-privilege schema user |
| 2.3 | Pre-production / Test DB Password (`ORACLE_DB_PASSWORD`) | DBA | Staging / Test | `Pending` | Secure out-of-band transmission |
| 2.4 | Production DB JDBC URL & credentials | DBA | Production | `Pending` | To be provided after staging sign-off |
| 2.5 | Database schema validation (`MEMGLBLCUST`, `MEMWGONOWNRSHIP`, `MEMWGONOWNRPRTY`) | DBA | Staging / Prod | `Pending` | Verify DDL, columns, and sequence grants |
| 2.6 | Application server IP allowlisting on Oracle DB listener/firewall | DBA / Network | Staging / Prod | `Pending` | Prevent ORA-12541 / TNS timeouts |
| **3** | **SMTP Email Notification Service** | CRIS IT / Infra | Staging / Prod | `Pending` | Required for DBA audit emails |
| 3.1 | Internal CRIS SMTP relay host (`CRIS_SMTP_HOST`) and port (`CRIS_SMTP_PORT`) | CRIS IT | Staging / Prod | `Pending` | Default port 25 or 587 |
| 3.2 | SMTP authentication requirements (Anonymous internal relay vs authenticated) | CRIS IT | Staging / Prod | `Pending` | If unauthenticated from app IP, auth=false |
| 3.3 | TLS / STARTTLS encryption policy | CRIS IT | Staging / Prod | `Pending` | Enable/disable STARTTLS per relay spec |
| 3.4 | Dedicated application sender email address (`CRIS_MAIL_USERNAME`) | CRIS IT | Staging / Prod | `Pending` | e.g., `noreply-custportal@cris.org.in` |
| 3.5 | Securely supplied SMTP password (`CRIS_MAIL_PASSWORD`) | CRIS IT | Staging / Prod | `Pending` | Never commit to Git or plain text |
| 3.6 | Designated DBA recipient email address (`DBA_EMAIL`) | DBA / CRIS IT | Staging / Prod | `Pending` | Distribution list or DBA group mailbox |
| **4** | **Domain Name, DNS & SSL/TLS Certificates** | CRIS IT / Web Admin | Staging / Prod | `Pending` | Public/Intranet endpoints |
| 4.1 | Approved Fully Qualified Domain Name (FQDN) | CRIS IT | Staging / Prod | `Pending` | e.g., `customer-portal.example.org` |
| 4.2 | DNS A/CNAME record pointing to application server or reverse proxy/LB | CRIS IT / Network | Staging / Prod | `Pending` | Internal CRIS DNS resolution |
| 4.3 | Enterprise SSL/TLS Certificate file (`.crt` / `.pem` full chain) | CRIS IT / Security | Staging / Prod | `Pending` | Signed by approved CRIS CA |
| 4.4 | SSL/TLS Private Key file (`.key`) | CRIS IT / Security | Staging / Prod | `Pending` | Transmitted via secure vault |
| 4.5 | Certificate renewal lifecycle and ownership process | CRIS IT / Security | Staging / Prod | `Pending` | Automated or manual renewal calendar |

---

## 2. Detailed Technical Specifications

### 2.1 Server Architecture & Sizing Requirements
- **Operating System**: Ubuntu Server 22.04 LTS or 24.04 LTS (x86_64).
- **Compute Sizing (Recommended Minimum)**:
  - CPU: 2 vCPU cores (4 vCPU recommended for concurrent OCR/PDF processing).
  - RAM: 4 GB minimum (8 GB recommended; JVM heap: 2–4 GB, OS + Nginx: 2 GB).
  - Disk: 40 GB NVMe/SSD root volume (`/`), plus dedicated storage for document uploads (`/var/portal-uploads`).
- **Network Interfaces**:
  - Ingress: HTTP (80/tcp), HTTPS (443/tcp), SSH (22/tcp).
  - Egress: Oracle Listener (1521/tcp), SMTP (25/tcp or 587/tcp), DNS (53/udp/tcp), NTP (123/udp).

### 2.2 Oracle Database Integration Details
- **Connectivity Protocol**: Oracle Thin JDBC driver over TCP (`oracle.jdbc.OracleDriver`).
- **Connection String Schema**:
  ```text
  jdbc:oracle:thin:@//<DB_HOST>:<DB_PORT>/<SERVICE_NAME>
  ```
- **Required Database Grants / Privileges**:
  - `CONNECT`, `RESOURCE` or specific table privileges:
  - `SELECT`, `INSERT`, `UPDATE` on:
    - `MEMGLBLCUST` (Customer master table)
    - `MEMWGONOWNRSHIP` (Ownership master table)
    - `MEMWGONOWNRPRTY` (Ownership party master table)
    - `CUSTOMER_GSTIN` (Customer GSTIN mapping table)
  - Execution rights on any required sequences or triggers used for code generation.

### 2.3 Environment Variable Handover Template
The CRIS IT team and DBA must supply the operational environment values out-of-band (e.g., via secure vault, password manager, or encrypted email). Placeholders must be replaced before launching the service:

```ini
# Oracle Database
ORACLE_DB_URL=jdbc:oracle:thin:@//<DB_IP_OR_HOSTNAME>:1521/<SERVICE_NAME>
ORACLE_DB_USERNAME=<APP_DB_USER>
ORACLE_DB_PASSWORD=<APP_DB_PASSWORD>

# Mail Service
CRIS_SMTP_HOST=<SMTP_RELAY_HOSTNAME_OR_IP>
CRIS_SMTP_PORT=25
CRIS_MAIL_USERNAME=<SMTP_SENDER_USERNAME>
CRIS_MAIL_PASSWORD=<SMTP_SENDER_PASSWORD>
DBA_EMAIL=<DBA_NOTIFICATION_RECIPIENT_EMAIL>

# Application Runtime Overrides
SERVER_ADDRESS=127.0.0.1
SERVER_PORT=8080
APP_UPLOAD_DIR=/var/portal-uploads
```

---

## 3. Sign-off and Readiness Gate

| Phase | Gate Criteria | Approved By | Date | Sign-off Status |
|-------|---------------|-------------|------|-----------------|
| **Phase 1** | Server provisioned, SSH secured, firewall verified | CRIS IT Lead | YYYY-MM-DD | `Pending` |
| **Phase 2** | Test DB connectivity & credentials validated | Lead DBA | YYYY-MM-DD | `Pending` |
| **Phase 3** | SMTP relay connectivity & test email verified | Network/Mail Admin | YYYY-MM-DD | `Pending` |
| **Phase 4** | DNS and SSL/TLS certificate installed & tested | Web/Security Admin | YYYY-MM-DD | `Pending` |
| **Phase 5** | Production credentials issued & service activated | Project Director | YYYY-MM-DD | `Pending` |
