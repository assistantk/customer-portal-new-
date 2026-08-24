-- ============================================================================
-- 06_create_users_table.sql
-- Customer Registration Application — User Authentication Table
-- Execution Order: 6 (after 05_add_gstin_file_path.sql)
-- ============================================================================
-- Creates the MEMUSERS table for portal login/signup.
-- Passwords are stored as bcrypt hashes — NEVER as plaintext.
-- ============================================================================

CREATE TABLE MEMUSERS (
    MAVUSERID           NUMBER GENERATED ALWAYS AS IDENTITY,
    MAVEMAIL            VARCHAR2(255)   NOT NULL,
    MAVUSERNAME         VARCHAR2(100)   NOT NULL,
    MAVPASSWORDHASH     VARCHAR2(255)   NOT NULL,
    MACACTIVEFLAG       CHAR(1)         DEFAULT 'Y',
    MADCREATEDDATE      DATE            DEFAULT SYSDATE,

    CONSTRAINT PK_MEMUSERS         PRIMARY KEY (MAVUSERID),
    CONSTRAINT UQ_MEMUSERS_EMAIL   UNIQUE (MAVEMAIL),
    CONSTRAINT UQ_MEMUSERS_UNAME   UNIQUE (MAVUSERNAME)
);

-- Index for login lookups by username
CREATE INDEX IDX_MEMUSERS_USERNAME ON MEMUSERS (MAVUSERNAME);

-- Index for duplicate-email checks
CREATE INDEX IDX_MEMUSERS_EMAIL    ON MEMUSERS (MAVEMAIL);
