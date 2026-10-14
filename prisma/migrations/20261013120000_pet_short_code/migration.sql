-- AlterTable
ALTER TABLE "Pet" ADD COLUMN "shortCode" TEXT;

-- Backfill existing pets with a random 8-char Crockford base32 code. The
-- reference to "Pet"."id" makes the subquery run once per row.
UPDATE "Pet"
SET "shortCode" = (
  SELECT string_agg(
    substr(
      '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
      (get_byte(uuid_send(gen_random_uuid()), 0) & 31) + 1,
      1
    ),
    ''
  )
  FROM generate_series(1, 8)
  WHERE "Pet"."id" IS NOT NULL
);

ALTER TABLE "Pet" ALTER COLUMN "shortCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Pet_shortCode_key" ON "Pet"("shortCode");

-- The QR target is now built from FRONTEND_URL + shortCode at read time.
DROP INDEX "Pet_qrCodeUrl_key";
ALTER TABLE "Pet" DROP COLUMN "qrCodeUrl";
