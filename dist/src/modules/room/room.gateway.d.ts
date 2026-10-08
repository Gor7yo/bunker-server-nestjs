import { OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomService } from './room.service';
export declare class RoomGateway implements OnGatewayDisconnect {
    private readonly roomService;
    server: Server;
    private readonly logger;
    constructor(roomService: RoomService);
    handleDisconnect(client: Socket): Promise<void>;
    create(client: Socket, data: {
        hostName: string;
    }): Promise<void>;
    join(client: Socket, data: {
        roomCode: string;
        playerName: string;
    }): Promise<void>;
    start(client: Socket, data: {
        roomCode: string;
    }): Promise<void>;
    reconnect(client: Socket, data: {
        roomCode: string;
        playerName: string;
    }): Promise<void>;
    getState(client: Socket, data: {
        roomCode: string;
    }): Promise<void>;
    ready(client: Socket, data: {
        playerName: string;
        roomCode: string;
    }): Promise<void>;
    myCard(client: Socket, data: {
        roomCode: string;
        playerName: string;
    }): Promise<void>;
    getCard(client: Socket, data: {
        roomCode: string;
        playerName: string;
    }): Promise<void>;
    kickPlayer(client: Socket, data: {
        roomCode: string;
        playerName: string;
    }): Promise<void>;
    leave(client: Socket, data: {
        playerName: string;
        roomCode: string;
    }): Promise<void>;
}
