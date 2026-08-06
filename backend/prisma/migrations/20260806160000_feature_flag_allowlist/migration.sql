-- Pilot allowlist: subjects a flag is ON for regardless of `enabled`.
-- Huudis user ids and/or email addresses (staging mints different ids
-- for the same person, so both are matched).
ALTER TABLE "feature_flags" ADD COLUMN "allowlist" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
