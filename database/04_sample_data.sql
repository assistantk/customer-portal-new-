-- ============================================================================
-- 04_sample_data.sql
-- Customer Registration Application - Sample / Test Data
-- Execution Order: 4 of 5
-- ============================================================================
-- WARNING: This is TEST DATA ONLY. Do NOT run in FOIS production.
-- All data is fictional and for development/testing purposes only.
-- ============================================================================
-- This script populates:
--   * At least 2 Global Customer codes (FOIS MEMGLBLCUST)
--   * At least 2 Handling Agent codes (FOIS MEMGLBLHNDGAGNT)
--   * FOIS reference tables MEMWGONOWNRSHIP and MEMWGONOWNRPRTY
--   * 2 Customer Master records:
--     - Customer 1: 1 GSTIN (single state)
--     - Customer 2: 4 GSTINs (Delhi, WB, Maharashtra, Karnataka)  ← Multi-state
--   * Duplicate-code test scenario: NYIL reserved → NYI1 reserved → NYI2 available
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SET NLS DATE FORMAT for clean date literals (session level)
-- ---------------------------------------------------------------------------
ALTER SESSION SET NLS_DATE_FORMAT = 'YYYY-MM-DD';

-- ============================================================================
-- SECTION 1: FOIS REFERENCE TABLES
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1.1 MEMGLBLCUST - Global Customer Codes
--      Scenario: NYIL base code taken → NYI1 taken → NYI2 left available for test
-- ---------------------------------------------------------------------------
INSERT INTO MEMGLBLCUST (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME,
    MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, MADEDMNDDATE)
VALUES ('NYIL', 'NY Infra Limited', 'Plot 42, Sector 18, Noida Expressway', 'Noida',
    'N', '012', 'N', '2024-01-15', 'Approved via FOIS memo 04/2024', NULL);

-- Duplicate-code scenario: Next variation NYI1 is ALSO taken
INSERT INTO MEMGLBLCUST (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME,
    MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, MADEDMNDDATE)
VALUES ('NYI1', 'NY Infra Logistics Division', 'Building A, Sector 62, Noida', 'Noida',
    'N', '012', 'N', '2024-02-10', 'Split from NY Infra group', NULL);

-- NOTE: NYI2 is intentionally LEFT AVAILABLE to test the duplicate-code generation flow.
-- The code-generation API should produce NYI2 as the next unique variation.

-- Another independent Global Code for second customer scenario
INSERT INTO MEMGLBLCUST (MAVGLBLCUSTCODE, MAVGLBLCUSTNAME, MAVGLBLCUSTADDRTEXT, MAVGNBLCUSTCITYNAME,
    MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, MADEDMNDDATE)
VALUES ('SCC0', 'Sharma Construction Company', '15 Park Street, Near Metro', 'Kolkata',
    'N', '033', 'N', '2023-11-20', 'Registered Kolkata HQ', NULL);

-- ---------------------------------------------------------------------------
-- 1.2 MEMGLBLHNDGAGNT - Handling Agent Codes
-- ---------------------------------------------------------------------------
INSERT INTO MEMGLBLHNDGAGNT (MAVHNDGAGNTCODE, MAVHNDGAGNTNAME, MAVHNDGAGNTADDRTEXT, MAVHNDGAGNTCITYNAME,
    MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, MADEDMNDDATE)
VALUES ('ATPL', 'ABC Technologies Pvt Ltd', '704 Tech Park, Outer Ring Rd', 'Bengaluru',
    'N', '080', 'N', '2024-03-01', 'South Zone empaneled', NULL);

-- Another Handling Agent for second customer
INSERT INTO MEMGLBLHNDGAGNT (MAVHNDGAGNTCODE, MAVHNDGAGNTNAME, MAVHNDGAGNTADDRTEXT, MAVHNDGAGNTCITYNAME,
    MAVCENTBLNG, MAVPCOCODE, MAVEDMNDFLAG, MADIMPLDATE, MAVIMPLREMK, MADEDMNDDATE)
