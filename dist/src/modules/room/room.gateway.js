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
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const room_service_1 = require("./room.service");
let RoomGateway = RoomGateway_1 = class RoomGateway {
    roomService;
    server;
    logger = new common_1.Logger(RoomGateway_1.name);
    constructor(roomService) {
        this.roomService = roomService;
    }
    async handleDisconnect(client) {
        console.log('🔴 Socket disconnected:', client.id);
        const player = await this.roomService.findPlayer(client);
        if (!player)
            return;
        try {
            const result = await this.roomService.setOffline(player.name, player.roomCode, client.id);
            if (!result) {
                console.log('⚠️ Старый socket, игнорируем:', client.id);
                return;
            }
            this.server.to(player.roomCode).emit('players:left', {
                players: result.room.players,
            });
            this.logger.log(`${player.name} disconnected`);
        }
        catch (e) {
            this.logger.error(e);
        }
    }
    async create(client, data) {
        try {
            const room = await this.roomService.create(data.hostName, client.id);
            client.join(room.code);
            client.emit('room:created', {
                roomCode: room.code,
                host: room.players[0],
            });
            this.logger.log(`Room created ${room.code}`);
        }
        catch (e) {
            client.emit('room:error', {
                message: e.message,
            });
        }
    }
    async join(client, data) {
        try {
            const player = await this.roomService.findPlayerName(data.playerName, data.roomCode);
            if (player && !player.isOnline) {
                return await this.reconnect(client, data);
            }
            const room = await this.roomService.join(data, client.id);
            client.join(data.roomCode);
            client.emit('room:joined', {
                roomCode: room.code,
                player: room.players.find((p) => p.socketId === client.id),
                players: room.players,
                gameState: room.gameState,
                maxPlayers: 12,
            });
            client.to(room.code).emit('room:playerJoined', {
                players: room.players,
            });
            this.server.emit('room:playerJoined', {
                players: room.players,
            });
            this.logger.log(`${data.playerName} connect`);
        }
        catch (e) {
            client.emit('room:error', {
                message: e.message,
            });
        }
    }
    async start(client, data) {
        try {
            const result = await this.roomService.gameStart(data.roomCode);
            for (const player of result.players) {
                if (!player.socketId)
                    continue;
                this.server.to(player.socketId).emit('player:cardReceived', {
                    character: player.character,
                });
            }
            this.server.to(data.roomCode).emit('game:started', {
                players: result.players.map((p) => ({
                    name: p.name,
                    isAlive: p.isAlive,
                })),
            });
            this.logger.log(`Игра началась в комнате ${data.roomCode}`);
        }
        catch (e) {
            client.emit('room:error', {
                message: e.message,
            });
        }
    }
    async reconnect(client, data) {
        try {
            const room = await this.roomService.reconnect(data, client);
            client.join(room.code);
            const me = room.players.find((p) => p.name === data.playerName);
            client.emit('room:joined', {
                roomCode: room.code,
                player: me,
                players: room.players,
                gameState: room.gameState,
                maxPlayers: 12,
            });
            client.to(data.roomCode).emit('room:playerJoined', {
                players: room.players,
            });
            if (room.gameState === 'GAME_RUNNING') {
                client.emit('game:started', {
                    players: room.players.map((p) => ({
                        name: p.name,
                        isAlive: p.isAlive,
                    })),
                });
            }
            client.to(room.code).emit('room:playerReconnected', {
                player: me,
                players: room.players,
            });
        }
        catch (e) {
            client.emit('room:reconnectError', {
                message: e.message,
            });
        }
    }
    async getState(client, data) {
        try {
            const room = await this.roomService.find(data.roomCode);
            client.emit('room:joined', {
                roomCode: room.code,
                player: room.players.find((p) => p.socketId === client.id),
                players: room.players,
                gameState: room.gameState,
                maxPlayers: 12,
            });
        }
        catch (e) {
            client.emit('room:error', {
                message: e.message,
            });
        }
    }
    async ready(client, data) {
        try {
            const result = await this.roomService.toggleReady(data, client);
            this.server.to(data.roomCode).emit('room:playersUpdated', {
                players: result.players,
                allReady: result.allReady,
            });
        }
        catch (e) {
            client.emit('room:error', {
                message: e.message,
            });
        }
    }
    async myCard(client, data) {
        try {
            const card = await this.roomService.getPlayerCard(data.roomCode, data.playerName);
            client.emit('player:cardReceived', {
                character: card,
            });
        }
        catch (e) {
            client.emit('room:error', {
                message: e.message,
            });
        }
    }
    async getCard(client, data) {
        try {
            const room = await this.roomService.find(data.roomCode);
            const currentPlayer = room.players.find((p) => p.name === data.playerName);
            if (!currentPlayer)
                throw new Error('Игрок не найден');
            client.emit('host:getCardUp', {
                playerName: currentPlayer.name,
                card: currentPlayer.characters,
            });
        }
        catch (e) {
            client.emit('room:error', {
                message: `Не удалось получить карту: ${e.message}`,
            });
        }
    }
    async kickPlayer(client, data) {
        try {
            const result = await this.roomService.kick(data);
            this.server.to(data.roomCode).emit('player:kicked', {
                kickedPlayer: result.kickedPlayer,
                players: result.room.players,
            });
        }
        catch (e) {
            client.emit('room:error', {
                message: `Cant kick player: ${e.message}`,
            });
        }
    }
    async leave(client, data) {
        try {
            const result = await this.roomService.leave(data.playerName, data.roomCode);
            client.leave(data.roomCode);
            this.server.to(data.roomCode).emit('players:left', {
                players: result?.room.players ?? [],
            });
            client.emit('room:left');
            this.logger.log(`${data.playerName} вышел из комнаты`);
        }
        catch (e) {
            client.emit('room:error', {
                message: e.message,
            });
        }
    }
};
exports.RoomGateway = RoomGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RoomGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:create'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "create", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "join", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('game:start'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "start", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:reconnect'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "reconnect", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('room:getState'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "getState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:ready'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "ready", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:myCard'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "myCard", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('host:getCard'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "getCard", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('host:kick'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "kickPlayer", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('player:left'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomGateway.prototype, "leave", null);
exports.RoomGateway = RoomGateway = RoomGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: { origin: '*' },
        namespace: 'room',
    }),
    __metadata("design:paramtypes", [room_service_1.RoomService])
], RoomGateway);
//# sourceMappingURL=room.gateway.js.map