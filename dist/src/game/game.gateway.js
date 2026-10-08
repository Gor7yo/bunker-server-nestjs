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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const game_service_1 = require("./game.service");
const create_game_dto_1 = require("./dto/create-game.dto");
const update_game_dto_1 = require("./dto/update-game.dto");
let GameGateway = class GameGateway {
    gameService;
    constructor(gameService) {
        this.gameService = gameService;
    }
    create(createGameDto) {
        return this.gameService.create(createGameDto);
    }
    findAll() {
        return this.gameService.findAll();
    }
    findOne(id) {
        return this.gameService.findOne(id);
    }
    update(updateGameDto) {
        return this.gameService.update(updateGameDto.id, updateGameDto);
    }
    remove(id) {
        return this.gameService.remove(id);
    }
};
exports.GameGateway = GameGateway;
__decorate([
    (0, websockets_1.SubscribeMessage)('createGame'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_game_dto_1.CreateGameDto]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "create", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('findAllGame'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "findAll", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('findOneGame'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "findOne", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('updateGame'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [update_game_dto_1.UpdateGameDto]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "update", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('removeGame'),
    __param(0, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", void 0)
], GameGateway.prototype, "remove", null);
exports.GameGateway = GameGateway = __decorate([
    (0, websockets_1.WebSocketGateway)(),
    __metadata("design:paramtypes", [game_service_1.GameService])
], GameGateway);
//# sourceMappingURL=game.gateway.js.map