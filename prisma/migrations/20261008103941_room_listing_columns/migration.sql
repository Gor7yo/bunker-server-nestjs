-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('AUTO', 'MODERATED');

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxPlayers" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "mode" "GameMode" NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "title" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "rooms_status_isPublic_mode_idx" ON "rooms"("status", "isPublic", "mode");

-- Backfill the new columns from the JSON settings of existing rooms
UPDATE "rooms" SET
  "title" = COALESCE("settings"->>'title', ''),
  "isPublic" = COALESCE(("settings"->>'isPublic')::boolean, true),
  "mode" = COALESCE(("settings"->>'mode')::"GameMode", 'AUTO'),
  "maxPlayers" = COALESCE(("settings"->>'maxPlayers')::integer, 12);
