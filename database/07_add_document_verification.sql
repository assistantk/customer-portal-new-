-- Add document verification metadata to an existing MySQL installation.
USE customer_portal;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS pan_verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';

ALTER TABLE customer_gstins
  ADD COLUMN IF NOT EXISTS registered_address VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS gstin_verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS address_verification_status VARCHAR(20) NOT NULL DEFAULT 'PENDING';