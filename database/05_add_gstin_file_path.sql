-- Add Supabase Storage object path metadata for GSTIN PDF documents.
-- Run after 01_create_tables.sql for existing databases.

ALTER TABLE MEMCUSTOMERGSTIN ADD (
    MAVGSTINFILEPATH VARCHAR2(500)
);
