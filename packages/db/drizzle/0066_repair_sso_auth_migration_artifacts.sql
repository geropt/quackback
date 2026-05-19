-- Repair DDL from 0056_admin_auth_settings for databases that drifted (e.g. manual
-- column fixes, skipped/partial forks) so journal is past 0056 but these objects never
-- existed. Uses IF NOT EXISTS / IF NOT EXISTS so healthy tenants are unaffected.

ALTER TABLE "principal" ADD COLUMN IF NOT EXISTS "last_sso_sign_in_at" timestamp with time zone;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "two_factor_enabled" boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "sso_verified_domain" (
  "id" uuid PRIMARY KEY,
  "name" text NOT NULL,
  "verification_token" text NOT NULL,
  "verified_at" timestamptz,
  "enforced" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "sso_verified_domain_name_unique" ON "sso_verified_domain" ("name");

CREATE TABLE IF NOT EXISTS "two_factor" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "secret" text NOT NULL,
  "backup_codes" text NOT NULL,
  "verified" boolean NOT NULL DEFAULT true,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "two_factor_user_id_idx" ON "two_factor" ("user_id");
