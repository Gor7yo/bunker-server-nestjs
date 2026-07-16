import { ForbiddenException, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Room } from './entities/room.entity';
import { IPlayer } from 'src/common/interfaces/player.interface';

@Injectable()
export class RoomService {
  private rooms: Map<string, Room> = new Map();

  // Генерация 6-значного кода комнаты
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Создание комнаты
  createRoom(hostName: string): { roomCode: string; host: IPlayer } {
    let roomCode = this.generateRoomCode();

    // Убеждаемся, что код уникальный
    while (this.rooms.has(roomCode)) {
      roomCode = this.generateRoomCode();
    }

    const room = new Room(roomCode);

    const host: IPlayer = {
      id: uuidv4(), // временный ID, позже заменится на socket.id
      name: hostName,
      isReady: false,
      isHost: true,
      isAlive: true,
    };

    room.addPlayer(host);
    this.rooms.set(roomCode, room);

    return { roomCode, host };
  }

  // Подключение игрока
  joinRoom(
    roomCode: string,
    playerName: string,
    socketId: string,
  ): { success: boolean; room: Room | null; error: string | null } {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, room: null, error: 'Комната не найдена' };
    }

    if (room.gameState !== 'WAITING') {
      return { success: false, room: null, error: 'Игра уже началась' };
    }

    if (room.players.length >= room.maxPlayers) {
      return { success: false, room: null, error: 'Комната заполнена' };
    }

    // Проверяем, не заходит ли тот же игрок повторно
    const existingPlayer = room.players.find((p) => p.id === socketId);
    if (existingPlayer) {
      return { success: true, room, error: null }; // уже в комнате
    }

    const newPlayer: IPlayer = {
      id: socketId,
      name: playerName,
      isReady: false,
      isHost: false,
      isAlive: true,
    };

    room.addPlayer(newPlayer);
    return { success: true, room, error: null };
  }

  // Выход из комнаты
  leaveRoom(
    roomCode: string,
    socketId: string,
  ): { success: boolean; newHost?: IPlayer; error?: string } {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, error: 'Комната не найдена' };
    }

    const player = room.getPlayer(socketId);
    if (!player) {
      return { success: false, error: 'Игрок не найден' };
    }

    const wasHost = player.isHost;
    room.removePlayer(socketId);

    // Если комната пуста — удаляем
    if (room.players.length === 0) {
      this.rooms.delete(roomCode);
      return { success: true };
    }

    // Если вышел хост — назначаем нового
    if (wasHost) {
      const newHost = room.players[0];
      newHost.isHost = true;
      return { success: true, newHost };
    }

    return { success: true };
  }

  // Переключение готовности
  toggleReady(
    roomCode: string,
    socketId: string,
  ): { success: boolean; allReady?: boolean; error?: string } {
    const room = this.rooms.get(roomCode);
    if (!room) {
      return { success: false, error: 'Комната не найдена' };
    }

    const player = room.getPlayer(socketId);
    if (!player) {
      return { success: false, error: 'Игрок не найден' };
    }

    if (player.isHost) {
      return { success: false, error: 'Ведущий не может нажимать "Готов"' };
    }

    room.setReady(socketId);
    const allReady = room.allReady();

    return { success: true, allReady };
  }

  // Получение комнаты
  getRoom(roomCode: string): Room | undefined {
    const room = this.rooms.get(roomCode);

    if (!room) {
      throw new ForbiddenException('Не удалось создать комнату');
    }

    return room;
  }

  // Получение всех комнат (для дебага)
  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  // Проверка существования комнаты
  roomExists(roomCode: string): boolean {
    return this.rooms.has(roomCode);
  }
}
