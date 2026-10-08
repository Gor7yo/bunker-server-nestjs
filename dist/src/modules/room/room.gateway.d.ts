import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { GameService } from '../game/game.service';
import { VoiceService } from '../voice/voice.service';
import { PresenceService } from './presence.service';
import { RealtimeService } from './realtime.service';
import { RoomLock } from './room-lock.service';
import { RoomService } from './room.service';
import type { Body } from './ws-utils';
export declare class RoomGateway implements OnGatewayInit, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
    private readonly rooms;
    private readonly game;
    private readonly presence;
    private readonly realtime;
    private readonly lock;
    private readonly voice;
    private readonly logger;
    private cleanupTimer?;
    constructor(rooms: RoomService, game: GameService, presence: PresenceService, realtime: RealtimeService, lock: RoomLock, voice: VoiceService);
    afterInit(server: Namespace): void;
    onModuleInit(): void;
    onModuleDestroy(): void;
    handleDisconnect(client: Socket): Promise<void>;
    watchRooms(client: Socket): Promise<import("../../common/game-error").WsResult<void>>;
    unwatchRooms(client: Socket): Promise<import("../../common/game-error").WsResult<void>>;
    create(client: Socket, body: Body): Promise<import("../../common/game-error").WsResult<{
        code: string;
        token: string;
    }>>;
    join(client: Socket, body: Body): Promise<import("../../common/game-error").WsResult<{
        code: string;
        token: string;
    }>>;
    resume(client: Socket, body: Body): Promise<import("../../common/game-error").WsResult<{
        code: string;
        token: string;
    }>>;
    leave(client: Socket): Promise<import("../../common/game-error").WsResult<void>>;
    ready(client: Socket, body: Body): Promise<import("../../common/game-error").WsResult<void>>;
    settings(client: Socket, body: Body): Promise<import("../../common/game-error").WsResult<void>>;
    setModerator(client: Socket, body: Body): Promise<import("../../common/game-error").WsResult<void>>;
    transferHost(client: Socket, body: Body): Promise<import("../../common/game-error").WsResult<void>>;
    kick(client: Socket, body: Body): Promise<import("../../common/game-error").WsResult<void>>;
    private enter;
    private detach;
    private inRoom;
}
