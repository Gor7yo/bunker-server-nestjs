"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var RoomService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const deck_service_1 = require("../deck/deck.service");
const crypto_1 = require("crypto");
let RoomService = RoomService_1 = class RoomService {
    prisma;
    deck;
    constructor(prisma, deck) {
        this.prisma = prisma;
        this.deck = deck;
    }
    logger = new common_1.Logger(RoomService_1.name);
    async create(hostName, socketId) {
        const code = await this.generateCode();
        const room = await this.prisma.room.create({
            data: {
                code,
                players: {
                    create: {
                        name: hostName,
                        socketId,
                        isHost: true,
                    },
                },
            },
            include: {
                players: true,
            },
        });
        return room;
    }
    async find(code) {
        const room = await this.prisma.room.findUnique({
            where: { code },
            select: {
                code: true,
                gameState: true,
                players: {
                    orderBy: { createdAt: 'asc' },
                    select: {
                        id: true,
                        characters: true,
                        name: true,
                        isHost: true,
                        isReady: true,
                        isOnline: true,
                        isAlive: true,
                        socketId: true,
                    },
                },
            },
        });
        if (!room)
            throw new common_1.NotFoundException('Room not found');
        return room;
    }
    async gameStart(roomCode) {
        const room = await this.find(roomCode);
        if (room.players.length < 2) {
            throw new common_1.BadRequestException('Need 2 or more players');
        }
        const allReady = room.players.every((p) => p.isReady);
        if (!allReady) {
            throw new common_1.BadRequestException('All is doesnt ready');
        }
        const updatedRoom = await this.dealCards(roomCode);
        return {
            players: updatedRoom.players.map((player) => ({
                socketId: player.socketId,
                character: player.characters,
                name: player.name,
                isAlive: player.isAlive,
            })),
        };
    }
    async join(data, clientId) {
        const room = await this.find(data.roomCode);
        if (room.gameState !== 'WAITING') {
            throw new common_1.BadRequestException('Game already started');
        }
        if (room.players.length >= 12) {
            throw new common_1.BadRequestException('Room is full');
        }
        const exists = await this.prisma.player.findFirst({
            where: {
                name: data.playerName,
                roomCode: data.roomCode,
            },
        });
        if (exists && exists.isOnline) {
            throw new common_1.BadRequestException('Player already in room');
        }
        await this.prisma.player.create({
            data: {
                name: data.playerName,
                socketId: clientId,
                roomCode: data.roomCode,
                isOnline: true,
            },
        });
        return this.find(room.code);
    }
    async kick(data) {
        const player = await this.findPlayerNameOrThrow(data.playerName, data.roomCode);
        const kickedPlayer = await this.prisma.player.delete({
            where: { id: player.id },
        });
        const room = await this.find(data.roomCode);
        return { kickedPlayer, room };
    }
    async leave(playerName, roomCode) {
        const player = await this.findPlayerNameOrThrow(playerName, roomCode);
        if (player.isHost) {
            const newHost = await this.prisma.player.findFirst({
                where: {
                    roomCode,
                    id: { not: player.id },
                    isOnline: true,
                },
                orderBy: {
                    createdAt: 'asc',
                },
            });
            if (newHost) {
                await this.prisma.player.update({
                    where: { id: newHost.id },
                    data: { isHost: true },
                });
            }
        }
        await this.prisma.player.update({
            where: { id: player.id },
            data: {
                isOnline: false,
            },
        });
        const updatedRoom = await this.find(roomCode);
        if (updatedRoom.players.every((p) => p.isOnline === false)) {
            await this.prisma.player.deleteMany({
                where: { roomCode: updatedRoom.code },
            });
            await this.prisma.room.delete({
                where: { code: updatedRoom.code },
            });
            await this.prisma.player.deleteMany({
                where: { roomCode: updatedRoom.code },
            });
            return;
        }
        return {
            room: updatedRoom,
            playerName: player.name,
        };
    }
    async setOffline(playerName, roomCode, clientId) {
        const player = await this.findPlayerNameOrThrow(playerName, roomCode);
        if (player.socketId !== clientId) {
            return null;
        }
        return this.prisma.player.update({
            where: {
                id: player.id,
            },
            data: {
                isOnline: false,
            },
            include: {
                room: {
                    include: {
                        players: true,
                    },
                },
            },
        });
    }
    async removePlayer(playerId) {
        const player = await this.prisma.player.findUnique({
            where: { id: playerId },
        });
        if (!player)
            throw new common_1.NotFoundException('Игрок не найден');
        if (player.isHost) {
            const newHost = await this.prisma.player.findFirst({
                where: {
                    roomCode: player.roomCode,
                    id: { not: playerId },
                    isOnline: true,
                },
            });
            if (newHost) {
                await this.prisma.player.update({
                    where: { id: newHost.id },
                    data: { isHost: true },
                });
            }
        }
        await this.prisma.player.delete({
            where: { id: playerId },
        });
    }
    async reconnect(data, client) {
        const player = await this.findPlayerNameOrThrow(data.playerName, data.roomCode);
        await this.prisma.player.update({
            where: {
                id: player.id,
            },
            data: {
                socketId: client.id,
                isOnline: true,
            },
        });
        return this.find(data.roomCode);
    }
    async getPlayerCard(roomCode, playerName) {
        const room = await this.find(roomCode);
        const player = room.players.find((p) => p.name === playerName);
        if (!player) {
            throw new common_1.NotFoundException('Игрок не найден');
        }
        if (!player.characters) {
            throw new common_1.BadRequestException('Карта еще не выдана');
        }
        return player.characters;
    }
    async toggleReady(data, client) {
        const player = await this.findPlayerNameOrThrow(data.playerName, data.roomCode);
        if (player.socketId !== client.id) {
            await this.prisma.player.update({
                where: { id: player.id },
                data: { socketId: client.id, isReady: !player.isReady },
            });
        }
        else {
            await this.prisma.player.update({
                where: { id: player.id },
                data: { isReady: !player.isReady },
            });
        }
        const players = (await this.find(data.roomCode)).players
            .map(({ name, isHost, characters, isAlive, isOnline, isReady }) => ({
            name,
            isHost,
            isReady,
            characters,
            isAlive,
            isOnline,
        }))
            .sort((a, b) => a.name.length - b.name.length);
        const allReady = players.every((p) => p.isReady);
        console.log('Players: ' + JSON.stringify(players));
        return { players, allReady };
    }
    async updateSocketId(oldId, newId) {
        await this.prisma.player.update({
            where: { socketId: oldId },
            data: { socketId: newId },
        });
    }
    async findPlayer(client) {
        return this.prisma.player.findFirst({
            where: { socketId: client.id },
        });
    }
    async findPlayerName(name, roomCode) {
        return await this.prisma.player.findFirst({
            where: {
                name,
                roomCode,
            },
        });
    }
    async findPlayerNameOrThrow(name, roomCode) {
        const player = await this.prisma.player.findFirst({
            where: {
                name,
                roomCode,
            },
        });
        if (!player) {
            throw new common_1.NotFoundException('Player not found');
        }
        return player;
    }
    async dealCards(roomCode) {
        const room = await this.find(roomCode);
        const used = this.createUsedSet();
        const playerIds = room.players.map((player) => player.id);
        await this.prisma.$transaction(playerIds.map((playerId) => {
            const card = this.generateUniqueCard(used);
            return this.prisma.player.update({
                where: {
                    id: playerId,
                },
                data: {
                    characters: card,
                },
            });
        }));
        await this.prisma.room.update({
            where: {
                code: roomCode,
            },
            data: {
                gameState: 'GAME_RUNNING',
            },
        });
        return await this.find(roomCode);
    }
    async generateCode() {
        while (true) {
            const code = (0, crypto_1.randomBytes)(3).toString('hex').toUpperCase();
            const exists = await this.prisma.room.findUnique({
                where: {
                    code,
                },
            });
            if (!exists)
                return code;
        }
    }
    async getGameState(roomCode) {
        const room = await this.find(roomCode);
        return {
            gameState: room.gameState,
            playersCount: room.players.length,
            onlineCount: room.players.filter((p) => p.isOnline).length,
            readyCount: room.players.filter((p) => p.isReady).length,
            canStart: room.players.length >= 2 && room.players.every((p) => p.isReady),
        };
    }
    createUsedSet() {
        return {
            age: new Set(),
            profession: new Set(),
            health: new Set(),
            fobia: new Set(),
            hobbie: new Set(),
            bandage: new Set(),
            action: new Set(),
            fact: new Set(),
        };
    }
    generateUniqueCard(used) {
        for (let i = 0; i < 100; i++) {
            const card = this.deck.generatePlayerCard();
            if (this.isUnique(used, card)) {
                this.addToUsed(used, card);
                return card;
            }
        }
        throw new Error('Не удалось сгенерировать уникальную карту');
    }
    isUnique(used, card) {
        const fields = [
            'age',
            'profession',
            'health',
            'fobia',
            'hobbie',
            'bandage',
            'action',
            'fact',
        ];
        return fields.every((f) => !used[f].has(card[f]));
    }
    addToUsed(used, card) {
        const fields = [
            'age',
            'profession',
            'health',
            'fobia',
            'hobbie',
            'bandage',
            'action',
            'fact',
        ];
        fields.forEach((f) => used[f].add(card[f]));
    }
};
exports.RoomService = RoomService;
exports.RoomService = RoomService = RoomService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        deck_service_1.DeckService])
], RoomService);
//# sourceMappingURL=room.service.js.map