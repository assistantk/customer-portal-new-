-- ============================================================================
-- 02_constraints.sql
-- Customer Registration Application - Constraints
-- Execution Order: 2 of 5
-- ============================================================================
-- NOTE: FOIS table PKs are preserved exactly. New tables use migration-friendly
-- constraint names that can be dropped and re-created in FOIS if needed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PRIMARY KEY CONSTRAINTS
-- ---------------------------------------------------------------------------

-- FOIS Existing Tables - Primary Keys preserved exactly
ALTER TABLE MEMGLBLCUST ADD CONSTRAINT PK_MEMGLBLCUST
    PRIMARY KEY (MAVGLBLCUSTCODE);

ALTER TABLE MEMGLBLHNDGAGNT ADD CONSTRAINT PK_MEMGLBLHNDGAGNT
    PRIMARY KEY (MAVHNDGAGNTCODE);

ALTER TABLE MEMWGONOWNRSHIP ADD CONSTRAINT PK_MEMWGONOWNRSHIP
    PRIMARY KEY (MAVWGONOWNRSHIPCODE);

ALTER TABLE MEMWGONOWNRPRTY ADD CONSTRAINT PK_MEMWGONOWNRPRTY
    PRIMARY KEY (MAVWGONOWNRPRTYCODE);

-- New Customer Registration Tables - Primary Keys
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT PK_MEMCUSTOMER
    PRIMARY KEY (MAVCUSTOMERCODE);

ALTER TABLE MEMCUSTOMERGSTIN ADD CONSTRAINT PK_MEMCUSTOMERGSTIN
    PRIMARY KEY (GSTINID);

-- ---------------------------------------------------------------------------
-- FOREIGN KEY CONSTRAINTS
-- ---------------------------------------------------------------------------

-- MEMCUSTOMER references FOIS Global Customer table
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT FK_MEMCUSTOMER_GLBLCUST
    FOREIGN KEY (MAVGLBLCUSTCODE)
    REFERENCES MEMGLBLCUST (MAVGLBLCUSTCODE);

-- MEMCUSTOMER references FOIS Handling Agent table
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT FK_MEMCUSTOMER_HNDGAGNT
    FOREIGN KEY (MAVHNDGAGNTCODE)
    REFERENCES MEMGLBLHNDGAGNT (MAVHNDGAGNTCODE);

-- MEMCUSTOMERGSTIN references MEMCUSTOMER (1-to-many relationship)
ALTER TABLE MEMCUSTOMERGSTIN ADD CONSTRAINT FK_MEMCUSTGSTIN_CUSTOMER
    FOREIGN KEY (MAVCUSTOMERCODE)
    REFERENCES MEMCUSTOMER (MAVCUSTOMERCODE)
    ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- UNIQUE CONSTRAINTS
-- ---------------------------------------------------------------------------

-- Prevent duplicate GSTIN number for the same customer
ALTER TABLE MEMCUSTOMERGSTIN ADD CONSTRAINT UQ_MEMCUSTGSTIN_CUST_GSTIN
    UNIQUE (MAVCUSTOMERCODE, MAVGSTINNUMBER);

-- PAN number should be unique per customer (optional check, allow NULLs)
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT UQ_MEMCUSTOMER_PAN
    UNIQUE (MAVPAN);

-- Email should be unique per customer (optional check, allow NULLs)
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT UQ_MEMCUSTOMER_EMAIL
    UNIQUE (MAVEMAIL);

-- Ensure Global Code or Handling Agent Code is set (at least one required)
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT CK_MEMCUSTOMER_CODE_PRESENT
    CHECK (
        (MAVGLBLCUSTCODE IS NOT NULL AND MAVHNDGAGNTCODE IS NULL)
        OR (MAVGLBLCUSTCODE IS NULL AND MAVHNDGAGNTCODE IS NOT NULL)
    );

-- ---------------------------------------------------------------------------
-- CHECK CONSTRAINTS
-- ---------------------------------------------------------------------------

-- Active flag validation (Y/N only) for MEMCUSTOMER
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT CK_MEMCUSTOMER_ACTIVEFLAG
    CHECK (MACACTIVEFLAG IN ('Y', 'N'));

-- Active flag validation (Y/N only) for MEMCUSTOMERGSTIN
ALTER TABLE MEMCUSTOMERGSTIN ADD CONSTRAINT CK_MEMCUSTGSTIN_ACTIVEFLAG
    CHECK (MACACTIVEFLAG IN ('Y', 'N'));

-- PAN format validation: 5 letters, 4 digits, 1 letter (10 chars total)
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT CK_MEMCUSTOMER_PAN_FORMAT
    CHECK (MAVPAN IS NULL OR REGEXP_LIKE(MAVPAN, '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'));

-- GSTIN format validation: 15 chars (2 state code + 10 PAN + 1 entity + 1 Z + 1 check)
ALTER TABLE MEMCUSTOMERGSTIN ADD CONSTRAINT CK_MEMCUSTGSTIN_FORMAT
    CHECK (REGEXP_LIKE(MAVGSTINNUMBER, '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}[Z]{1}[A-Z0-9]{1}$'));

-- Indian mobile validation: 10 digits, can start with 6/7/8/9
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT CK_MEMCUSTOMER_MOBILE
    CHECK (MAVMOBILE IS NULL OR REGEXP_LIKE(MAVMOBILE, '^[6-9][0-9]{9}$'));

-- Pincode validation: 6 digits
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT CK_MEMCUSTOMER_PINCODE
    CHECK (MAVPINCODE IS NULL OR REGEXP_LIKE(MAVPINCODE, '^[0-9]{6}$'));

-- PCO Code validation: 2-3 digits (STD code pattern)
ALTER TABLE MEMCUSTOMER ADD CONSTRAINT CK_MEMCUSTOMER_PCOCODE
    CHECK (MAVPCOCODE IS NULL OR REGEXP_LIKE(MAVPCOCODE, '^[0-9]{2,3}$'));

-- FOIS MAVEDMNDFLAG validation (Y/N)
ALTER TABLE MEMGLBLCUST ADD CONSTRAINT CK_MEMGLBLCUST_EDMNDFLAG
    CHECK (MAVEDMNDFLAG IS NULL OR MAVEDMNDFLAG IN ('Y', 'N'));

ALTER TABLE MEMGLBLHNDGAGNT ADD CONSTRAINT CK_MEMGLBLHNDGAGNT_EDMNDFLAG
    CHECK (MAVEDMNDFLAG IS NULL OR MAVEDMNDFLAG IN ('Y', 'N'));

-- FOIS MAVCENTBLNG validation (Y/N)
ALTER TABLE MEMGLBLCUST ADD CONSTRAINT CK_MEMGLBLCUST_CENTBLNG
    CHECK (MAVCENTBLNG IS NULL OR MAVCENTBLNG IN ('Y', 'N'));

ALTER TABLE MEMGLBLHNDGAGNT ADD CONSTRAINT CK_MEMGLBLHNDGAGNT_CENTBLNG
    CHECK (MAVCENTBLNG IS NULL OR MAVCENTBLNG IN ('Y', 'N'));

-- FOIS Wagon Ownership validity flag
ALTER TABLE MEMWGONOWNRSHIP ADD CONSTRAINT CK_MEMWGONOWNRSHIP_RVLDTY
    CHECK (MACOWNRVLDTYFLAG IS NULL OR MACOWNRVLDTYFLAG IN ('Y', 'N'));
