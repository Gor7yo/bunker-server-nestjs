import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GameState, Room } from './entities/room.entity';
import { IPlayer } from 'src/common/interfaces/player.interface';
import { DeckService } from '../deck/deck.service';
import { IPlayerCard, UsedCards } from '../deck/data/characters';
import { Server } from 'socket.io';

@Injectable()
export class RoomService {
  constructor(private readonly deckService: DeckService) {}

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

  async startGame(roomCode: string, server: Server) {
    // 👈 добавили server
    const room = this.getRoom(roomCode);
    if (!room) throw new NotFoundException('Такой комнаты нет');

    if (!room.allReady()) {
      throw new BadRequestException('Не все игроки готовы');
    }

    let attempts = 0;
    const maxAttempts = 50;
    let success = false;

    while (attempts < maxAttempts && !success) {
      room.players.forEach((p) => (p.characters = null));
      room.usedCards = this.resetUsedCards();
      this.generatePlayersCard(roomCode);
      success = this.checkAllCardsUnique(room);
      attempts++;
    }

    if (!success) {
      throw new InternalServerErrorException(
        'Не удалось сгенерировать уникальные карты',
      );
    }

    // 3. Меняем статус
    this.updateGameState(roomCode, 'GAME_RUNNING');

    // 4. Генерируем карты
    this.generatePlayersCard(roomCode);

    // Отправляем карты через server
    for (const player of room.players) {
      server.to(player.id).emit('player:cardReceived', {
        character: player.characters,
      });
    }

    server.to(roomCode).emit('game:started', {
      // 👈 используем server
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        isAlive: p.isAlive,
      })),
    });

    return { success: true };
  }

  updateGameState(roomCode: string, state: GameState) {
    const room = this.getRoom(roomCode);
    if (room) room.gameState = state;
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

  generatePlayersCard(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (!room) throw new NotFoundException('Такой комнаты нет');

    room.usedCards = {
      age: new Set(),
      profession: new Set(),
      health: new Set(),
      fobia: new Set(),
      hobbie: new Set(),
      bandage: new Set(),
      action: new Set(),
      fact: new Set(),
    };

    for (const player of room.players) {
      let card: IPlayerCard;
      let attempts = 0;
      const maxAttempts = 100;

      do {
        card = this.deckService.generatePlayerCard();
        attempts++;
      } while (
        attempts < maxAttempts &&
        !this.isCardUnique(room.usedCards, card)
      );

      if (attempts >= maxAttempts) {
        throw new Error('Не удалось сгенерировать уникальную карту');
      }

      player.characters = card;

      room.setUsedCards(player.id);
    }
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  roomExists(roomCode: string): boolean {
    return this.rooms.has(roomCode);
  }

  private isCardUnique(usedCards: any, card: IPlayerCard): boolean {
    return !(
      usedCards.age.has(card.age) ||
      usedCards.profession.has(card.profession) ||
      usedCards.health.has(card.health) ||
      usedCards.fobia.has(card.fobia) ||
      usedCards.hobbie.has(card.hobbie) ||
      usedCards.bandage.has(card.bandage) ||
      usedCards.action.has(card.action) ||
      usedCards.fact.has(card.fact)
    );
  }

  private addToUsedCards(usedCards: any, card: IPlayerCard) {
    usedCards.age.add(card.age);
    usedCards.profession.add(card.profession);
    usedCards.health.add(card.health);
    usedCards.fobia.add(card.fobia);
    usedCards.hobbie.add(card.hobbie);
    usedCards.bandage.add(card.bandage);
    usedCards.action.add(card.action);
    usedCards.fact.add(card.fact);
  }

  private resetUsedCards(): UsedCards {
    return {
      age: new Set(),
      profession: new Set(),
      health: new Set(),
      fobia: new Set(),
      hobbie: new Set(),
      bandage: new Set(),
      action: new Set(),
      fact: new Set(),
    };
  }

  private checkAllCardsUnique(room: Room): boolean {
    const categories = [
      'age',
      'profession',
      'health',
      'fobia',
      'hobbie',
      'bandage',
      'action',
      'fact',
    ];

    for (const category of categories) {
      const values = room.players
        .map((p) => p.characters?.[category])
        .filter((v) => v !== null && v !== undefined);

      const unique = new Set(values);
      if (unique.size !== values.length) {
        return false;
      }
    }
    return true;
  }
}
