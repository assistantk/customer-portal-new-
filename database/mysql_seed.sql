-- ============================================================================
-- mysql_seed.sql
-- Customer Registration Portal — TEST DATA ONLY
-- ============================================================================
-- WARNING: This is TEST DATA. Do NOT use in production.
-- Run after mysql_schema.sql:  mysql -u root -p customer_portal < database/mysql_seed.sql
-- ============================================================================

USE customer_portal;

-- ---------------------------------------------------------------------------
-- 1. Global Customers (3 rows — NYIL, NYI1, SCC0)
--    NYI2 left free to test duplicate-code generation
-- ---------------------------------------------------------------------------
INSERT INTO global_customers (global_code, company_name, address, city, central_belonging, pco_code, edemand_flag, implementation_date, implementation_remark)
VALUES
('NYIL', 'NY Infra Limited',             'Plot 42, Sector 18, Noida Expressway', 'Noida',   'N', '012', 'N', '2024-01-15', 'Approved via memo 04/2024'),
('NYI1', 'NY Infra Logistics Division',  'Building A, Sector 62, Noida',         'Noida',   'N', '012', 'N', '2024-02-10', 'Split from NY Infra group'),
('SCC0', 'Sharma Construction Company',  '15 Park Street, Near Metro',           'Kolkata', 'N', '033', 'N', '2023-11-20', 'Registered Kolkata HQ');

-- ---------------------------------------------------------------------------
-- 2. Handling Agents (2 rows — ATPL, RPAL)
-- ---------------------------------------------------------------------------
INSERT INTO handling_agents (handling_agent_code, handling_agent_name, address, city, central_belonging, pco_code, edemand_flag, implementation_date, implementation_remark)
VALUES
('ATPL', 'ABC Technologies Pvt Ltd',   '704 Tech Park, Outer Ring Rd', 'Bengaluru', 'N', '080', 'N', '2024-03-01', 'South Zone empaneled'),
('RPAL', 'Raj Packers And Logistics',   'Ground Floor, Transport Nagar', 'Jaipur',  'N', '014', 'N', '2023-08-05', 'North Zone empaneled');

-- ---------------------------------------------------------------------------
-- 3. Customers (2 rows)
--    TEST001: NY Infra (Global NYIL), 1 GSTIN, PAN present
--    TEST002: Sharma Construction (Handling ATPL), 4 GSTINs, PAN NULL for testing
-- ---------------------------------------------------------------------------
INSERT INTO customers (customer_code, company_name, address, city, pincode, pco_code, pan_number, email, mobile, global_customer_code, handling_agent_code, active)
VALUES
('TEST001', 'NY Infra Limited',            'Plot 42, Sector 18, Noida Expressway', 'Noida',   '201301', '012', 'ABCDE1234F', 'finance@nyinfra.in',        '9876543210', 'NYIL', NULL,   'Y'),
('TEST002', 'Sharma Construction Company', '15 Park Street, Near Metro Plaza',     'Kolkata', '700016', '033', NULL,          'accounts@sharmacons.co.in', '9000011111', NULL,   'ATPL', 'Y');

-- ---------------------------------------------------------------------------
-- 4. Customer GSTINs (5 rows)
--    TEST001: 1 GSTIN (Uttar Pradesh)
--    TEST002: 4 GSTINs (Delhi, West Bengal, Maharashtra, Karnataka)
-- ---------------------------------------------------------------------------
INSERT INTO customer_gstins (customer_code, state, state_code, gstin_number, file_name, file_type, active)
VALUES
('TEST001', 'Uttar Pradesh', '09', '09ABCDE1234F1Z5', 'NY_Infra_UP_GSTIN.pdf',            'application/pdf', 'Y'),
('TEST002', 'Delhi',         '07', '07SCCSH9999R1Z1', 'Sharma_Construction_Delhi_GST.pdf', 'application/pdf', 'Y'),
('TEST002', 'West Bengal',   '19', '19SCCSH9999R1Z2', 'Sharma_Construction_WB_GST.pdf',    'application/pdf', 'Y'),
('TEST002', 'Maharashtra',   '27', '27SCCSH9999R1Z3', 'Sharma_Construction_MH_GST.pdf',    'application/pdf', 'Y'),
('TEST002', 'Karnataka',     '29', '29SCCSH9999R1Z4', 'Sharma_Construction_KA_GST.pdf',    'application/pdf', 'Y');

-- ============================================================================
-- VERIFICATION: Run these queries after loading to confirm data:
--   SELECT * FROM global_customers;   -- expect 3 rows
--   SELECT * FROM handling_agents;    -- expect 2 rows
--   SELECT * FROM customers;          -- expect 2 rows
--   SELECT * FROM customer_gstins;    -- expect 5 rows
-- ============================================================================
