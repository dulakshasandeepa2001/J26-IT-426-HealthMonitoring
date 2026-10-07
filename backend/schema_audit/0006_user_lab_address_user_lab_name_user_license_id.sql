-- REVIEW ONLY: this generated SQL was NOT executed.
BEGIN;
--
-- Add field lab_address to user
--
ALTER TABLE "accounts_user" ADD COLUMN "lab_address" varchar(255) NULL;
--
-- Add field lab_name to user
--
ALTER TABLE "accounts_user" ADD COLUMN "lab_name" varchar(150) NULL;
--
-- Add field license_id to user
--
ALTER TABLE "accounts_user" ADD COLUMN "license_id" varchar(50) NULL;
COMMIT;
