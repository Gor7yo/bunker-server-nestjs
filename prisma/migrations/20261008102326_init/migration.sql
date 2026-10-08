-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('LOBBY', 'PLAYING', 'FINISHED');

-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('PLAYER', 'MODERATOR');

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RoomStatus" NOT NULL DEFAULT 'LOBBY',
    "settings" JSONB NOT NULL,
    "game" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "isHost" BOOLEAN NOT NULL DEFAULT false,
    "role" "PlayerRole" NOT NULL DEFAULT 'PLAYER',
    "isReady" BOOLEAN NOT NULL DEFAULT false,
    "isAlive" BOOLEAN NOT NULL DEFAULT true,
    "hasLeft" BOOLEAN NOT NULL DEFAULT false,
    "card" JSONB,
    "revealed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rooms_code_key" ON "rooms"("code");

-- CreateIndex
CREATE UNIQUE INDEX "players_token_key" ON "players"("token");

-- CreateIndex
CREATE INDEX "players_roomId_idx" ON "players"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "players_roomId_name_key" ON "players"("roomId", "name");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
