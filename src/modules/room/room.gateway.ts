import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomService } from './room.service';
import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ExceptionsHandler } from '@nestjs/core/exceptions/exceptions-handler';

@WebSocketGateway({
  cors: {
    origin: '*', // в продакшене замени на свой фронтенд URL
  },
  namespace: 'room', // все события будут на /room
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomGateway.name);

  constructor(private readonly roomService: RoomService) {}

  // Подключение клиента
  handleConnection(client: Socket) {
    this.logger.log(`Клиент подключен: ${client.id}`);
  }

  // Отключение клиента
  handleDisconnect(client: Socket) {
    this.logger.log(`Клиент отключен: ${client.id}`);

    // Ищем комнату, где был этот игрок
    const rooms = this.roomService.getAllRooms();
    for (const room of rooms) {
      const player = room.getPlayer(client.id);
      if (player) {
        const result = this.roomService.leaveRoom(room.code, client.id);
        if (result.success) {
          // Оповещаем всех в комнате
          this.server.to(room.code).emit('player:left', {
            playerId: client.id,
            players: room.players,
            newHost: result.newHost || null,
          });

          this.logger.log(`Игрок ${player.name} покинул комнату ${room.code}`);
        }
        break;
      }
    }
  }

  // Создание комнаты
  @SubscribeMessage('room:create')
  handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { hostName: string },
  ) {
    try {
      const { roomCode, host } = this.roomService.createRoom(data.hostName);

      // Сохраняем реальный socket.id
      const room = this.roomService.getRoom(roomCode);

      if (!room) {
        throw new ForbiddenException('Не удалось создать комнату');
      }

      const hostPlayer = room.getPlayer(host.id);
      if (hostPlayer) {
        hostPlayer.id = client.id;
      }

      // Подписываем клиента на комнату
      client.join(roomCode);

      // Отправляем ответ создателю
      client.emit('room:created', {
        roomCode,
        host: hostPlayer,
      });

      this.logger.log(`Комната ${roomCode} создана хостом ${data.hostName}`);
    } catch (error: any) {
      client.emit('room:error', { message: 'Ошибка создания комнаты' });
      this.logger.error(error.message);
    }
  }

  // Подключение к комнате
  @SubscribeMessage('room:join')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string; playerName: string },
  ) {
    const result = this.roomService.joinRoom(
      data.roomCode,
      data.playerName,
      client.id,
    );

    if (!result || !result.room) {
      throw new BadRequestException('Не удалось зайти в комнату');
    }

    if (!result.success) {
      client.emit('room:error', { message: result.error });
      return;
    }

    // Подписываем клиента на комнату
    client.join(data.roomCode);

    // Отправляем подтверждение игроку
    const player = result.room.getPlayer(client.id);
    client.emit('room:joined', {
      roomCode: data.roomCode,
      player,
      players: result.room.players,
      maxPlayers: result.room.maxPlayers,
    });

    // Оповещаем всех в комнате о новом игроке
    this.server.to(data.roomCode).emit('room:playerJoined', {
      players: result.room.players,
      joinedPlayer: player,
    });

    this.logger.log(
      `Игрок ${data.playerName} подключился к комнате ${data.roomCode}`,
    );
  }

  // Переключение готовности
  @SubscribeMessage('player:ready')
  handlePlayerReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string },
  ) {
    const result = this.roomService.toggleReady(data.roomCode, client.id);

    if (!result.success) {
      client.emit('room:error', { message: result.error });
      return;
    }

    const room = this.roomService.getRoom(data.roomCode);
    
    if (!room) {
      throw new NotFoundException('Не удалось найти комнату');
    }

    // Оповещаем всех в комнате
    this.server.to(data.roomCode).emit('player:readyUpdated', {
      players: room.players,
      allReady: result.allReady,
    });

    if (result.allReady) {
      // Можно автоматически переключить состояние в READY_CHECK
      this.server.to(data.roomCode).emit('game:allReady', {
        message: 'Все игроки готовы! Ведущий, запускайте игру.',
      });
    }
  }

  // Запуск игры (только для хоста)
  @SubscribeMessage('game:start')
  handleGameStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomCode: string },
  ) {
    const room = this.roomService.getRoom(data.roomCode);
    if (!room) {
      client.emit('room:error', { message: 'Комната не найдена' });
      return;
    }

    const player = room.getPlayer(client.id);
    if (!player || !player.isHost) {
      client.emit('room:error', {
        message: 'Только ведущий может запустить игру',
      });
      return;
    }

    if (!room.allReady()) {
      client.emit('room:error', { message: 'Не все игроки готовы' });
      return;
    }

    // Меняем состояние игры
    room.gameState = 'GAME_RUNNING';

    // Оповещаем всех
    this.server.to(data.roomCode).emit('game:started', {
      players: room.players,
      gameState: room.gameState,
    });

    this.logger.log(`Игра началась в комнате ${data.roomCode}`);
  }
}
