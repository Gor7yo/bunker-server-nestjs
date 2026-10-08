"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomModule = void 0;
const common_1 = require("@nestjs/common");
const deck_module_1 = require("../deck/deck.module");
const game_gateway_1 = require("../game/game.gateway");
const game_service_1 = require("../game/game.service");
const presence_service_1 = require("./presence.service");
const realtime_service_1 = require("./realtime.service");
const room_lock_service_1 = require("./room-lock.service");
const room_gateway_1 = require("./room.gateway");
const room_service_1 = require("./room.service");
const rooms_controller_1 = require("./rooms.controller");
const voice_gateway_1 = require("../voice/voice.gateway");
const voice_service_1 = require("../voice/voice.service");
let RoomModule = class RoomModule {
};
exports.RoomModule = RoomModule;
exports.RoomModule = RoomModule = __decorate([
    (0, common_1.Module)({
        imports: [deck_module_1.DeckModule],
        controllers: [rooms_controller_1.RoomsController],
        providers: [
            room_service_1.RoomService,
            presence_service_1.PresenceService,
            room_lock_service_1.RoomLock,
            realtime_service_1.RealtimeService,
            game_service_1.GameService,
            voice_service_1.VoiceService,
            room_gateway_1.RoomGateway,
            game_gateway_1.GameGateway,
            voice_gateway_1.VoiceGateway,
        ],
    })
], RoomModule);
//# sourceMappingURL=room.module.js.map