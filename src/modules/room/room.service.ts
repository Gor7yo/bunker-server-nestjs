import { Injectable } from '@nestjs/common';
import { Player, Prisma } from '@prisma/client';
import { randomBytes, randomInt } from 'crypto';

import { GameError } from '../../common/game-error';
import { PrismaService } from '../../prisma/prisma.service';
import { PresenceService } from './presence.service';
import {
  DEFAULT_SETTINGS,
  PLAYER_LIMITS,
  TITLE_MAX_LENGTH,
  mergeSettings,
} from './room.settings';
import { PublicRoomSummary } from './room.types';
import { RoomFilters } from './room.filters';
import { RoomWithPlayers, settingsData, settingsOf } from './room.view';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const NAME_MAX_LENGTH = 20;
/** Upper bound of rooms read from the DB for one list request. */
const PUBLIC_LIST_SCAN_LIMIT = 300;
/** Rooms nobody is connected to are deleted after this much inactivity. */
const ABANDONED_AFTER_MS = 30 * 60 * 1000;

const newToken = () => randomBytes(24).toString('base64url');

/** Players occupying a slot: not the moderator, not those who left. */
const activePlayers = (room: RoomWithPlayers) =>
  room.players.filter((p) => p.role === 'PLAYER' && !p.hasLeft);

export const normalizeName = (raw: unknown): string => {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!name) throw new GameError('Введите имя');
  if (name.length > NAME_MAX_LENGTH) {
    throw new GameError(`Имя длиннее ${NAME_MAX_LENGTH} символов`);
  }
  return name;
};

export const normalizeCode = (raw: unknown): string => {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!code) throw new GameError('Введите код комнаты');
  return code;
};

