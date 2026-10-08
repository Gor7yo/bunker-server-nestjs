import { PrismaService } from '../../prisma/prisma.service';
import { DeckService } from '../deck/deck.service';
import { Socket } from 'socket.io';
export declare class RoomService {
    private prisma;
    private deck;
    constructor(prisma: PrismaService, deck: DeckService);
    private readonly logger;
    create(hostName: string, socketId: string): Promise<{
        players: {
            id: string;
            createdAt: Date;
            socketId: string | null;
            name: string;
            isHost: boolean;
            isReady: boolean;
            isAlive: boolean;
            isOnline: boolean;
            characters: import("@prisma/client/runtime/library").JsonValue | null;
            roomCode: string;
        }[];
    } & {
        id: string;
        code: string;
        gameState: string;
        createdAt: Date;
    }>;
    find(code: string): Promise<{
        code: string;
        gameState: string;
        players: {
            id: string;
            socketId: string | null;
            name: string;
            isHost: boolean;
            isReady: boolean;
            isAlive: boolean;
            isOnline: boolean;
            characters: import("@prisma/client/runtime/library").JsonValue;
        }[];
    }>;
    gameStart(roomCode: string): Promise<{
        players: {
            socketId: string | null;
            character: import("@prisma/client/runtime/library").JsonValue;
            name: string;
            isAlive: boolean;
        }[];
    }>;
    join(data: {
        roomCode: string;
        playerName: string;
    }, clientId: string): Promise<{
        code: string;
        gameState: string;
        players: {
            id: string;
            socketId: string | null;
            name: string;
            isHost: boolean;
            isReady: boolean;
            isAlive: boolean;
            isOnline: boolean;
            characters: import("@prisma/client/runtime/library").JsonValue;
        }[];
    }>;
    kick(data: {
        roomCode: string;
        playerName: string;
    }): Promise<{
        kickedPlayer: {
            id: string;
            createdAt: Date;
            socketId: string | null;
            name: string;
            isHost: boolean;
            isReady: boolean;
            isAlive: boolean;
            isOnline: boolean;
            characters: import("@prisma/client/runtime/library").JsonValue | null;
            roomCode: string;
        };
        room: {
            code: string;
            gameState: string;
            players: {
                id: string;
                socketId: string | null;
                name: string;
                isHost: boolean;
                isReady: boolean;
                isAlive: boolean;
                isOnline: boolean;
                characters: import("@prisma/client/runtime/library").JsonValue;
            }[];
        };
    }>;
    leave(playerName: string, roomCode: string): Promise<{
        room: {
            code: string;
            gameState: string;
            players: {
                id: string;
                socketId: string | null;
                name: string;
                isHost: boolean;
                isReady: boolean;
                isAlive: boolean;
                isOnline: boolean;
                characters: import("@prisma/client/runtime/library").JsonValue;
            }[];
        };
        playerName: string;
    } | undefined>;
    setOffline(playerName: string, roomCode: string, clientId: string): Promise<({
        room: {
            players: {
                id: string;
                createdAt: Date;
                socketId: string | null;
                name: string;
                isHost: boolean;
                isReady: boolean;
                isAlive: boolean;
                isOnline: boolean;
                characters: import("@prisma/client/runtime/library").JsonValue | null;
                roomCode: string;
            }[];
        } & {
            id: string;
            code: string;
            gameState: string;
            createdAt: Date;
        };
    } & {
        id: string;
        createdAt: Date;
        socketId: string | null;
        name: string;
        isHost: boolean;
        isReady: boolean;
        isAlive: boolean;
        isOnline: boolean;
        characters: import("@prisma/client/runtime/library").JsonValue | null;
        roomCode: string;
    }) | null>;
    removePlayer(playerId: string): Promise<void>;
    reconnect(data: {
        roomCode: string;
        playerName: string;
    }, client: Socket): Promise<{
        code: string;
        gameState: string;
        players: {
            id: string;
            socketId: string | null;
            name: string;
            isHost: boolean;
            isReady: boolean;
            isAlive: boolean;
            isOnline: boolean;
            characters: import("@prisma/client/runtime/library").JsonValue;
        }[];
    }>;
    getPlayerCard(roomCode: string, playerName: string): Promise<string | number | true | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray>;
    toggleReady(data: {
        playerName: string;
        roomCode: string;
    }, client: Socket): Promise<{
        players: {
            name: string;
            isHost: boolean;
            isReady: boolean;
            characters: import("@prisma/client/runtime/library").JsonValue;
            isAlive: boolean;
            isOnline: boolean;
        }[];
        allReady: boolean;
    }>;
    updateSocketId(oldId: string, newId: string): Promise<void>;
    findPlayer(client: any): Promise<{
        id: string;
        createdAt: Date;
        socketId: string | null;
        name: string;
        isHost: boolean;
        isReady: boolean;
        isAlive: boolean;
        isOnline: boolean;
        characters: import("@prisma/client/runtime/library").JsonValue | null;
        roomCode: string;
    } | null>;
    findPlayerName(name: string, roomCode: string): Promise<{
        id: string;
        createdAt: Date;
        socketId: string | null;
        name: string;
        isHost: boolean;
        isReady: boolean;
        isAlive: boolean;
        isOnline: boolean;
        characters: import("@prisma/client/runtime/library").JsonValue | null;
        roomCode: string;
    } | null>;
    findPlayerNameOrThrow(name: string, roomCode: string): Promise<{
        id: string;
        createdAt: Date;
        socketId: string | null;
        name: string;
        isHost: boolean;
        isReady: boolean;
        isAlive: boolean;
        isOnline: boolean;
        characters: import("@prisma/client/runtime/library").JsonValue | null;
        roomCode: string;
    }>;
    dealCards(roomCode: string): Promise<{
        code: string;
        gameState: string;
        players: {
            id: string;
            socketId: string | null;
            name: string;
            isHost: boolean;
            isReady: boolean;
            isAlive: boolean;
            isOnline: boolean;
            characters: import("@prisma/client/runtime/library").JsonValue;
        }[];
    }>;
    private generateCode;
    getGameState(roomCode: string): Promise<{
        gameState: string;
        playersCount: number;
        onlineCount: number;
        readyCount: number;
        canStart: boolean;
    }>;
    private createUsedSet;
    private generateUniqueCard;
    private isUnique;
    private addToUsed;
}
