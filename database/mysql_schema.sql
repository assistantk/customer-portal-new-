-- ============================================================================
-- mysql_schema.sql
-- Customer Registration Portal — MySQL Database Schema
-- ============================================================================
-- Creates: database, tables, indexes, constraints
-- Run as: mysql -u root -p < database/mysql_schema.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS customer_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE customer_portal;

-- ---------------------------------------------------------------------------
-- 1. GLOBAL CUSTOMERS (mirrors FOIS MEMGLBLCUST)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS global_customers (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    global_code           VARCHAR(4)    NOT NULL,
    company_name          VARCHAR(45),
    address               VARCHAR(100),
    city                  VARCHAR(30),
    central_belonging     VARCHAR(1),
    pco_code              VARCHAR(3),
    edemand_flag          VARCHAR(1),
    implementation_date   DATE,
    implementation_remark VARCHAR(35),
    edemand_date          DATE,
    created_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_global_code (global_code)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 2. HANDLING AGENTS (mirrors FOIS MEMGLBLHNDGAGNT)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS handling_agents (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    handling_agent_code     VARCHAR(4)    NOT NULL,
    handling_agent_name     VARCHAR(45)   NOT NULL,
    address                 VARCHAR(100),
    city                    VARCHAR(30),
    central_belonging       VARCHAR(1),
    pco_code                VARCHAR(3),
    edemand_flag            VARCHAR(1),
    implementation_date     DATE,
    implementation_remark   VARCHAR(35),
    edemand_date            DATE,
    created_at              TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_handling_agent_code (handling_agent_code)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 3. CUSTOMERS (application Customer Code table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    customer_code         VARCHAR(10)   NOT NULL,
    company_name          VARCHAR(100)  NOT NULL,
    address               VARCHAR(255),
    city                  VARCHAR(50),
    pincode               VARCHAR(10),
    pco_code              VARCHAR(3),
    pan_number            VARCHAR(10),
    pan_file_name         VARCHAR(255),
    pan_file_type         VARCHAR(50),
    pan_file_path         VARCHAR(500),
    email                 VARCHAR(100),
    mobile                VARCHAR(15),
    global_customer_code  VARCHAR(4),
    handling_agent_code   VARCHAR(4),
    active                CHAR(1)       DEFAULT 'Y',
    created_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_customer_code (customer_code),

    -- At least one of global or handling code required (XOR)
    CONSTRAINT chk_code_present CHECK (
        (global_customer_code IS NOT NULL AND handling_agent_code IS NULL)
        OR (global_customer_code IS NULL AND handling_agent_code IS NOT NULL)
    ),

    CONSTRAINT chk_active CHECK (active IN ('Y', 'N')),

    CONSTRAINT fk_customer_global
        FOREIGN KEY (global_customer_code)
        REFERENCES global_customers (global_code),

    CONSTRAINT fk_customer_handling
        FOREIGN KEY (handling_agent_code)
        REFERENCES handling_agents (handling_agent_code)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 4. CUSTOMER GSTINS (one-to-many: customer → GSTINs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_gstins (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    customer_code     VARCHAR(10)   NOT NULL,
    state             VARCHAR(50)   NOT NULL,
    state_code        VARCHAR(2),
    gstin_number      VARCHAR(15)   NOT NULL,
    file_name         VARCHAR(255),
    file_type         VARCHAR(50),
    file_path         VARCHAR(500),
    active            CHAR(1)       DEFAULT 'Y',
    created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_customer_gstin (customer_code, gstin_number),
    CONSTRAINT chk_gstin_active CHECK (active IN ('Y', 'N')),

    CONSTRAINT fk_gstin_customer
        FOREIGN KEY (customer_code)
        REFERENCES customers (customer_code)
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- 5. INDEXES
-- ---------------------------------------------------------------------------
CREATE INDEX idx_global_name      ON global_customers (company_name);
CREATE INDEX idx_handling_name    ON handling_agents (handling_agent_name);
CREATE INDEX idx_customer_name    ON customers (company_name);
CREATE INDEX idx_customer_city    ON customers (city);
CREATE INDEX idx_customer_global  ON customers (global_customer_code);
CREATE INDEX idx_customer_handling ON customers (handling_agent_code);
CREATE INDEX idx_customer_pan     ON customers (pan_number);
CREATE INDEX idx_customer_email   ON customers (email);
CREATE INDEX idx_customer_mobile  ON customers (mobile);
CREATE INDEX idx_gstin_customer   ON customer_gstins (customer_code);
CREATE INDEX idx_gstin_number     ON customer_gstins (gstin_number);
CREATE INDEX idx_gstin_state      ON customer_gstins (state, customer_code);
