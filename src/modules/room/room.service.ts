import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeckService } from '../deck/deck.service';
import { Socket } from 'socket.io';
import { IPlayer } from 'src/common/interfaces/player.interface';
import { randomBytes } from 'crypto';

interface CardSets {
  age: Set<string>;
  profession: Set<string>;
  health: Set<string>;
  fobia: Set<string>;
  hobbie: Set<string>;
  bandage: Set<string>;
  action: Set<string>;
  fact: Set<string>;
}

@Injectable()
export class RoomService {
  constructor(
    private prisma: PrismaService,
    private deck: DeckService,
  ) {}

  private readonly logger = new Logger(RoomService.name);

  async create(hostName: string, socketId: string) {
    const code = await this.generateCode();

    const room = await this.prisma.room.create({
      data: {
        code,
        players: {
          create: {
            name: hostName,
            socketId,
            isHost: true,
          },
        },
      },
      include: {
        players: true,
      },
    });

    return room;
  }

  async find(code: string) {
    const room = await this.prisma.room.findUnique({
      where: { code },
      select: {
        code: true,
        gameState: true,
        players: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            characters: true,
            name: true,
            isHost: true,
            isReady: true,
            isOnline: true,
            isAlive: true,
            socketId: true,
          },
        },
      },
    });

    if (!room) throw new NotFoundException('Room not found');

    return room;
  }

  async gameStart(roomCode: string) {
    const room = await this.find(roomCode);

    if (room.players.length < 2) {
      throw new BadRequestException('Need 2 or more players');
    }

    const allReady = room.players.every((p) => p.isReady);
    if (!allReady) {
      throw new BadRequestException('All is doesnt ready');
    }

    const updatedRoom = await this.dealCards(roomCode);

    return {
      players: updatedRoom.players.map((player) => ({
        socketId: player.socketId,
        character: player.characters,
        name: player.name,
        isAlive: player.isAlive,
      })),
    };
  }

  async join(data: { roomCode: string; playerName: string }, clientId: string) {
    const room = await this.find(data.roomCode);

    if (room.gameState !== 'WAITING') {
      throw new BadRequestException('Game already started');
    }

    if (room.players.length >= 12) {
      throw new BadRequestException('Room is full');
    }

    const exists = await this.prisma.player.findFirst({
      where: {
        name: data.playerName,
        roomCode: data.roomCode,
      },
    });

    if (exists && exists.isOnline) {
      throw new BadRequestException('Player already in room');
    }

    await this.prisma.player.create({
      data: {
        name: data.playerName,
        socketId: clientId,
        roomCode: data.roomCode,
        isOnline: true,
      },
    });

    return this.find(room.code);
  }

  async kick(data: { roomCode: string; playerName: string }) {
    const player = await this.findPlayerNameOrThrow(
      data.playerName,
      data.roomCode,
    );

    const kickedPlayer = await this.prisma.player.delete({
      where: { id: player.id },
    });

    const room = await this.find(data.roomCode);

    return { kickedPlayer, room };
  }

  async leave(playerName: string, roomCode: string) {
    const player = await this.findPlayerNameOrThrow(playerName, roomCode);

    if (player.isHost) {
      const newHost = await this.prisma.player.findFirst({
        where: {
          roomCode,
          id: { not: player.id },
          isOnline: true,
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      if (newHost) {
        await this.prisma.player.update({
          where: { id: newHost.id },
          data: { isHost: true },
        });
      }
    }

    await this.prisma.player.update({
      where: { id: player.id },
      data: {
        isOnline: false,
      },
    });

    const updatedRoom = await this.find(roomCode);

    if (updatedRoom.players.every((p) => p.isOnline === false)) {
      await this.prisma.player.deleteMany({
        where: { roomCode: updatedRoom.code },
      });
      
      await this.prisma.room.delete({
        where: { code: updatedRoom.code },
      });

      await this.prisma.player.deleteMany({
        where: { roomCode: updatedRoom.code },
      });

      return;
    }

    return {
      room: updatedRoom,
      playerName: player.name,
    };
  }

  async setOffline(playerName: string, roomCode: string, clientId: string) {
    const player = await this.findPlayerNameOrThrow(playerName, roomCode);

    if (player.socketId !== clientId) {
      return null;
    }

    return this.prisma.player.update({
      where: {
        id: player.id,
      },
      data: {
        isOnline: false,
      },
      include: {
        room: {
          include: {
            players: true,
          },
        },
      },
    });
  }

  async removePlayer(playerId: string) {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });

    if (!player) throw new NotFoundException('Игрок не найден');

    if (player.isHost) {
      const newHost = await this.prisma.player.findFirst({
        where: {
          roomCode: player.roomCode,
          id: { not: playerId },
          isOnline: true,
        },
      });

      if (newHost) {
        await this.prisma.player.update({
          where: { id: newHost.id },
          data: { isHost: true },
        });
      }
    }

    await this.prisma.player.delete({
      where: { id: playerId },
    });
  }

  async reconnect(
    data: { roomCode: string; playerName: string },
    client: Socket,
  ) {
    const player = await this.findPlayerNameOrThrow(
      data.playerName,
      data.roomCode,
    );

    await this.prisma.player.update({
      where: {
        id: player.id,
      },
      data: {
        socketId: client.id,
        isOnline: true,
      },
    });

    return this.find(data.roomCode);
  }

  async getPlayerCard(roomCode: string, playerName: string) {
    const room = await this.find(roomCode);

    const player = room.players.find((p) => p.name === playerName);

    if (!player) {
      throw new NotFoundException('Игрок не найден');
    }

    if (!player.characters) {
      throw new BadRequestException('Карта еще не выдана');
    }

    return player.characters;
  }

  async toggleReady(
    data: { playerName: string; roomCode: string },
    client: Socket,
  ) {
    const player = await this.findPlayerNameOrThrow(
      data.playerName,
      data.roomCode,
    );

    if (player.socketId !== client.id) {
      await this.prisma.player.update({
        where: { id: player.id },
        data: { socketId: client.id, isReady: !player.isReady },
      });
    } else {
      await this.prisma.player.update({
        where: { id: player.id },
        data: { isReady: !player.isReady },
      });
    }

    const players = (await this.find(data.roomCode)).players
      .map(({ name, isHost, characters, isAlive, isOnline, isReady }) => ({
        name,
        isHost,
        isReady,
        characters,
        isAlive,
        isOnline,
      }))
      .sort((a, b) => a.name.length - b.name.length);
    const allReady = players.every((p) => p.isReady);

    console.log('Players: ' + JSON.stringify(players));

    return { players, allReady };
  }

  async updateSocketId(oldId: string, newId: string) {
    await this.prisma.player.update({
      where: { socketId: oldId },
      data: { socketId: newId },
    });
  }

  async findPlayer(client: any) {
    return this.prisma.player.findFirst({
      where: { socketId: client.id },
    });
  }

  async findPlayerName(name: string, roomCode: string) {
    return await this.prisma.player.findFirst({
      where: {
        name,
        roomCode,
      },
    });
  }

  async findPlayerNameOrThrow(name: string, roomCode: string) {
    const player = await this.prisma.player.findFirst({
      where: {
        name,
        roomCode,
      },
    });

    if (!player) {
      throw new NotFoundException('Player not found');
    }

    return player;
  }

  async dealCards(roomCode: string) {
    const room = await this.find(roomCode);

    const used = this.createUsedSet();

    const playerIds = room.players.map((player) => player.id);

    await this.prisma.$transaction(
      playerIds.map((playerId) => {
        const card = this.generateUniqueCard(used);

        return this.prisma.player.update({
          where: {
            id: playerId,
          },
          data: {
            characters: card,
          },
        });
      }),
    );

    await this.prisma.room.update({
      where: {
        code: roomCode,
      },
      data: {
        gameState: 'GAME_RUNNING',
      },
    });

    return await this.find(roomCode);
  }

  private async generateCode(): Promise<string> {
    while (true) {
      const code = randomBytes(3).toString('hex').toUpperCase();

      const exists = await this.prisma.room.findUnique({
        where: {
          code,
        },
      });

      if (!exists) return code;
    }
  }

  async getGameState(roomCode: string) {
    const room = await this.find(roomCode);

    return {
      gameState: room.gameState,
      playersCount: room.players.length,
      onlineCount: room.players.filter((p) => p.isOnline).length,
      readyCount: room.players.filter((p) => p.isReady).length,
      canStart:
        room.players.length >= 2 && room.players.every((p) => p.isReady),
    };
  }

  private createUsedSet(): CardSets {
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

  private generateUniqueCard(used: any) {
    for (let i = 0; i < 100; i++) {
      const card = this.deck.generatePlayerCard();
      if (this.isUnique(used, card)) {
        this.addToUsed(used, card);
        return card;
      }
    }
    throw new Error('Не удалось сгенерировать уникальную карту');
  }

  private isUnique(used: any, card: any): boolean {
    const fields = [
      'age',
      'profession',
      'health',
      'fobia',
      'hobbie',
      'bandage',
      'action',
      'fact',
    ];
    return fields.every((f) => !used[f].has(card[f]));
  }

  private addToUsed(used: any, card: any) {
    const fields = [
      'age',
      'profession',
      'health',
      'fobia',
      'hobbie',
      'bandage',
      'action',
      'fact',
    ];
    fields.forEach((f) => used[f].add(card[f]));
  }
}
