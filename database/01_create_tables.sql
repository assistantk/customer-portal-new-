-- ============================================================================
-- 01_create_tables.sql
-- Customer Registration Application - Oracle Database Schema
-- Execution Order: 1 of 5
-- ============================================================================
-- NOTE: All FOIS table names, column names, and data types are preserved EXACTLY
-- as specified. DO NOT modify these without FOIS team approval.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- EXISTING FOIS TABLES (reproduced for test environment)
-- DO NOT MODIFY COLUMN DEFINITIONS WITHOUT FOIS APPROVAL
-- ---------------------------------------------------------------------------

-- FOIS Global Customer Master Table
CREATE TABLE MEMGLBLCUST (
    MAVGLBLCUSTCODE     VARCHAR2(4)     NOT NULL,
    MAVGLBLCUSTNAME     VARCHAR2(45),
    MAVGLBLCUSTADDRTEXT VARCHAR2(100),
    MAVGNBLCUSTCITYNAME VARCHAR2(30),
    MAVCENTBLNG         VARCHAR2(1),
    MAVPCOCODE          VARCHAR2(3),
    MAVEDMNDFLAG        VARCHAR2(1),
    MADIMPLDATE         DATE,
    MAVIMPLREMK         VARCHAR2(35),
    MADEDMNDDATE        DATE
);

-- FOIS Handling Agent Master Table
CREATE TABLE MEMGLBLHNDGAGNT (
    MAVHNDGAGNTCODE     VARCHAR2(4)     NOT NULL,
    MAVHNDGAGNTNAME     VARCHAR2(45)    NOT NULL,
    MAVHNDGAGNTADDRTEXT VARCHAR2(100),
    MAVHNDGAGNTCITYNAME VARCHAR2(30),
    MAVCENTBLNG         VARCHAR2(1),
    MAVPCOCODE          VARCHAR2(3),
    MAVEDMNDFLAG        VARCHAR2(1),
    MADIMPLDATE         DATE,
    MAVIMPLREMK         VARCHAR2(35),
    MADEDMNDDATE        DATE
);

-- FOIS Wagon Ownership Table
CREATE TABLE MEMWGONOWNRSHIP (
    MAVWGONOWNRSHIPCODE VARCHAR2(4)     NOT NULL,
    MAVWGONOWNRSHIPDESC VARCHAR2(100),
    MACPRVTPRTYCODE     VARCHAR2(100),
    MACOWNRVLDTYFLAG    CHAR(1),
    MADDATELASTUPDT     DATE,
    MAVRMRK             VARCHAR2(50)
);

-- FOIS Wagon Owner Party Table
CREATE TABLE MEMWGONOWNRPRTY (
    MAVWGONOWNRPRTYCODE VARCHAR2(5)     NOT NULL,
    MAVWGONOWNRPRTYDESC VARCHAR2(50)
);

-- ---------------------------------------------------------------------------
-- NEW CUSTOMER REGISTRATION TABLES
-- Designed for test environment; migration-friendly for FOIS deployment
-- ---------------------------------------------------------------------------

-- Customer Master Table
-- Links to FOIS Global Customer and Handling Agent tables via FKs
CREATE TABLE MEMCUSTOMER (
    MAVCUSTOMERCODE     VARCHAR2(10)    NOT NULL,
    MAVCUSTOMERNAME     VARCHAR2(100)   NOT NULL,
    MAVADDRESS          VARCHAR2(255),
    MAVCITY             VARCHAR2(50),
    MAVPINCODE          VARCHAR2(10),
    MAVPCOCODE          VARCHAR2(3),
    MAVPAN              VARCHAR2(10),
    MAVEMAIL            VARCHAR2(100),
    MAVMOBILE           VARCHAR2(15),
    MAVGLBLCUSTCODE     VARCHAR2(4),
    MAVHNDGAGNTCODE     VARCHAR2(4),
    MACACTIVEFLAG       CHAR(1)         DEFAULT 'Y',
    MADCREATEDDATE      DATE            DEFAULT SYSDATE,
    MADUPDATEDDATE      DATE            DEFAULT SYSDATE
);

-- Customer GSTIN Table
-- One customer can have multiple GSTINs (one per Indian state)
CREATE TABLE MEMCUSTOMERGSTIN (
    GSTINID             NUMBER          NOT NULL,
    MAVCUSTOMERCODE     VARCHAR2(10)    NOT NULL,
    MAVSTATE            VARCHAR2(50)    NOT NULL,
    MAVSTATECODE        VARCHAR2(2),
    MAVGSTINNUMBER      VARCHAR2(15)    NOT NULL,
    MAVGSTINFILE        BLOB,
    MAVGSTINFILENAME    VARCHAR2(255),
    MAVGSTINFILETYPE    VARCHAR2(50),
    MACACTIVEFLAG       CHAR(1)         DEFAULT 'Y',
    MADCREATEDDATE      DATE            DEFAULT SYSDATE,
    MADUPDATEDDATE      DATE            DEFAULT SYSDATE
);

-- Sequence for GSTIN ID auto-generation
CREATE SEQUENCE SEQ_MEMCUSTOMERGSTIN_GSTINID
    START WITH 1
    INCREMENT BY 1
    NOCACHE
    NOCYCLE;
