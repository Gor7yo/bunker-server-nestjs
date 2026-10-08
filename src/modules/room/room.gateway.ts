import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

import { RoomService } from './room.service';
import { IPlayer } from 'src/common/interfaces/player.interface';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'room',
})
export class RoomGateway implements OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RoomGateway.name);

  constructor(private readonly roomService: RoomService) {}

  async handleDisconnect(client: Socket) {
    console.log('🔴 Socket disconnected:', client.id);

    const player = await this.roomService.findPlayer(client);

    if (!player) return;

    try {
      const result = await this.roomService.setOffline(
        player.name,
        player.roomCode,
        client.id,
      );

      if (!result) {
        console.log('⚠️ Старый socket, игнорируем:', client.id);
        return;
      }

      this.server.to(player.roomCode).emit('players:left', {
        players: result.room.players,
      });

      this.logger.log(`${player.name} disconnected`);
    } catch (e) {
      this.logger.error(e);
    }
  }

  @SubscribeMessage('room:create')
  async create(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { hostName: string },
  ) {
    try {
      const room = await this.roomService.create(data.hostName, client.id);

      client.join(room.code);

      client.emit('room:created', {
        roomCode: room.code,
        host: room.players[0],
      });

      this.logger.log(`Room created ${room.code}`);
    } catch (e: any) {
      client.emit('room:error', {
        message: e.message,
      });
    }
  }

  @SubscribeMessage('room:join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomCode: string;
      playerName: string;
    },
  ) {
    try {
      const player = await this.roomService.findPlayerName(
        data.playerName,
        data.roomCode,
      );

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
    } catch (e: any) {
      client.emit('room:error', {
        message: e.message,
      });
    }
  }

  @SubscribeMessage('game:start')
  async start(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomCode: string;
    },
  ) {
    try {
      const result = await this.roomService.gameStart(data.roomCode);

      for (const player of result.players) {
        if (!player.socketId) continue;

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
    } catch (e: any) {
      client.emit('room:error', {
        message: e.message,
      });
    }
  }

  @SubscribeMessage('room:reconnect')
  async reconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomCode: string;
      playerName: string;
    },
  ) {
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
    } catch (e: any) {
      client.emit('room:reconnectError', {
        message: e.message,
      });
    }
  }

  @SubscribeMessage('room:getState')
  async getState(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomCode: string;
    },
  ) {
    try {
      const room = await this.roomService.find(data.roomCode);

      client.emit('room:joined', {
        roomCode: room.code,
        player: room.players.find((p) => p.socketId === client.id),
        players: room.players,
        gameState: room.gameState,
        maxPlayers: 12,
      });
    } catch (e: any) {
      client.emit('room:error', {
        message: e.message,
      });
    }
  }

  @SubscribeMessage('player:ready')
  async ready(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      playerName: string;
      roomCode: string;
    },
  ) {
    try {
      const result = await this.roomService.toggleReady(data, client);

      this.server.to(data.roomCode).emit('room:playersUpdated', {
        players: result.players,
        allReady: result.allReady,
      });
    } catch (e: any) {
      client.emit('room:error', {
        message: e.message,
      });
    }
  }

  @SubscribeMessage('player:myCard')
  async myCard(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; playerName: string },
  ) {
    try {
      const card = await this.roomService.getPlayerCard(
        data.roomCode,
        data.playerName,
      );

      client.emit('player:cardReceived', {
        character: card,
      });
    } catch (e: any) {
      client.emit('room:error', {
        message: e.message,
      });
    }
  }

  @SubscribeMessage('host:getCard')
  async getCard(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; playerName: string },
  ) {
    try {
      const room = await this.roomService.find(data.roomCode);
      const currentPlayer = room.players.find(
        (p) => p.name === data.playerName,
      );

      if (!currentPlayer) throw new Error('Игрок не найден');

      client.emit('host:getCardUp', {
        playerName: currentPlayer.name,
        card: currentPlayer.characters,
      });
    } catch (e: any) {
      client.emit('room:error', {
        message: `Не удалось получить карту: ${e.message}`,
      });
    }
  }

  @SubscribeMessage('host:kick')
  async kickPlayer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; playerName: string },
  ) {
    try {
      const result = await this.roomService.kick(data);

      this.server.to(data.roomCode).emit('player:kicked', {
        kickedPlayer: result.kickedPlayer,
        players: result.room.players,
      });
    } catch (e: any) {
      client.emit('room:error', {
        message: `Cant kick player: ${e.message}`,
      });
    }
  }

  @SubscribeMessage('player:left')
  async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      playerName: string;
      roomCode: string;
    },
  ) {
    try {
      const result = await this.roomService.leave(
        data.playerName,
        data.roomCode,
      );

      client.leave(data.roomCode);

      this.server.to(data.roomCode).emit('players:left', {
        players: result?.room.players ?? [],
      });

      client.emit('room:left');

      this.logger.log(`${data.playerName} вышел из комнаты`);
    } catch (e: any) {
      client.emit('room:error', {
        message: e.message,
      });
    }
  }
}
