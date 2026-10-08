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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomService = exports.normalizeCode = exports.normalizeName = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const game_error_1 = require("../../common/game-error");
const prisma_service_1 = require("../../prisma/prisma.service");
const presence_service_1 = require("./presence.service");
const room_settings_1 = require("./room.settings");
const room_view_1 = require("./room.view");
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const NAME_MAX_LENGTH = 20;
const PUBLIC_LIST_SCAN_LIMIT = 300;
const ABANDONED_AFTER_MS = 30 * 60 * 1000;
const newToken = () => (0, crypto_1.randomBytes)(24).toString('base64url');
const activePlayers = (room) => room.players.filter((p) => p.role === 'PLAYER' && !p.hasLeft);
const normalizeName = (raw) => {
    const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
    if (!name)
        throw new game_error_1.GameError('Введите имя');
    if (name.length > NAME_MAX_LENGTH) {
        throw new game_error_1.GameError(`Имя длиннее ${NAME_MAX_LENGTH} символов`);
    }
    return name;
};
exports.normalizeName = normalizeName;
const normalizeCode = (raw) => {
    const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
    if (!code)
        throw new game_error_1.GameError('Введите код комнаты');
    return code;
};
exports.normalizeCode = normalizeCode;
let RoomService = class RoomService {
    prisma;
    presence;
    constructor(prisma, presence) {
        this.prisma = prisma;
        this.presence = presence;
    }
    async findByCode(code) {
        const room = await this.prisma.room.findUnique({
            where: { code },
            include: { players: true },
        });
        if (!room)
            throw new game_error_1.GameError('Комната не найдена');
        return room;
    }
    async findByToken(token) {
        if (typeof token !== 'string' || !token) {
            throw new game_error_1.GameError('Сессия не найдена');
        }
        const player = await this.prisma.player.findUnique({
            where: { token },
            include: { room: true },
        });
        if (!player || player.hasLeft)
            throw new game_error_1.GameError('Сессия не найдена');
        return player;
    }
    async listPublic(filters) {
        const search = filters.q
            ? { contains: filters.q, mode: 'insensitive' }
            : undefined;
        const rooms = await this.prisma.room.findMany({
            where: {
                status: 'LOBBY',
                isPublic: true,
                ...(filters.mode && { mode: filters.mode }),
                ...(search && {
                    OR: [
                        { title: search },
                        { players: { some: { isHost: true, name: search } } },
                    ],
                }),
            },
            include: { players: true },
            orderBy: { createdAt: 'desc' },
            take: PUBLIC_LIST_SCAN_LIMIT,
        });
        const summaries = rooms
            .filter((room) => room.players.some((p) => this.presence.isOnline(p.id)))
            .map((room) => ({
            code: room.code,
            title: room.title,
            mode: room.mode,
            hostName: room.players.find((p) => p.isHost)?.name ?? '',
            players: activePlayers(room).length,
            maxPlayers: room.maxPlayers,
        }))
            .filter((room) => !filters.freeSlots || room.players < room.maxPlayers);
        if (filters.sort === 'popular') {
            summaries.sort((a, b) => b.players - a.players);
        }
        return {
            total: summaries.length,
            rooms: summaries.slice(0, filters.limit),
        };
    }
    async deleteAbandoned() {
        const stale = await this.prisma.room.findMany({
            where: { updatedAt: { lt: new Date(Date.now() - ABANDONED_AFTER_MS) } },
            select: { id: true, players: { select: { id: true } } },
        });
        const ids = stale
            .filter((room) => !room.players.some((p) => this.presence.isOnline(p.id)))
            .map((room) => room.id);
        if (ids.length > 0) {
            await this.prisma.room.deleteMany({ where: { id: { in: ids } } });
        }
        return ids.length;
    }
    async create(rawName, settingsPatch) {
        const name = (0, exports.normalizeName)(rawName);
        const settings = (0, room_settings_1.mergeSettings)(room_settings_1.DEFAULT_SETTINGS, settingsPatch);
        if (!settings.title) {
            settings.title = `Комната ${name}`.slice(0, room_settings_1.TITLE_MAX_LENGTH);
        }
        const room = await this.prisma.room.create({
            data: {
                code: await this.generateCode(),
                ...(0, room_view_1.settingsData)(settings),
                players: {
                    create: {
                        name,
                        token: newToken(),
                        isHost: true,
                        role: settings.mode === 'MODERATED' ? 'MODERATOR' : 'PLAYER',
                    },
                },
            },
            include: { players: true },
        });
        return { room, player: room.players[0] };
    }
    async join(code, rawName) {
        const name = (0, exports.normalizeName)(rawName);
        const room = await this.findByCode(code);
        if (room.status !== 'LOBBY')
            throw new game_error_1.GameError('Игра уже началась');
        if (activePlayers(room).length >= (0, room_view_1.settingsOf)(room).maxPlayers) {
            throw new game_error_1.GameError('Комната заполнена');
        }
        const taken = room.players.some((p) => p.name.toLowerCase() === name.toLowerCase());
        if (taken)
            throw new game_error_1.GameError('Это имя уже занято в комнате');
        const player = await this.prisma.player.create({
            data: { name, token: newToken(), roomId: room.id },
        });
        return { room, player };
    }
    async leave(playerId, code) {
        const room = await this.findByCode(code);
        const player = this.memberOf(room, playerId);
        if (room.status === 'LOBBY') {
            await this.prisma.player.delete({ where: { id: player.id } });
        }
        else {
            await this.prisma.player.update({
                where: { id: player.id },
                data: { hasLeft: true, isHost: false },
            });
        }
        const remaining = room.players.filter((p) => p.id !== player.id && !p.hasLeft);
        if (remaining.length === 0) {
            await this.prisma.room.delete({ where: { id: room.id } });
            return { deleted: true, duringGame: false };
        }
        if (player.isHost) {
            const successor = remaining.find((p) => this.presence.isOnline(p.id)) ?? remaining[0];
            await this.prisma.player.update({
                where: { id: successor.id },
                data: { isHost: true },
            });
        }
        return { deleted: false, duringGame: room.status === 'PLAYING' };
    }
    async setReady(playerId, code, ready) {
        const room = await this.lobbyOf(code);
        const player = this.memberOf(room, playerId);
        await this.prisma.player.update({
            where: { id: player.id },
            data: { isReady: ready === true },
        });
    }
    async updateSettings(playerId, code, patch) {
        const room = await this.lobbyOf(code);
        this.hostOf(room, playerId);
        const current = (0, room_view_1.settingsOf)(room);
        const next = (0, room_settings_1.mergeSettings)(current, patch);
        const moderators = room.players.filter((p) => p.role === 'MODERATOR');
        const ops = [];
        let playerCount = activePlayers(room).length;
        if (current.mode !== next.mode && next.mode === 'AUTO') {
            playerCount += moderators.length;
            ops.push(this.prisma.player.updateMany({
                where: { roomId: room.id, role: 'MODERATOR' },
                data: { role: 'PLAYER' },
            }));
        }
        if (current.mode !== next.mode && next.mode === 'MODERATED') {
            const host = room.players.find((p) => p.isHost);
            playerCount -= 1;
            ops.push(this.prisma.player.update({
                where: { id: host.id },
                data: { role: 'MODERATOR' },
            }));
        }
        if (playerCount > next.maxPlayers) {
            throw new game_error_1.GameError(`В комнате уже ${playerCount} игроков — лимит не может быть меньше`);
        }
        await this.prisma.$transaction([
            ...ops,
            this.prisma.room.update({
                where: { id: room.id },
                data: (0, room_view_1.settingsData)(next),
            }),
        ]);
    }
    async setModerator(playerId, code, targetId) {
        const room = await this.lobbyOf(code);
        this.hostOf(room, playerId);
        if ((0, room_view_1.settingsOf)(room).mode !== 'MODERATED') {
            throw new game_error_1.GameError('Ведущий есть только в режиме с ведущим');
        }
        const target = this.memberOf(room, targetId);
        if (target.role === 'MODERATOR')
            return;
        await this.prisma.$transaction([
            this.prisma.player.updateMany({
                where: { roomId: room.id, role: 'MODERATOR' },
                data: { role: 'PLAYER' },
            }),
            this.prisma.player.update({
                where: { id: target.id },
                data: { role: 'MODERATOR', isReady: false },
            }),
        ]);
    }
    async transferHost(playerId, code, targetId) {
        const room = await this.findByCode(code);
        const host = this.hostOf(room, playerId);
        const target = this.memberOf(room, targetId);
        if (target.id === host.id)
            return;
        await this.prisma.$transaction([
            this.prisma.player.update({
                where: { id: host.id },
                data: { isHost: false },
            }),
            this.prisma.player.update({
                where: { id: target.id },
                data: { isHost: true, isReady: false },
            }),
        ]);
    }
    async kick(playerId, code, targetId) {
        const room = await this.lobbyOf(code);
        const host = this.hostOf(room, playerId);
        const target = this.memberOf(room, targetId);
        if (target.id === host.id)
            throw new game_error_1.GameError('Нельзя выгнать себя');
        await this.prisma.player.delete({ where: { id: target.id } });
        return target;
    }
    async assertCanStart(playerId, code) {
        const room = await this.lobbyOf(code);
        const host = this.hostOf(room, playerId);
        const settings = (0, room_view_1.settingsOf)(room);
        const players = activePlayers(room);
        if (players.length < room_settings_1.PLAYER_LIMITS.min) {
            throw new game_error_1.GameError(`Нужно минимум ${room_settings_1.PLAYER_LIMITS.min} игрока`);
        }
        if (settings.mode === 'MODERATED' &&
            !room.players.some((p) => p.role === 'MODERATOR')) {
            throw new game_error_1.GameError('Назначьте ведущего');
        }
        const notReady = room.players.filter((p) => p.id !== host.id && !p.isReady);
        if (notReady.length > 0) {
            throw new game_error_1.GameError(`Не готовы: ${notReady.map((p) => p.name).join(', ')}`);
        }
        const offline = room.players.filter((p) => !this.presence.isOnline(p.id));
        if (offline.length > 0) {
            throw new game_error_1.GameError(`Не в сети: ${offline.map((p) => p.name).join(', ')}`);
        }
        return { room, players };
    }
    async lobbyOf(code) {
        const room = await this.findByCode(code);
        if (room.status !== 'LOBBY') {
            throw new game_error_1.GameError('Это можно сделать только до начала игры');
        }
        return room;
    }
    memberOf(room, playerId) {
        const player = room.players.find((p) => p.id === playerId && !p.hasLeft);
        if (!player)
            throw new game_error_1.GameError('Игрок не найден');
        return player;
    }
    hostOf(room, playerId) {
        const player = this.memberOf(room, playerId);
        if (!player.isHost)
            throw new game_error_1.GameError('Это может сделать только хост');
        return player;
    }
    async generateCode() {
        for (;;) {
            const code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[(0, crypto_1.randomInt)(CODE_ALPHABET.length)]).join('');
            const exists = await this.prisma.room.findUnique({ where: { code } });
            if (!exists)
                return code;
        }
    }
};
exports.RoomService = RoomService;
exports.RoomService = RoomService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        presence_service_1.PresenceService])
], RoomService);
//# sourceMappingURL=room.service.js.map