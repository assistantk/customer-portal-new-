# CRIS Customer Registration Portal — Linux Server Deployment Guide

This guide provides end-to-end instructions for deploying the CRIS Customer Registration Portal onto a production or staging Linux application server.

---

## Architecture Overview

```
                        [ Client Web Browser ]
                                  │
                                  ▼ (HTTPS:443 / HTTP:80)
                       [ Nginx Reverse Proxy ]
                        /var/www/customer-portal (React SPA)
                                  │
                   (Proxy /api/ -> 127.0.0.1:8080)
                                  ▼
               [ Spring Boot 3.4.2 Application (Java 21) ]
                 /opt/customer-portal/customer-portal.jar
               (systemd: customer-portal.service, user: portal)
                     │                            │
                     ▼ (TCP:1521)                 ▼ (TCP:25/587)
         [ Oracle Database Server ]      [ CRIS SMTP Relay ]
```

---

## Step 1: Collect Required Infrastructure & Database Parameters

Before starting the server installation, consult [docs/deployment-checklist.md](file:///c:/Users/MSI-1/Downloads/customer-portal-new-/docs/deployment-checklist.md) and obtain the following approved parameters from **CRIS IT** and the **DBA**:

- **Server IP & Hostname**: e.g., `10.20.30.40`, `customer-portal.example.org`
- **SSH Access**: Key-based access with sudo privileges
- **Oracle JDBC URL**: e.g., `jdbc:oracle:thin:@//10.30.6.65:1521/test.crisexacc.org`
- **Oracle DB User & Password**: Least-privilege application schema account
- **CRIS SMTP Host & Port**: Internal mail relay (e.g., `10.77.32.48:25`)
- **DBA Recipient Email**: Email address for customer modification audit alerts
- **SSL/TLS Certificates**: Enterprise certificate chain and private key

> [!CAUTION]
> Never store actual production passwords, API tokens, or private keys in Git repositories or unencrypted scripts.

---

## Step 2: Verify Java Runtime Compatibility

### Project Configuration
- The project repository defines `<java.version>21</java.version>` in `pom.xml`.
- The parent framework is `spring-boot-starter-parent` version `3.4.2`.
- Spring Boot 3.4.x requires a minimum of Java 17 and is fully tested and optimized for **Java 21 LTS**.

### Server JRE Selection
1. **Primary Recommended Runtime**: **OpenJDK 21 Headless** (`openjdk-21-jre-headless`).
   - Ubuntu 22.04 LTS / 24.04 LTS provides OpenJDK 21 directly via standard apt repositories.
2. **Alternative / Future Releases (Java 25 / Temurin)**:
   - If enterprise policy specifies Java 25 or Eclipse Temurin (Adoptium):
     ```bash
     # Add Adoptium repository (Ubuntu)
     wget -O - https://packages.adoptium.net/artifactory/api/gpg/key/public | sudo gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg
     echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/adoptium.list
     sudo apt update
     sudo apt install -y temurin-21-jre
     ```
   - Do not downgrade `pom.xml` without project approval.

---

## Step 3: Run the Server Setup Script

1. Copy `deployment/setup-server.sh` to the Linux server:
   ```bash
   scp deployment/setup-server.sh user@<SERVER_IP>:/tmp/
   ```
2. Log in to the server and review the script:
   ```bash
   ssh user@<SERVER_IP>
   cat /tmp/setup-server.sh
   ```
3. Execute the script with administrative privileges:
   ```bash
   chmod +x /tmp/setup-server.sh
   sudo /tmp/setup-server.sh
   rm /tmp/setup-server.sh
   ```
4. Verify created user and directories:
   ```bash
   id portal
   ls -ld /opt/customer-portal /var/www/customer-portal /var/portal-uploads /etc/customer-portal
   ```

---

## Step 4: Build the Backend with Maven

On the build workstation or CI runner, execute a clean build using the Maven wrapper:

```bash
# Windows
.\mvnw.cmd clean package -DskipTests

# Linux / macOS
./mvnw clean package -DskipTests
```

The resulting executable JAR will be located at:
`target/customer-registration-portal-1.0.0.jar`

---

## Step 5: Build the React Frontend

On the build workstation, install dependencies and build the production frontend:

```bash
cd frontend
npm install
npm run build
```

The compiled static assets will be output to:
`frontend/dist/` (containing `index.html`, `assets/`, `tesseract-assets/`)

---

## Step 6: Transfer Artifacts to the Application Server

Transfer the backend JAR and the frontend static build to the server:

```bash
# Transfer backend JAR
scp target/customer-registration-portal-1.0.0.jar user@<SERVER_IP>:/tmp/customer-portal.jar

# Transfer frontend build bundle
scp -r frontend/dist/* user@<SERVER_IP>:/tmp/frontend-dist/
```

On the server, move the files to their respective target directories with proper ownership:

```bash
# Install backend JAR (Root owned, executable/readable by portal group)
sudo mv /tmp/customer-portal.jar /opt/customer-portal/customer-portal.jar
sudo chown root:portal /opt/customer-portal/customer-portal.jar
sudo chmod 0750 /opt/customer-portal/customer-portal.jar

# Install frontend bundle (Root owned, readable by web server)
sudo rm -rf /var/www/customer-portal/*
sudo mv /tmp/frontend-dist/* /var/www/customer-portal/
sudo chown -R root:portal /var/www/customer-portal
sudo find /var/www/customer-portal -type d -exec chmod 0755 {} +
sudo find /var/www/customer-portal -type f -exec chmod 0644 {} +
```

---

## Step 7: Configure Environment Variables Securely

1. Copy the environment template on the server:
   ```bash
   sudo cp deployment/customer-portal.env.example /etc/customer-portal/customer-portal.env
   ```
2. Edit `/etc/customer-portal/customer-portal.env` with the actual DBA and CRIS IT parameters:
   ```bash
   sudo nano /etc/customer-portal/customer-portal.env
   ```
   Example content:
   ```ini
   ORACLE_DB_URL=jdbc:oracle:thin:@//10.30.6.65:1521/test.crisexacc.org
   ORACLE_DB_USERNAME=tms3t
   ORACLE_DB_PASSWORD=actual_secure_db_password
   CRIS_SMTP_HOST=10.77.32.48
   CRIS_SMTP_PORT=25
   CRIS_MAIL_USERNAME=noreply-custportal@cris.org.in
   CRIS_MAIL_PASSWORD=actual_smtp_password
   DBA_EMAIL=dba_notification@example.com
   SERVER_ADDRESS=127.0.0.1
   SERVER_PORT=8080
   APP_UPLOAD_DIR=/var/portal-uploads
   ```
3. Lock down permissions on the secret environment file:
   ```bash
   sudo chown root:portal /etc/customer-portal/customer-portal.env
   sudo chmod 0600 /etc/customer-portal/customer-portal.env
   ```

---

## Step 8: Install Systemd Service and Nginx Configuration

1. Install systemd service unit:
   ```bash
   sudo cp deployment/customer-portal.service /etc/systemd/system/customer-portal.service
   sudo chmod 0644 /etc/systemd/system/customer-portal.service
   sudo systemctl daemon-reload
   ```

2. Install Nginx configuration:
   ```bash
   sudo cp deployment/nginx-customer-portal.conf /etc/nginx/sites-available/customer-portal.conf
   sudo ln -sf /etc/nginx/sites-available/customer-portal.conf /etc/nginx/sites-enabled/
   # Remove default site if present
   sudo rm -f /etc/nginx/sites-enabled/default
   ```

---

## Step 9: Validate Configuration and Start Services

1. Test Nginx syntax:
   ```bash
   sudo nginx -t
   ```
2. Reload Nginx:
   ```bash
   sudo systemctl reload nginx
   ```
3. Enable and start the Spring Boot backend service:
   ```bash
   sudo systemctl enable customer-portal
   sudo systemctl start customer-portal
   ```
4. Check service status:
   ```bash
   sudo systemctl status customer-portal
   ```

---

## Step 10: Post-Deployment Verification

Verify all application layers sequentially:

1. **Local Backend Port & Health**:
   ```bash
   curl -I http://127.0.0.1:8080/api/customers/master-data
   ```
   Expected: `HTTP/1.1 200 OK` with JSON master data.

2. **Reverse Proxy Routing**:
   ```bash
   curl -I http://customer-portal.example.org/api/customers/master-data
   ```
   Expected: `HTTP/1.1 200 OK`.

3. **Oracle Database Connectivity**:
   Test a customer lookup endpoint:
   ```bash
   curl "http://127.0.0.1:8080/api/customers/old-lookup?code=TEST"
   ```
   Check logs for successful Oracle connection:
   ```bash
   sudo journalctl -u customer-portal -n 50 --no-pager
   ```

4. **Document Uploads**:
   Submit a test multipart upload via the frontend UI and confirm files are stored in `/var/portal-uploads`:
   ```bash
   sudo ls -l /var/portal-uploads
   ```

5. **DBA Email Notification**:
   Perform an update on a test customer record and verify the email dispatch in `journalctl -u customer-portal`.

---

## Step 11: Configure HTTPS and SSL/TLS Renewal

Once CRIS IT provides the signed SSL certificate and private key:

1. Place certificates in the secure directory:
   ```bash
   sudo cp customer-portal.crt /etc/ssl/certs/customer-portal.crt
   sudo cp customer-portal.key /etc/ssl/private/customer-portal.key
   sudo chmod 0644 /etc/ssl/certs/customer-portal.crt
   sudo chmod 0600 /etc/ssl/private/customer-portal.key
   ```
2. Open `/etc/nginx/sites-available/customer-portal.conf`:
   - Uncomment the HTTPS `server { listen 443 ssl http2; ... }` block.
   - Uncomment `return 301 https://$host$request_uri;` in the HTTP block.
3. Validate and reload:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

---

## Step 12: Operational Maintenance & Rollback Procedure

### Viewing Logs
- Application Service Logs:
  ```bash
  sudo journalctl -u customer-portal -f
  ```
- Nginx Access & Error Logs:
  ```bash
  sudo tail -f /var/log/nginx/customer-portal_access.log
  sudo tail -f /var/log/nginx/customer-portal_error.log
  ```

### Rollback Procedure
If a new release encounters runtime issues:

1. Restore previous JAR backup:
   ```bash
   sudo cp /opt/customer-portal/customer-portal.jar.bak /opt/customer-portal/customer-portal.jar
   sudo systemctl restart customer-portal
   ```
2. Restore previous frontend build:
   ```bash
   sudo rm -rf /var/www/customer-portal/*
   sudo cp -r /var/www/customer-portal.bak/* /var/www/customer-portal/
   sudo systemctl reload nginx
   ```
3. Confirm health:
   ```bash
   curl -I http://127.0.0.1:8080/api/customers/master-data
   ```
