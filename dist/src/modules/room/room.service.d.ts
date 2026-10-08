import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from './presence.service';
import { PublicRoomSummary } from './room.types';
import { RoomFilters } from './room.filters';
import { RoomWithPlayers } from './room.view';
export declare const normalizeName: (raw: unknown) => string;
export declare const normalizeCode: (raw: unknown) => string;
export declare class RoomService {
    private readonly prisma;
    private readonly presence;
    constructor(prisma: PrismaService, presence: PresenceService);
    findByCode(code: string): Promise<RoomWithPlayers>;
    findByToken(token: unknown): Promise<{
        room: {
            id: string;
            code: string;
            status: import("@prisma/client").$Enums.RoomStatus;
            title: string;
            isPublic: boolean;
            mode: import("@prisma/client").$Enums.GameMode;
            maxPlayers: number;
            settings: Prisma.JsonValue;
            game: Prisma.JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
        };
    } & {
        name: string;
        id: string;
        token: string;
        roomId: string;
        isHost: boolean;
        role: import("@prisma/client").$Enums.PlayerRole;
        isReady: boolean;
        isAlive: boolean;
        hasLeft: boolean;
        card: Prisma.JsonValue | null;
        revealed: string[];
        joinedAt: Date;
    }>;
    listPublic(filters: RoomFilters): Promise<{
        rooms: PublicRoomSummary[];
        total: number;
    }>;
    deleteAbandoned(): Promise<number>;
    create(rawName: unknown, settingsPatch: unknown): Promise<{
        room: {
            players: {
                name: string;
                id: string;
                token: string;
                roomId: string;
                isHost: boolean;
                role: import("@prisma/client").$Enums.PlayerRole;
                isReady: boolean;
                isAlive: boolean;
                hasLeft: boolean;
                card: Prisma.JsonValue | null;
                revealed: string[];
                joinedAt: Date;
            }[];
        } & {
            id: string;
            code: string;
            status: import("@prisma/client").$Enums.RoomStatus;
            title: string;
            isPublic: boolean;
            mode: import("@prisma/client").$Enums.GameMode;
            maxPlayers: number;
            settings: Prisma.JsonValue;
            game: Prisma.JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
        };
        player: {
            name: string;
            id: string;
            token: string;
            roomId: string;
            isHost: boolean;
            role: import("@prisma/client").$Enums.PlayerRole;
            isReady: boolean;
            isAlive: boolean;
            hasLeft: boolean;
            card: Prisma.JsonValue | null;
            revealed: string[];
            joinedAt: Date;
        };
    }>;
    join(code: string, rawName: unknown): Promise<{
        room: RoomWithPlayers;
        player: {
            name: string;
            id: string;
            token: string;
            roomId: string;
            isHost: boolean;
            role: import("@prisma/client").$Enums.PlayerRole;
            isReady: boolean;
            isAlive: boolean;
            hasLeft: boolean;
            card: Prisma.JsonValue | null;
            revealed: string[];
            joinedAt: Date;
        };
    }>;
    leave(playerId: string, code: string): Promise<{
        deleted: boolean;
        duringGame: boolean;
    }>;
    setReady(playerId: string, code: string, ready: unknown): Promise<void>;
    updateSettings(playerId: string, code: string, patch: unknown): Promise<void>;
    setModerator(playerId: string, code: string, targetId: unknown): Promise<void>;
    transferHost(playerId: string, code: string, targetId: unknown): Promise<void>;
    kick(playerId: string, code: string, targetId: unknown): Promise<{
        name: string;
        id: string;
        token: string;
        roomId: string;
        isHost: boolean;
        role: import("@prisma/client").$Enums.PlayerRole;
        isReady: boolean;
        isAlive: boolean;
        hasLeft: boolean;
        card: Prisma.JsonValue | null;
        revealed: string[];
        joinedAt: Date;
    }>;
    assertCanStart(playerId: string, code: string): Promise<{
        room: RoomWithPlayers;
        players: {
            name: string;
            id: string;
            token: string;
            roomId: string;
            isHost: boolean;
            role: import("@prisma/client").$Enums.PlayerRole;
            isReady: boolean;
            isAlive: boolean;
            hasLeft: boolean;
            card: Prisma.JsonValue | null;
            revealed: string[];
            joinedAt: Date;
        }[];
    }>;
    private lobbyOf;
    private memberOf;
    private hostOf;
    private generateCode;
}