VALUES ('RPAL', 'Raj Packers And Logistics', 'Ground Floor, Transport Nagar', 'Jaipur',
    'N', '014', 'N', '2023-08-05', 'North Zone empaneled', NULL);

-- ---------------------------------------------------------------------------
-- 1.3 MEMWGONOWNRSHIP - Wagon Ownership (FOIS reference)
-- ---------------------------------------------------------------------------
INSERT INTO MEMWGONOWNRSHIP (MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC, MACPRVTPRTYCODE,
    MACOWNRVLDTYFLAG, MADDATELASTUPDT, MAVRMRK)
VALUES ('OWNR', 'Owned by Indian Railways', 'IR', 'Y', '2024-06-01', 'Default ownership');

INSERT INTO MEMWGONOWNRSHIP (MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC, MACPRVTPRTYCODE,
    MACOWNRVLDTYFLAG, MADDATELASTUPDT, MAVRMRK)
VALUES ('PRVT', 'Privately Owned Wagon', 'PRIVATE', 'Y', '2024-06-01', 'Customer-owned');

INSERT INTO MEMWGONOWNRSHIP (MAVWGONOWNRSHIPCODE, MAVWGONOWNRSHIPDESC, MACPRVTPRTYCODE,
    MACOWNRVLDTYFLAG, MADDATELASTUPDT, MAVRMRK)
VALUES ('LEAS', 'Leased Wagon', 'LEASE', 'Y', '2024-06-01', 'On operating lease');

-- ---------------------------------------------------------------------------
-- 1.4 MEMWGONOWNRPRTY - Wagon Owner Parties (FOIS reference)
-- ---------------------------------------------------------------------------
INSERT INTO MEMWGONOWNRPRTY (MAVWGONOWNRPRTYCODE, MAVWGONOWNRPRTYDESC)
VALUES ('IR001', 'Indian Railways - Central');

INSERT INTO MEMWGONOWNRPRTY (MAVWGONOWNRPRTYCODE, MAVWGONOWNRPRTYDESC)
VALUES ('CON01', 'CONCOR - Container Corporation');

INSERT INTO MEMWGONOWNRPRTY (MAVWGONOWNRPRTYCODE, MAVWGONOWNRPRTYDESC)
VALUES ('LOG01', 'Private Logistics Party');

-- ============================================================================
-- SECTION 2: CUSTOMER REGISTRATION
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 2.1 Customer 1 - Single GSTIN (NY Infra Limited → Global Customer Code NYIL)
--     Customer Code: CUST001
-- ---------------------------------------------------------------------------
INSERT INTO MEMCUSTOMER (MAVCUSTOMERCODE, MAVCUSTOMERNAME, MAVADDRESS, MAVCITY, MAVPINCODE, MAVPCOCODE,
    MAVPAN, MAVEMAIL, MAVMOBILE, MAVGLBLCUSTCODE, MAVHNDGAGNTCODE,
    MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE)
VALUES ('CUST001', 'NY Infra Limited', 'Plot 42, Sector 18, Noida Expressway', 'Noida', '201301', '012',
    'ABCDE1234F', 'finance@nyinfra.in', '9876543210', 'NYIL', NULL,
    'Y', '2025-01-10', '2025-06-15');

-- Customer 1 - ONE GSTIN (Uttar Pradesh only)
INSERT INTO MEMCUSTOMERGSTIN (GSTINID, MAVCUSTOMERCODE, MAVSTATE, MAVSTATECODE, MAVGSTINNUMBER,
    MAVGSTINFILENAME, MAVGSTINFILETYPE, MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE)
VALUES (SEQ_MEMCUSTOMERGSTIN_GSTINID.NEXTVAL, 'CUST001', 'Uttar Pradesh', '09', '09ABCDE1234F1Z5',
    'NY_Infra_UP_GSTIN.pdf', 'application/pdf', 'Y', '2025-01-10', '2025-01-10');

