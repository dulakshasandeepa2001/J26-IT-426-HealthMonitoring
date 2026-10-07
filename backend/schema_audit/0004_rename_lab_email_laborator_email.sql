-- REVIEW ONLY: this generated SQL was NOT executed.
BEGIN;
--
-- Rename field lab_email on laborator to email
--
ALTER TABLE "laborator" RENAME COLUMN "lab_email" TO "email";
COMMIT;
