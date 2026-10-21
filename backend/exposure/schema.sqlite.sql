BEGIN;
--
-- Create model DiagnosisMetadata
--
CREATE TABLE "exposure_diagnosismetadata" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "diagnosis_status" varchar(12) NOT NULL, "symptom_started_at" datetime NULL, "diagnosed_at" datetime NULL, "doctor_approved" bool NOT NULL, "approved_at" datetime NULL, "updated_at" datetime NOT NULL, "approved_by_id" bigint NULL REFERENCES "accounts_user" ("id") DEFERRABLE INITIALLY DEFERRED, "diagnosis_id" bigint NOT NULL UNIQUE REFERENCES "prescription_context_diagnosisconfirmation" ("id") DEFERRABLE INITIALLY DEFERRED);
--
-- Create model ProximityEncounter
--
CREATE TABLE "exposure_proximityencounter" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "started_at" datetime NOT NULL, "ended_at" datetime NOT NULL, "estimated_duration_seconds" real NOT NULL, "estimated_distance_m" real NOT NULL, "detection_source" varchar(10) NOT NULL, "quality_flags" text NOT NULL CHECK ((JSON_VALID("quality_flags") OR "quality_flags" IS NULL)), "created_at" datetime NOT NULL, "updated_at" datetime NOT NULL, "data_mode" varchar(20) NOT NULL, "deduplication_key" varchar(64) NOT NULL UNIQUE, "user_a_id" bigint NOT NULL REFERENCES "accounts_user" ("id") DEFERRABLE INITIALLY DEFERRED, "user_b_id" bigint NOT NULL REFERENCES "accounts_user" ("id") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "exposure_ordered_pair" CHECK ("user_a_id" < ("user_b_id")), CONSTRAINT "exposure_valid_encounter" CHECK (("ended_at" >= ("started_at") AND "estimated_distance_m" >= 0.0 AND "estimated_duration_seconds" >= 0.0)));
--
-- Create model RiskZoneVersion
--
CREATE TABLE "exposure_riskzoneversion" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "zone_id" char(32) NOT NULL, "version" integer unsigned NOT NULL CHECK ("version" >= 0), "disease_code" varchar(30) NOT NULL, "latitude" real NOT NULL, "longitude" real NOT NULL, "radius_m" real NOT NULL, "risk_level" varchar(30) NOT NULL, "valid_from" datetime NOT NULL, "valid_to" datetime NULL, "identified_at" datetime NOT NULL, "source" varchar(200) NOT NULL, "review_status" varchar(10) NOT NULL, "created_at" datetime NOT NULL, "data_mode" varchar(20) NOT NULL, CONSTRAINT "exposure_unique_zone_version" UNIQUE ("zone_id", "version"), CONSTRAINT "exposure_valid_zone_time" CHECK (("valid_to" IS NULL OR "valid_to" >= ("valid_from"))), CONSTRAINT "exposure_valid_zone_geometry" CHECK (("latitude" >= -90.0 AND "latitude" <= 90.0 AND "longitude" >= -180.0 AND "longitude" <= 180.0 AND "radius_m" >= 0.0 AND "version" >= 1)));
--
-- Create model RiskZoneVisit
--
CREATE TABLE "exposure_riskzonevisit" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "entered_at" datetime NOT NULL, "exited_at" datetime NOT NULL, "estimated_duration_seconds" real NOT NULL, "detected_at" datetime NOT NULL, "quality_flags" text NOT NULL CHECK ((JSON_VALID("quality_flags") OR "quality_flags" IS NULL)), "data_mode" varchar(20) NOT NULL, "deduplication_key" varchar(64) NOT NULL UNIQUE, "user_id" bigint NOT NULL REFERENCES "accounts_user" ("id") DEFERRABLE INITIALLY DEFERRED, "zone_version_id" bigint NOT NULL REFERENCES "exposure_riskzoneversion" ("id") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "exposure_valid_visit" CHECK (("estimated_duration_seconds" >= 0.0 AND "exited_at" >= ("entered_at"))));
--
-- Create model ExposureAnalysis
--
CREATE TABLE "exposure_exposureanalysis" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "disease_code" varchar(30) NOT NULL, "analysed_at" datetime NOT NULL, "model_version" varchar(100) NOT NULL, "feature_schema_version" varchar(100) NOT NULL, "model_score" real NULL, "exposure_summary" text NOT NULL CHECK ((JSON_VALID("exposure_summary") OR "exposure_summary" IS NULL)), "data_mode" varchar(20) NOT NULL, "user_id" bigint NOT NULL REFERENCES "accounts_user" ("id") DEFERRABLE INITIALLY DEFERRED, "encounter_id" bigint NULL REFERENCES "exposure_proximityencounter" ("id") DEFERRABLE INITIALLY DEFERRED, "zone_visit_id" bigint NULL REFERENCES "exposure_riskzonevisit" ("id") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "exposure_unique_summary" UNIQUE ("user_id", "disease_code", "data_mode"));
--
-- Create model TrackingConsent
--
CREATE TABLE "exposure_trackingconsent" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "granted" bool NOT NULL, "updated_at" datetime NOT NULL, "user_id" bigint NOT NULL UNIQUE REFERENCES "accounts_user" ("id") DEFERRABLE INITIALLY DEFERRED);
--
-- Create model LocationSample
--
CREATE TABLE "exposure_locationsample" ("id" integer NOT NULL PRIMARY KEY AUTOINCREMENT, "client_record_id" char(32) NOT NULL, "latitude" real NOT NULL, "longitude" real NOT NULL, "recorded_at" datetime NOT NULL, "accuracy_m" real NOT NULL, "received_at" datetime NOT NULL, "data_mode" varchar(20) NOT NULL, "user_id" bigint NOT NULL REFERENCES "accounts_user" ("id") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "exposure_unique_sample" UNIQUE ("user_id", "client_record_id"), CONSTRAINT "exposure_valid_location" CHECK (("accuracy_m" >= 0.0 AND "latitude" >= -90.0 AND "latitude" <= 90.0 AND "longitude" >= -180.0 AND "longitude" <= 180.0)));
CREATE INDEX "exposure_diagnosismetadata_approved_by_id_a4bff580" ON "exposure_diagnosismetadata" ("approved_by_id");
CREATE INDEX "exposure_proximityencounter_ended_at_5fc72159" ON "exposure_proximityencounter" ("ended_at");
CREATE INDEX "exposure_proximityencounter_user_a_id_cbbd7de0" ON "exposure_proximityencounter" ("user_a_id");
CREATE INDEX "exposure_proximityencounter_user_b_id_59c7f951" ON "exposure_proximityencounter" ("user_b_id");
CREATE INDEX "exposure_riskzonevisit_user_id_0c6b07c1" ON "exposure_riskzonevisit" ("user_id");
CREATE INDEX "exposure_riskzonevisit_zone_version_id_e4660703" ON "exposure_riskzonevisit" ("zone_version_id");
CREATE INDEX "exposure_exposureanalysis_user_id_ae776510" ON "exposure_exposureanalysis" ("user_id");
CREATE INDEX "exposure_exposureanalysis_encounter_id_6219ff1f" ON "exposure_exposureanalysis" ("encounter_id");
CREATE INDEX "exposure_exposureanalysis_zone_visit_id_3ec385f5" ON "exposure_exposureanalysis" ("zone_visit_id");
CREATE INDEX "exposure_locationsample_recorded_at_450abcd0" ON "exposure_locationsample" ("recorded_at");
CREATE INDEX "exposure_locationsample_user_id_69f9cc29" ON "exposure_locationsample" ("user_id");
CREATE INDEX "exposure_lo_user_id_945aea_idx" ON "exposure_locationsample" ("user_id", "recorded_at");
COMMIT;
