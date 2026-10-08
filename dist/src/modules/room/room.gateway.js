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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RoomGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomGateway = void 0;
const common_1 = require("@nestjs/common");
const websockets_1 = require("@nestjs/websockets");
const socket_io_1 = require("socket.io");
const env_1 = require("../../env");
const game_service_1 = require("../game/game.service");
const voice_service_1 = require("../voice/voice.service");
const presence_service_1 = require("./presence.service");
const realtime_service_1 = require("./realtime.service");
const room_lock_service_1 = require("./room-lock.service");
const room_service_1 = require("./room.service");
const ws_utils_1 = require("./ws-utils");
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let RoomGateway = RoomGateway_1 = class RoomGateway {
    rooms;
    game;
    presence;
    realtime;
    lock;
    voice;
    logger = new common_1.Logger(RoomGateway_1.name);
    cleanupTimer;
    constructor(rooms, game, presence, realtime, lock, voice) {
        this.rooms = rooms;
        this.game = game;
        this.presence = presence;
        this.realtime = realtime;
        this.lock = lock;
        this.voice = voice;
    }
    afterInit(server) {
        this.realtime.attach(server);
    }
    onModuleInit() {
        this.cleanupTimer = setInterval(() => {
            this.rooms
                .deleteAbandoned()
                .then((count) => {
                if (count === 0)
                    return;
                this.logger.log(`Deleted ${count} abandoned room(s)`);
                this.realtime.schedulePublicRooms();
            })
                .catch((e) => this.logger.error(e));
        }, CLEANUP_INTERVAL_MS);
    }
    onModuleDestroy() {
        clearInterval(this.cleanupTimer);
    }
    async handleDisconnect(client) {
        const session = (0, ws_utils_1.sessionOf)(client);
        if (!session)
            return;
        if (this.presence.unbind(session.playerId, client.id)) {
            await this.lock.run(session.roomCode, () => this.realtime.broadcast(session.roomCode));
        }
    }
    watchRooms(client) {
        return (0, ws_utils_1.handleWs)(this.logger, async () => {
            await client.join(realtime_service_1.PUBLIC_ROOMS_CHANNEL);
        });
    }
    unwatchRooms(client) {
        return (0, ws_utils_1.handleWs)(this.logger, async () => {
            await client.leave(realtime_service_1.PUBLIC_ROOMS_CHANNEL);
        });
    }
    create(client, body) {
        return (0, ws_utils_1.handleWs)(this.logger, async () => {
            const { room, player } = await this.rooms.create(body?.name, body?.settings);
            return this.lock.run(room.code, () => this.enter(client, player, room.code));
        });
    }
    join(client, body) {
        return (0, ws_utils_1.handleWs)(this.logger, async () => {
            const code = (0, room_service_1.normalizeCode)(body?.code);
            return this.lock.run(code, async () => {
                const { player } = await this.rooms.join(code, body?.name);
                return this.enter(client, player, code);
            });
        });
    }
    resume(client, body) {
        return (0, ws_utils_1.handleWs)(this.logger, async () => {
            const player = await this.rooms.findByToken(body?.token);
            return this.lock.run(player.room.code, () => this.enter(client, player, player.room.code));
        });
    }
    leave(client) {
        return this.inRoom(client, async ({ playerId, roomCode }) => {
            const result = await this.rooms.leave(playerId, roomCode);
            this.detach(client, playerId, roomCode);
            void this.voice.remove(roomCode, playerId);
            if (result.deleted) {
                this.realtime.schedulePublicRooms();
                return;
            }
            if (result.duringGame) {
                await this.game.afterLeaveLocked(roomCode, playerId);
            }
            await this.realtime.broadcast(roomCode);
        });
    }
    ready(client, body) {
        return this.inRoom(client, async ({ playerId, roomCode }) => {
            await this.rooms.setReady(playerId, roomCode, body?.ready);
            await this.realtime.broadcast(roomCode);
        });
    }
    settings(client, body) {
        return this.inRoom(client, async ({ playerId, roomCode }) => {
            await this.rooms.updateSettings(playerId, roomCode, body?.settings);
            await this.realtime.broadcast(roomCode);
        });
    }
    setModerator(client, body) {
        return this.inRoom(client, async ({ playerId, roomCode }) => {
            await this.rooms.setModerator(playerId, roomCode, body?.playerId);
            await this.realtime.broadcast(roomCode);
        });
    }
    transferHost(client, body) {
        return this.inRoom(client, async ({ playerId, roomCode }) => {
            await this.rooms.transferHost(playerId, roomCode, body?.playerId);
            await this.realtime.broadcast(roomCode);
        });
    }
    kick(client, body) {
        return this.inRoom(client, async ({ playerId, roomCode }) => {
            const kicked = await this.rooms.kick(playerId, roomCode, body?.playerId);
            const kickedSocketId = this.presence.socketOf(kicked.id);
            const kickedSocket = kickedSocketId
                ? this.realtime.socket(kickedSocketId)
                : undefined;
            if (kickedSocket) {
                kickedSocket.emit('room:kicked');
                this.detach(kickedSocket, kicked.id, roomCode);
            }
            void this.voice.remove(roomCode, kicked.id);
            await this.realtime.broadcast(roomCode);
        });
    }
    async enter(client, player, roomCode) {
        const previous = (0, ws_utils_1.sessionOf)(client);
        if (previous && previous.playerId !== player.id) {
            this.detach(client, previous.playerId, previous.roomCode);
            await this.realtime.broadcast(previous.roomCode);
        }
        const replacedSocketId = this.presence.bind(player.id, client.id);
        if (replacedSocketId && replacedSocketId !== client.id) {
            const replaced = this.realtime.socket(replacedSocketId);
            replaced?.emit('session:replaced');
            replaced?.disconnect(true);
        }
        const session = { playerId: player.id, roomCode };
        client.data = session;
        await client.join((0, ws_utils_1.roomChannel)(roomCode));
        await this.realtime.broadcast(roomCode);
        return { code: roomCode, token: player.token };
    }
    detach(client, playerId, roomCode) {
        this.presence.unbind(playerId, client.id);
        void client.leave((0, ws_utils_1.roomChannel)(roomCode));
        client.data = undefined;
    }
    inRoom(client, action) {
        return (0, ws_utils_1.inRoom)(this.logger, client, (session) => this.lock.run(session.roomCode, () => action(session)));
    }
};
exports.RoomGateway = RoomGateway;
__decorate([
    (0, websockets_1.SubscribeMessage)('rooms:watch'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "watchRooms", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('rooms:unwatch'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "unwatchRooms", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:create'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "create", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "join", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('session:resume'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "resume", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:leave'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "leave", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('lobby:ready'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "ready", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('lobby:settings'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "settings", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('lobby:setModerator'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "setModerator", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:transferHost'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "transferHost", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('lobby:kick'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], RoomGateway.prototype, "kick", null);
exports.RoomGateway = RoomGateway = RoomGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: 'game', cors: { origin: env_1.CLIENT_ORIGIN } }),
    __metadata("design:paramtypes", [room_service_1.RoomService,
        game_service_1.GameService,
        presence_service_1.PresenceService,
        realtime_service_1.RealtimeService,
        room_lock_service_1.RoomLock,
        voice_service_1.VoiceService])
], RoomGateway);
//# sourceMappingURL=room.gateway.js.map