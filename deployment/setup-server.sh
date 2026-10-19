#!/usr/bin/env bash
set -Eeuo pipefail

# ==============================================================================
# CRIS Customer Registration Portal — Linux Server Provisioning Script
#
# Target OS: Ubuntu Server 22.04 LTS / 24.04 LTS
# Target Java Runtime: OpenJDK 21 JRE (Matching pom.xml <java.version>21</java.version>)
#
# SAFETY NOTICE:
# - Run only on an approved, newly prepared Ubuntu server.
# - Review this script with the CRIS IT systems administrator before execution.
# - This script requires sudo/root privileges.
# ==============================================================================

echo "==> [1/5] Updating system package index..."
sudo apt update

echo "==> [2/5] Installing Nginx and core system utilities..."
sudo apt install -y nginx curl wget ufw logrotate

echo "==> [3/5] Installing Java Runtime..."
# Project Maven configuration (pom.xml) specifies Java 21 (LTS).
# Spring Boot 3.4.2 natively supports Java 21.
# On Ubuntu 22.04/24.04 LTS, openjdk-21-jre-headless is provided via standard repositories.
if ! command -v java >/dev/null 2>&1; then
    echo "Installing openjdk-21-jre-headless..."
    sudo apt install -y openjdk-21-jre-headless
else
    echo "Java is already installed: $(java -version 2>&1 | head -n 1)"
fi

# NOTE for Java 25 / Adoptium installations (if required by CRIS IT):
# If enterprise policy mandates Java 25 or Eclipse Temurin:
#   wget -O - https://packages.adoptium.net/artifactory/api/gpg/key/public | sudo gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg
#   echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/adoptium.list
#   sudo apt update && sudo apt install -y temurin-21-jre (or temurin-25-jre when released)

echo "==> [4/5] Creating dedicated system service account..."
# Service account 'portal': no interactive login shell, dedicated system account
if ! id portal >/dev/null 2>&1; then
    sudo useradd --system --create-home --shell /usr/sbin/nologin portal
    echo "Service account 'portal' created."
else
    echo "Service account 'portal' already exists."
fi

echo "==> [5/5] Creating application directories with hardened permissions..."
# 1. Backend Application Directory (root owned, group readable/executable by portal)
#    Prevents the portal user from modifying or overwriting the application JAR.
sudo install -d -o root -g portal -m 0750 /opt/customer-portal

# 2. Frontend Web Assets Directory (root owned, readable by Nginx www-data & portal)
sudo install -d -o root -g portal -m 0750 /var/www/customer-portal

# 3. Document Upload Storage (portal owned, read/write for multipart uploads)
sudo install -d -o portal -g portal -m 0750 /var/portal-uploads

# 4. Secure Environment & Secrets Configuration (root owned, group readable by portal)
sudo install -d -o root -g portal -m 0750 /etc/customer-portal

# 5. Application Log Directory (portal owned)
sudo install -d -o portal -g portal -m 0750 /var/log/customer-portal

echo ""
echo "=========================================================================="
echo "SUCCESS: Server base setup completed successfully."
echo "Verified directories:"
echo "  - /opt/customer-portal      (Application JAR home)"
echo "  - /var/www/customer-portal  (React static bundle)"
echo "  - /var/portal-uploads       (Document upload repository)"
echo "  - /etc/customer-portal      (Encrypted/secure environment configuration)"
echo "  - /var/log/customer-portal  (Application logs)"
echo "Next step: Deploy customer-portal.service and customer-portal.env."
echo "=========================================================================="