-- ---------------------------------------------------------------------------
-- 2.2 Customer 2 - MULTIPLE GSTINs (Sharma Construction Company → Handling Agent ATPL)
--     Customer Code: CUST002
--     Multi-state: Delhi, West Bengal, Maharashtra, Karnataka
-- ---------------------------------------------------------------------------
INSERT INTO MEMCUSTOMER (MAVCUSTOMERCODE, MAVCUSTOMERNAME, MAVADDRESS, MAVCITY, MAVPINCODE, MAVPCOCODE,
    MAVPAN, MAVEMAIL, MAVMOBILE, MAVGLBLCUSTCODE, MAVHNDGAGNTCODE,
    MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE)
VALUES ('CUST002', 'Sharma Construction Company', '15 Park Street, Near Metro Plaza', 'Kolkata', '700016', '033',
    'SCCSH9999R', 'accounts@sharmacons.co.in', '9000011111', NULL, 'ATPL',
    'Y', '2025-02-20', '2025-07-10');

-- Customer 2 - FOUR GSTINs (multiple states)
-- Delhi GSTIN
INSERT INTO MEMCUSTOMERGSTIN (GSTINID, MAVCUSTOMERCODE, MAVSTATE, MAVSTATECODE, MAVGSTINNUMBER,
    MAVGSTINFILENAME, MAVGSTINFILETYPE, MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE)
VALUES (SEQ_MEMCUSTOMERGSTIN_GSTINID.NEXTVAL, 'CUST002', 'Delhi', '07', '07SCCSH9999R1Z1',
    'Sharma_Construction_Delhi_GST.pdf', 'application/pdf', 'Y', '2025-02-20', '2025-02-20');

-- West Bengal GSTIN
INSERT INTO MEMCUSTOMERGSTIN (GSTINID, MAVCUSTOMERCODE, MAVSTATE, MAVSTATECODE, MAVGSTINNUMBER,
    MAVGSTINFILENAME, MAVGSTINFILETYPE, MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE)
VALUES (SEQ_MEMCUSTOMERGSTIN_GSTINID.NEXTVAL, 'CUST002', 'West Bengal', '19', '19SCCSH9999R1Z2',
    'Sharma_Construction_WB_GST.pdf', 'application/pdf', 'Y', '2025-03-01', '2025-03-01');

-- Maharashtra GSTIN
INSERT INTO MEMCUSTOMERGSTIN (GSTINID, MAVCUSTOMERCODE, MAVSTATE, MAVSTATECODE, MAVGSTINNUMBER,
    MAVGSTINFILENAME, MAVGSTINFILETYPE, MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE)
VALUES (SEQ_MEMCUSTOMERGSTIN_GSTINID.NEXTVAL, 'CUST002', 'Maharashtra', '27', '27SCCSH9999R1Z3',
    'Sharma_Construction_MH_GST.pdf', 'application/pdf', 'Y', '2025-04-12', '2025-04-12');

-- Karnataka GSTIN
INSERT INTO MEMCUSTOMERGSTIN (GSTINID, MAVCUSTOMERCODE, MAVSTATE, MAVSTATECODE, MAVGSTINNUMBER,
    MAVGSTINFILENAME, MAVGSTINFILETYPE, MACACTIVEFLAG, MADCREATEDDATE, MADUPDATEDDATE)
VALUES (SEQ_MEMCUSTOMERGSTIN_GSTINID.NEXTVAL, 'CUST002', 'Karnataka', '29', '29SCCSH9999R1Z4',
    'Sharma_Construction_KA_GST.pdf', 'application/pdf', 'Y', '2025-05-05', '2025-05-05');

-- ============================================================================
-- COMMIT ALL SAMPLE DATA
-- ============================================================================
COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run after loading to confirm data integrity)
-- ============================================================================
-- Expected results:
--   MEMGLBLCUST   count: 3  (NYIL, NYI1, SCC0)
--   MEMGLBLHNDGAGNT count: 2  (ATPL, RPAL)
--   MEMCUSTOMER   count: 2  (CUST001, CUST002)
--   MEMCUSTOMERGSTIN count: 5  (1 UP for CUST001, 4 multi-state for CUST002)
-- ============================================================================
