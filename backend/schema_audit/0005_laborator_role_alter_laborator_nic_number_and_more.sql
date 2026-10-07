-- REVIEW ONLY: this generated SQL was NOT executed.
BEGIN;
--
-- Add field role to laborator
--
ALTER TABLE "laborator" ADD COLUMN "role" varchar(20) DEFAULT 'lab' NULL;
ALTER TABLE "laborator" ALTER COLUMN "role" DROP DEFAULT;
--
-- Alter field NIC_number on laborator
--
ALTER TABLE "laborator" ALTER COLUMN "NIC_number" TYPE varchar(12), ALTER COLUMN "NIC_number" DROP NOT NULL;
ALTER TABLE "laborator" ADD CONSTRAINT "laborator_NIC_number_507fcef7_uniq" UNIQUE ("NIC_number");
CREATE INDEX "laborator_NIC_number_507fcef7_like" ON "laborator" ("NIC_number" varchar_pattern_ops);
--
-- Alter field birthday on laborator
--
ALTER TABLE "laborator" ALTER COLUMN "birthday" DROP NOT NULL;
--
-- Alter field email on laborator
--
ALTER TABLE "laborator" ALTER COLUMN "email" TYPE varchar(100);
--
-- Alter field password on laborator
--
ALTER TABLE "laborator" ALTER COLUMN "password" TYPE varchar(100);
--
-- Alter field phone on laborator
--
ALTER TABLE "laborator" ALTER COLUMN "phone" TYPE varchar(100);
--
-- Alter field username on laborator
--
ALTER TABLE "laborator" ALTER COLUMN "username" TYPE varchar(100);
COMMIT;
