-- ============================================================================
-- 03_indexes.sql
-- Customer Registration Application - Performance Indexes
-- Execution Order: 3 of 5
-- ============================================================================
-- NOTE: Indexes are designed for the test/development workload.
-- When migrating to FOIS production, review and adjust based on actual query patterns.
-- Primary key indexes are auto-created by Oracle and not listed here.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FOIS TABLE INDEXES (mirroring typical FOIS access patterns)
-- ---------------------------------------------------------------------------

-- Global Customer: Search by name
CREATE INDEX IDX_MEMGLBLCUST_NAME ON MEMGLBLCUST (MAVGLBLCUSTNAME);

-- Global Customer: PCO code lookup (zone/division filtering)
CREATE INDEX IDX_MEMGLBLCUST_PCO ON MEMGLBLCUST (MAVPCOCODE);

-- Global Customer: EDMND flag + implementation date queries
CREATE INDEX IDX_MEMGLBLCUST_EDMND ON MEMGLBLCUST (MAVEDMNDFLAG, MADIMPLDATE);

-- Handling Agent: Search by name
CREATE INDEX IDX_MEMGLBLHNDGAGNT_NAME ON MEMGLBLHNDGAGNT (MAVHNDGAGNTNAME);

-- Handling Agent: PCO code lookup
CREATE INDEX IDX_MEMGLBLHNDGAGNT_PCO ON MEMGLBLHNDGAGNT (MAVPCOCODE);

-- Handling Agent: EDMND flag + implementation date queries
CREATE INDEX IDX_MEMGLBLHNDGAGNT_EDMND ON MEMGLBLHNDGAGNT (MAVEDMNDFLAG, MADIMPLDATE);

-- Wagon Ownership: Description search
CREATE INDEX IDX_MEMWGONOWNRSHIP_DESC ON MEMWGONOWNRSHIP (MAVWGONOWNRSHIPDESC);

-- Wagon Owner Party: Description search
CREATE INDEX IDX_MEMWGONOWNRPRTY_DESC ON MEMWGONOWNRPRTY (MAVWGONOWNRPRTYDESC);

-- ---------------------------------------------------------------------------
-- CUSTOMER REGISTRATION TABLE INDEXES
-- ---------------------------------------------------------------------------

-- Customer Master: Search by customer name
CREATE INDEX IDX_MEMCUSTOMER_NAME ON MEMCUSTOMER (MAVCUSTOMERNAME);

-- Customer Master: Search by city
CREATE INDEX IDX_MEMCUSTOMER_CITY ON MEMCUSTOMER (MAVCITY);

-- Customer Master: Global Customer code FK + lookup
CREATE INDEX IDX_MEMCUSTOMER_GLBLCUST ON MEMCUSTOMER (MAVGLBLCUSTCODE);

-- Customer Master: Handling Agent code FK + lookup
CREATE INDEX IDX_MEMCUSTOMER_HNDGAGNT ON MEMCUSTOMER (MAVHNDGAGNTCODE);

-- Customer Master: PAN search (for tax validation queries)
CREATE INDEX IDX_MEMCUSTOMER_PAN ON MEMCUSTOMER (MAVPAN);

-- Customer Master: Email search (for contact queries)
CREATE INDEX IDX_MEMCUSTOMER_EMAIL ON MEMCUSTOMER (MAVEMAIL);

-- Customer Master: Mobile search
CREATE INDEX IDX_MEMCUSTOMER_MOBILE ON MEMCUSTOMER (MAVMOBILE);

-- Customer Master: Active flag + created date (for active customer reports)
CREATE INDEX IDX_MEMCUSTOMER_ACTIVE_CREATED ON MEMCUSTOMER (MACACTIVEFLAG, MADCREATEDDATE);

-- Customer Master: Pincode search
CREATE INDEX IDX_MEMCUSTOMER_PINCODE ON MEMCUSTOMER (MAVPINCODE);

-- ---------------------------------------------------------------------------
-- GSTIN TABLE INDEXES
-- ---------------------------------------------------------------------------

-- Customer GSTIN: Customer code FK (critical for 1-to-many joins)
CREATE INDEX IDX_MEMCUSTGSTIN_CUSTOMER ON MEMCUSTOMERGSTIN (MAVCUSTOMERCODE);

-- Customer GSTIN: GSTIN number search (tax dept queries)
CREATE INDEX IDX_MEMCUSTGSTIN_GSTINNUM ON MEMCUSTOMERGSTIN (MAVGSTINNUMBER);

-- Customer GSTIN: State + customer code (state-wise reporting)
CREATE INDEX IDX_MEMCUSTGSTIN_STATE_CUST ON MEMCUSTOMERGSTIN (MAVSTATE, MAVCUSTOMERCODE);

-- Customer GSTIN: State code (for 2-digit state prefix matching)
CREATE INDEX IDX_MEMCUSTGSTIN_STATECODE ON MEMCUSTOMERGSTIN (MAVSTATECODE);

-- Customer GSTIN: Active flag + customer code
CREATE INDEX IDX_MEMCUSTGSTIN_ACTIVE_CUST ON MEMCUSTOMERGSTIN (MACACTIVEFLAG, MAVCUSTOMERCODE);