@Injectable()
export class RoomService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async findByCode(code: string): Promise<RoomWithPlayers> {
    const room = await this.prisma.room.findUnique({
      where: { code },
      include: { players: true },
    });
    if (!room) throw new GameError('Комната не найдена');
    return room;
  }

  async findByToken(token: unknown) {
    if (typeof token !== 'string' || !token) {
      throw new GameError('Сессия не найдена');
    }
    const player = await this.prisma.player.findUnique({
      where: { token },
      include: { room: true },
    });
    if (!player || player.hasLeft) throw new GameError('Сессия не найдена');
    return player;
  }

  /**
   * Public lobbies matching the filters. Title/host search, mode and
   * visibility are filtered by the DB; online presence and free slots live
   * in memory, so they are applied afterwards.
   */
  async listPublic(
    filters: RoomFilters,
  ): Promise<{ rooms: PublicRoomSummary[]; total: number }> {
    const search = filters.q
      ? { contains: filters.q, mode: 'insensitive' as const }
      : undefined;

    const rooms = await this.prisma.room.findMany({
      where: {
        status: 'LOBBY',
        isPublic: true,
        ...(filters.mode && { mode: filters.mode }),
        ...(search && {
          OR: [
            { title: search },
            { players: { some: { isHost: true, name: search } } },
          ],
        }),
      },
      include: { players: true },
      orderBy: { createdAt: 'desc' },
      take: PUBLIC_LIST_SCAN_LIMIT,
    });

    const summaries = rooms
      .filter((room) => room.players.some((p) => this.presence.isOnline(p.id)))
      .map<PublicRoomSummary>((room) => ({
        code: room.code,
        title: room.title,
        mode: room.mode,
        hostName: room.players.find((p) => p.isHost)?.name ?? '',
        players: activePlayers(room).length,
        maxPlayers: room.maxPlayers,
      }))
      .filter((room) => !filters.freeSlots || room.players < room.maxPlayers);

    if (filters.sort === 'popular') {
      // Stable sort: ties keep the DB order (newest first).
      summaries.sort((a, b) => b.players - a.players);
    }

    return {
      total: summaries.length,
      rooms: summaries.slice(0, filters.limit),
    };
  }

  /** Deletes stale rooms with nobody connected. Returns how many. */
  async deleteAbandoned(): Promise<number> {
    const stale = await this.prisma.room.findMany({
      where: { updatedAt: { lt: new Date(Date.now() - ABANDONED_AFTER_MS) } },
      select: { id: true, players: { select: { id: true } } },
    });

    const ids = stale
      .filter((room) => !room.players.some((p) => this.presence.isOnline(p.id)))
      .map((room) => room.id);

    if (ids.length > 0) {
      await this.prisma.room.deleteMany({ where: { id: { in: ids } } });
    }
    return ids.length;
  }

  async create(rawName: unknown, settingsPatch: unknown) {
    const name = normalizeName(rawName);
    const settings = mergeSettings(DEFAULT_SETTINGS, settingsPatch);
    if (!settings.title) {
      settings.title = `Комната ${name}`.slice(0, TITLE_MAX_LENGTH);
    }

    const room = await this.prisma.room.create({
      data: {
        code: await this.generateCode(),
        ...settingsData(settings),
        players: {
          create: {
            name,
            token: newToken(),
            isHost: true,
            role: settings.mode === 'MODERATED' ? 'MODERATOR' : 'PLAYER',
          },
        },
      },
      include: { players: true },
    });

    return { room, player: room.players[0] };
  }

  async join(code: string, rawName: unknown) {
    const name = normalizeName(rawName);
    const room = await this.findByCode(code);

    if (room.status !== 'LOBBY') throw new GameError('Игра уже началась');

    if (activePlayers(room).length >= settingsOf(room).maxPlayers) {
      throw new GameError('Комната заполнена');
    }

    const taken = room.players.some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (taken) throw new GameError('Это имя уже занято в комнате');

    const player = await this.prisma.player.create({
      data: { name, token: newToken(), roomId: room.id },
    });

    return { room, player };
  }

  /**
   * In the lobby the player is removed; during a game they are only marked
   * as left so the history stays. The room is deleted when nobody is left.
   */
  async leave(
    playerId: string,
    code: string,
  ): Promise<{ deleted: boolean; duringGame: boolean }> {
    const room = await this.findByCode(code);
    const player = this.memberOf(room, playerId);

    if (room.status === 'LOBBY') {
      await this.prisma.player.delete({ where: { id: player.id } });
    } else {
      await this.prisma.player.update({
        where: { id: player.id },
        data: { hasLeft: true, isHost: false },
      });
    }

    const remaining = room.players.filter(
      (p) => p.id !== player.id && !p.hasLeft,
    );

    if (remaining.length === 0) {
      await this.prisma.room.delete({ where: { id: room.id } });
      return { deleted: true, duringGame: false };
    }

    if (player.isHost) {
      const successor =
        remaining.find((p) => this.presence.isOnline(p.id)) ?? remaining[0];
      await this.prisma.player.update({
        where: { id: successor.id },
        data: { isHost: true },
      });
    }

    return { deleted: false, duringGame: room.status === 'PLAYING' };
  }

  async setReady(playerId: string, code: string, ready: unknown) {
    const room = await this.lobbyOf(code);
    const player = this.memberOf(room, playerId);

    await this.prisma.player.update({
      where: { id: player.id },
      data: { isReady: ready === true },
    });
  }

  async updateSettings(playerId: string, code: string, patch: unknown) {
    const room = await this.lobbyOf(code);
    this.hostOf(room, playerId);

    const current = settingsOf(room);
    const next = mergeSettings(current, patch);
    const moderators = room.players.filter((p) => p.role === 'MODERATOR');

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    let playerCount = activePlayers(room).length;

    if (current.mode !== next.mode && next.mode === 'AUTO') {
      // Without a moderator everyone becomes a regular player.
      playerCount += moderators.length;
      ops.push(
        this.prisma.player.updateMany({
          where: { roomId: room.id, role: 'MODERATOR' },
          data: { role: 'PLAYER' },
        }),
      );
    }

    if (current.mode !== next.mode && next.mode === 'MODERATED') {
      // The host moderates by default, they can hand it over later.
      const host = room.players.find((p) => p.isHost)!;
      playerCount -= 1;
      ops.push(
        this.prisma.player.update({
          where: { id: host.id },
          data: { role: 'MODERATOR' },
        }),
      );
    }

    if (playerCount > next.maxPlayers) {
      throw new GameError(
        `В комнате уже ${playerCount} игроков — лимит не может быть меньше`,
      );
    }

    await this.prisma.$transaction([
      ...ops,
      this.prisma.room.update({
        where: { id: room.id },
        data: settingsData(next),
      }),
    ]);
  }

  async setModerator(playerId: string, code: string, targetId: unknown) {
    const room = await this.lobbyOf(code);
    this.hostOf(room, playerId);

    if (settingsOf(room).mode !== 'MODERATED') {
      throw new GameError('Ведущий есть только в режиме с ведущим');
    }

    const target = this.memberOf(room, targetId);
    if (target.role === 'MODERATOR') return;

    await this.prisma.$transaction([
      this.prisma.player.updateMany({
        where: { roomId: room.id, role: 'MODERATOR' },
        data: { role: 'PLAYER' },
      }),
      this.prisma.player.update({
        where: { id: target.id },
        data: { role: 'MODERATOR', isReady: false },
      }),
    ]);
  }

  async transferHost(playerId: string, code: string, targetId: unknown) {
    const room = await this.findByCode(code);
    const host = this.hostOf(room, playerId);
    const target = this.memberOf(room, targetId);
    if (target.id === host.id) return;

    await this.prisma.$transaction([
      this.prisma.player.update({
        where: { id: host.id },
        data: { isHost: false },
      }),
      this.prisma.player.update({
        where: { id: target.id },
        data: { isHost: true, isReady: false },
      }),
    ]);
  }

  /** Removes a player from the lobby. Returns the kicked player. */
  async kick(playerId: string, code: string, targetId: unknown) {
    const room = await this.lobbyOf(code);
    const host = this.hostOf(room, playerId);
    const target = this.memberOf(room, targetId);

    if (target.id === host.id) throw new GameError('Нельзя выгнать себя');

    await this.prisma.player.delete({ where: { id: target.id } });
    return target;
  }

  /** Validates that the host can start; returns the future card holders. */
  async assertCanStart(playerId: string, code: string) {
    const room = await this.lobbyOf(code);
    const host = this.hostOf(room, playerId);
    const settings = settingsOf(room);
    const players = activePlayers(room);

    if (players.length < PLAYER_LIMITS.min) {
      throw new GameError(`Нужно минимум ${PLAYER_LIMITS.min} игрока`);
    }

    if (
      settings.mode === 'MODERATED' &&
      !room.players.some((p) => p.role === 'MODERATOR')
    ) {
      throw new GameError('Назначьте ведущего');
    }

    const notReady = room.players.filter((p) => p.id !== host.id && !p.isReady);
    if (notReady.length > 0) {
      throw new GameError(
        `Не готовы: ${notReady.map((p) => p.name).join(', ')}`,
      );
    }

    const offline = room.players.filter((p) => !this.presence.isOnline(p.id));
    if (offline.length > 0) {
      throw new GameError(
        `Не в сети: ${offline.map((p) => p.name).join(', ')}`,
      );
    }

    return { room, players };
  }

  private async lobbyOf(code: string) {
    const room = await this.findByCode(code);
    if (room.status !== 'LOBBY') {
      throw new GameError('Это можно сделать только до начала игры');
    }
    return room;
  }

  private memberOf(room: RoomWithPlayers, playerId: unknown): Player {
    const player = room.players.find((p) => p.id === playerId && !p.hasLeft);
    if (!player) throw new GameError('Игрок не найден');
    return player;
  }

  private hostOf(room: RoomWithPlayers, playerId: string): Player {
    const player = this.memberOf(room, playerId);
    if (!player.isHost) throw new GameError('Это может сделать только хост');
    return player;
  }

  private async generateCode(): Promise<string> {
    for (;;) {
      const code = Array.from(
        { length: CODE_LENGTH },
        () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
      ).join('');

      const exists = await this.prisma.room.findUnique({ where: { code } });
      if (!exists) return code;
    }
  }
}
