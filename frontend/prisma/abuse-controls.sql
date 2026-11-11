BEGIN;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "normalizedEmail" TEXT;

UPDATE "user"
SET "normalizedEmail" = CASE
    WHEN lower(split_part(trim("email"), '@', 2)) IN ('gmail.com', 'googlemail.com')
        THEN regexp_replace(
            split_part(split_part(lower(trim("email")), '@', 1), '+', 1),
            '\.',
            '',
            'g'
        ) || '@gmail.com'
    ELSE lower(trim("email"))
END
WHERE "normalizedEmail" IS NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "user"
        GROUP BY "normalizedEmail"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Duplicate normalized email addresses exist. Resolve duplicate accounts before applying the abuse-controls schema.';
    END IF;
END
$$;

ALTER TABLE "user" ALTER COLUMN "normalizedEmail" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "user_normalizedEmail_key"
    ON "user"("normalizedEmail");

ALTER TABLE "Song"
    ADD COLUMN IF NOT EXISTS "quotaUserKey" TEXT,
    ADD COLUMN IF NOT EXISTS "quotaIpKey" TEXT,
    ADD COLUMN IF NOT EXISTS "quotaGlobalKey" TEXT,
    ADD COLUMN IF NOT EXISTS "quotaReleased" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "QuotaCounter" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuotaCounter_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "SignupAttempt" (
    "id" TEXT NOT NULL,
    "ipKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SignupAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SignupAttempt_ipKey_createdAt_idx"
    ON "SignupAttempt"("ipKey", "createdAt");

COMMIT;
