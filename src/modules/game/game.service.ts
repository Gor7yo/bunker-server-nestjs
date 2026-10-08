import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';

import { GameError } from '../../common/game-error';
import { PrismaService } from '../../prisma/prisma.service';
import { CARD_LABELS, CardKey, isCardKey } from '../deck/card.types';
import { DeckService } from '../deck/deck.service';
import { PresenceService } from '../room/presence.service';
import { RealtimeService } from '../room/realtime.service';
import { RoomLock } from '../room/room-lock.service';
import { RoomService } from '../room/room.service';
import { cardOf } from '../room/room.view';
import { VoiceService } from '../voice/voice.service';
import { BUNKER_FEATURES, BUNKERS, CATASTROPHES } from './data/scenarios';
import { GameContext, gameOf } from './game.context';
import * as actions from './game.actions';
import * as rules from './game.rules';
import { ActionParams, GamePhase, GameState } from './game.types';

const BUNKER_FEATURE_COUNT = 3;
/** After a server restart players need time to reconnect. */
const RESUME_GRACE_MS = 15_000;
const MODERATOR_TIMER_LIMITS: [number, number] = [5, 900];
const MODERATOR_PHASES: GamePhase[] = ['INTRO', 'REVEAL', 'DISCUSSION'];

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

const pick = <T>(items: readonly T[]): T => items[randomInt(items.length)];

const pickMany = <T>(items: readonly T[], count: number): T[] => {
  const pool = [...items];
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    result.push(pool.splice(randomInt(pool.length), 1)[0]);
  }
  return result;
};

const parseKey = (value: unknown): CardKey => {
  if (!isCardKey(value)) throw new GameError('Неизвестная характеристика');
  return value;
};

/** Optional timer in seconds for moderator commands; null = no timer. */
const parseSeconds = (value: unknown): number | null => {
  if (value === undefined || value === null) return null;
  const [min, max] = MODERATOR_TIMER_LIMITS;
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new GameError(`Таймер: от ${min} до ${max} секунд`);
  }
  return value as number;
};

type Body = Record<string, unknown> | undefined;

@Injectable()
export class GameService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly rooms: RoomService,
    private readonly deck: DeckService,
    private readonly presence: PresenceService,
    private readonly realtime: RealtimeService,
    private readonly lock: RoomLock,
    private readonly voice: VoiceService,
  ) {}

  // ---- lifecycle --------------------------------------------------------

  /** Restores AUTO timers of running games after a restart. */
  async onApplicationBootstrap() {
    const running = await this.prisma.room.findMany({
      where: { status: 'PLAYING', mode: 'AUTO' },
      select: { code: true },
    });

    for (const { code } of running) {
      await this.mutate(code, (ctx) => {
        const s = ctx.state;
        if (s.phaseEndsAt !== null) {
          s.phaseEndsAt = Math.max(s.phaseEndsAt, ctx.now + RESUME_GRACE_MS);
          ctx.touch();
        }
      }).catch((e: unknown) => this.logger.error(e));
    }
  }

  onModuleDestroy() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  // ---- start / end ------------------------------------------------------

  start(actorId: string, code: string) {
    return this.lock.run(code, async () => {
      const { room, players } = await this.rooms.assertCanStart(actorId, code);
      const cards = this.deck.deal(players.length);
      const bunker = pick(BUNKERS);

      const state: GameState = {
        seq: 0,
        catastrophe: pick(CATASTROPHES),
        bunker: {
          ...bunker,
          features: pickMany(BUNKER_FEATURES, BUNKER_FEATURE_COUNT),
        },
        seats: Math.max(1, Math.floor(players.length / 2)),
        round: 0,
        phase: 'INTRO',
        phaseEndsAt:
          room.mode === 'AUTO' ? Date.now() + rules.INTRO_SECONDS * 1000 : null,
        speakerId: null,
        turnQueue: [],
        revealedThisTurn: false,
        votes: {},
        candidates: [],
        isRevote: false,
        readyToVote: [],
        lastVote: null,
        lastExiledId: null,
        exiledByLot: false,
        log: [{ at: Date.now(), text: 'Игра началась', tone: 'info' }],
      };

      await this.prisma.$transaction([
        ...players.map((p, i) =>
          this.prisma.player.update({
            where: { id: p.id },
            data: { card: toJson(cards[i]), revealed: [], isAlive: true },
          }),
        ),
        this.prisma.player.updateMany({
          where: { roomId: room.id },
          data: { isReady: false },
        }),
        this.prisma.room.update({
          where: { id: room.id },
          data: { status: 'PLAYING', game: toJson(state) },
        }),
      ]);

      await this.realtime.broadcast(code);
      this.schedule(code, state, room.mode === 'AUTO');
      this.logger.log(`Game started in ${code}`);
    });
  }

  /** Host: back to the lobby with the same people (after or instead of a game). */
  backToLobby(actorId: string, code: string) {
    return this.lock.run(code, async () => {
      const room = await this.rooms.findByCode(code);
      const actor = room.players.find((p) => p.id === actorId);
      if (!actor?.isHost) throw new GameError('Это может сделать только хост');
      if (room.status === 'LOBBY') return;

      this.clearTimer(code);
      await this.prisma.$transaction([
        this.prisma.player.deleteMany({
          where: { roomId: room.id, hasLeft: true },
        }),
        this.prisma.player.updateMany({
          where: { roomId: room.id },
          data: {
            card: Prisma.DbNull,
            revealed: [],
            isAlive: true,
            isReady: false,
          },
        }),
        this.prisma.room.update({
          where: { id: room.id },
          data: { status: 'LOBBY', game: Prisma.DbNull },
        }),
      ]);
      await this.realtime.broadcast(code);
      this.voice.syncLater(code);
    });
  }

  /**
   * A player left during the game (the caller holds the room lock and has
   * already marked them `hasLeft`). Without a moderator the game goes AUTO.
   */
  async afterLeaveLocked(code: string, playerId: string) {
    await this.mutateLocked(code, (ctx) => {
      const player = ctx.player(playerId);
      const s = ctx.state;

      if (player.role === 'MODERATOR') {
        ctx.mode = 'AUTO';
        ctx.log('Ведущий покинул игру — дальше игра идёт автоматически');
        if (s.phaseEndsAt === null && s.phase !== 'FINISHED') {
          s.phaseEndsAt = ctx.now + 5000;
        }
        return;
      }

      if (!player.isAlive) return;
      player.isAlive = false;
      ctx.dirtyPlayers.add(player.id);
      ctx.forget(player.id);
      ctx.log(`${player.name} покинул игру`, 'exile');

      if (!ctx.isAuto || s.phase === 'FINISHED') return;
      if (ctx.alive.length <= s.seats) return rules.finishGame(ctx);
      if (s.speakerId === player.id) {
        if (s.phase === 'REVEAL') rules.nextSpeaker(ctx);
        if (s.phase === 'DEFENSE') rules.nextDefender(ctx);
      }
      if (s.phase === 'VOTING' && rules.everyoneVoted(ctx))
        rules.closeVoting(ctx);
    });
  }

  // ---- player commands --------------------------------------------------

  reveal(actorId: string, code: string, body: Body) {
    const key = parseKey(body?.key);
    return this.mutate(code, (ctx) => {
      const s = ctx.state;
      const player = this.alivePlayer(ctx, actorId);

      // "Исповедь": the target reveals anything of their choice, any time.
      if (s.confession?.targetId === player.id) {
        if (player.revealed.includes(key)) throw new GameError('Уже раскрыто');
        s.confession = null;
        rules.revealOwn(ctx, player, key);
        return;
      }

      if (s.phase !== 'REVEAL')
        throw new GameError('Сейчас не время раскрывать карты');
      if (s.speakerId && s.speakerId !== player.id)
        throw new GameError('Сейчас не ваш ход');
      if (ctx.isAuto && s.speakerId !== player.id)
        throw new GameError('Сейчас не ваш ход');
      if (s.speakerId === player.id && s.revealedThisTurn) {
        throw new GameError('Вы уже раскрыли характеристику в этот ход');
      }
      if (player.revealed.includes(key)) throw new GameError('Уже раскрыто');

      const required = ctx.requiredKey(player);
      if (required && required !== key) {
        throw new GameError(`Сначала раскройте: ${CARD_LABELS[required]}`);
      }

      rules.revealOwn(ctx, player, key);
      if (s.speakerId === player.id) s.revealedThisTurn = true;
    });
  }

  endTurn(actorId: string, code: string) {
    return this.mutate(code, (ctx) => {
      const s = ctx.state;
      if (s.speakerId !== actorId) throw new GameError('Сейчас не ваш ход');

      if (!ctx.isAuto) {
        s.speakerId = null;
        s.phaseEndsAt = null;
        ctx.touch();
        return;
      }

      if (s.phase === 'REVEAL') {
        if (!s.revealedThisTurn) {
          throw new GameError('Сначала раскройте характеристику');
        }
        rules.nextSpeaker(ctx);
      } else if (s.phase === 'DEFENSE') {
        rules.nextDefender(ctx);
      }
    });
  }

  readyToVote(actorId: string, code: string) {
    return this.mutate(code, (ctx) => {
      const s = ctx.state;
      const player = this.alivePlayer(ctx, actorId);
      if (s.phase !== 'DISCUSSION') throw new GameError('Сейчас не обсуждение');

      s.readyToVote = s.readyToVote.includes(player.id)
        ? s.readyToVote.filter((id) => id !== player.id)
        : [...s.readyToVote, player.id];
      ctx.touch();

      const online = ctx.alive.filter((p) => ctx.isOnline(p.id));
      if (ctx.isAuto && online.every((p) => s.readyToVote.includes(p.id))) {
        rules.startVoting(
          ctx,
          ctx.alive.map((p) => p.id),
          false,
        );
      }
    });
  }

  vote(actorId: string, code: string, body: Body) {
    return this.mutate(code, (ctx) => {
      const s = ctx.state;
      const voter = this.alivePlayer(ctx, actorId);
      if (s.phase !== 'VOTING') throw new GameError('Сейчас не голосование');

      const targetId = body?.playerId;
      if (typeof targetId !== 'string' || !s.candidates.includes(targetId)) {
        throw new GameError('За этого игрока нельзя голосовать');
      }
      if (targetId === voter.id)
        throw new GameError('Нельзя голосовать за себя');

      s.votes = { ...s.votes, [voter.id]: targetId };
      ctx.touch();

      if (ctx.isAuto && rules.everyoneVoted(ctx)) rules.closeVoting(ctx);
    });
  }

  /**
   * Plays the viewer's action card. In a moderated room with approval on,
   * it waits for the moderator instead of applying at once.
   */
  playAction(actorId: string, code: string, body: Body) {
    const params = this.parseActionParams(body);
    return this.mutate(code, (ctx) => {
      const actor = this.alivePlayer(ctx, actorId);
      const reason = actions.blockedReason(ctx, actor);
      if (reason) throw new GameError(reason);
      actions.resolveParams(ctx, actor, params); // validate before queueing

      const needsApproval =
        !ctx.isAuto &&
        ctx.settings.actions.approval === 'MODERATOR' &&
        ctx.room.players.some((p) => p.role === 'MODERATOR' && !p.hasLeft);

      if (needsApproval) {
        const pending = { id: randomUUID(), playerId: actor.id, params };
        ctx.state.pendingActions = [...ctx.state.pendingActions!, pending];
        ctx.log(
          `${actor.name} хочет сыграть карту действия — ждём ведущего`,
          'vote',
        );
        return;
      }

      actions.executeAction(ctx, actor, params, this.actionDeps);
    });
  }

  modResolveAction(
    actorId: string,
    code: string,
    body: Body,
    approve: boolean,
  ) {
    return this.moderate(actorId, code, (ctx) => {
      const pending = ctx.state.pendingActions!.find((a) => a.id === body?.id);
      if (!pending) throw new GameError('Запрос не найден');
      ctx.state.pendingActions = ctx.state.pendingActions!.filter(
        (a) => a.id !== pending.id,
      );
      const player = ctx.player(pending.playerId);

      if (!approve) {
        ctx.log(`Ведущий отклонил карту игрока ${player.name}`, 'vote');
        return;
      }
      if (!ctx.isAlivePlayer(player.id)) throw new GameError('Игрок уже выбыл');
      actions.executeAction(ctx, player, pending.params, this.actionDeps);
    });
  }

  // ---- moderator commands -----------------------------------------------

  modPhase(actorId: string, code: string, body: Body) {
    const phase = body?.phase as GamePhase;
    if (!MODERATOR_PHASES.includes(phase))
      throw new GameError('Неизвестная фаза');
    const seconds = parseSeconds(body?.seconds);

    return this.moderate(actorId, code, (ctx) => {
      const s = ctx.state;
      if (s.round === 0 && phase !== 'INTRO') {
        throw new GameError('Сначала начните первый раунд');
      }
      if (s.phase !== phase) {
        s.speakerId = null;
        s.readyToVote = [];
        ctx.log(
          {
            INTRO: 'Ведущий рассказывает о катастрофе',
            REVEAL: 'Раскрытие карт',
            DISCUSSION: 'Обсуждение',
          }[phase as 'INTRO' | 'REVEAL' | 'DISCUSSION'],
        );
      }
      ctx.setPhase(phase, seconds);
    });
  }

  modSpeaker(actorId: string, code: string, body: Body) {
    const seconds = parseSeconds(body?.seconds);
    return this.moderate(actorId, code, (ctx) => {
      const s = ctx.state;
      if (body?.playerId === null || body?.playerId === undefined) {
        s.speakerId = null;
        s.phaseEndsAt = null;
        ctx.touch();
        return;
      }
      const player = this.alivePlayer(ctx, body.playerId);
      s.speakerId = player.id;
      s.revealedThisTurn = false;
      s.phaseEndsAt = seconds === null ? null : ctx.now + seconds * 1000;
      ctx.log(`Слово: ${player.name}`);
    });
  }

  modStartVoting(actorId: string, code: string, body: Body) {
    const seconds = parseSeconds(body?.seconds);
    return this.moderate(actorId, code, (ctx) => {
      const alive = ctx.alive.map((p) => p.id);
      const requested = Array.isArray(body?.candidates)
        ? alive.filter((id) => (body.candidates as unknown[]).includes(id))
        : alive;
      if (requested.length < 1) throw new GameError('Выберите кандидатов');
      rules.startVoting(
        ctx,
        requested,
        requested.length < alive.length,
        seconds,
      );
    });
  }

  modCloseVoting(actorId: string, code: string) {
    return this.moderate(actorId, code, (ctx) => {
      if (ctx.state.phase !== 'VOTING')
        throw new GameError('Голосование не идёт');
      rules.closeVoting(ctx);
    });
  }

  modExile(actorId: string, code: string, body: Body) {
    return this.moderate(actorId, code, (ctx) => {
      rules.exilePlayer(ctx, this.alivePlayer(ctx, body?.playerId), false);
    });
  }

  modRevive(actorId: string, code: string, body: Body) {
    return this.moderate(actorId, code, (ctx) => {
      const player = ctx.player(body?.playerId);
      if (player.role !== 'PLAYER' || player.hasLeft)
        throw new GameError('Игрок не найден');
      if (player.isAlive) throw new GameError('Игрок и так в игре');
      ctx.revive(player);
      ctx.log(`${player.name} возвращается в игру`);
    });
  }

  modReveal(actorId: string, code: string, body: Body) {
    const key = parseKey(body?.key);
    return this.moderate(actorId, code, (ctx) => {
      rules.revealOwn(ctx, this.cardHolder(ctx, body?.playerId), key);
    });
  }

  modHide(actorId: string, code: string, body: Body) {
    const key = parseKey(body?.key);
    return this.moderate(actorId, code, (ctx) => {
      const player = this.cardHolder(ctx, body?.playerId);
      ctx.hide(player, key);
      ctx.log(
        `Ведущий скрыл у ${player.name}: ${CARD_LABELS[key].toLowerCase()}`,
      );
    });
  }

  modReroll(actorId: string, code: string, body: Body) {
    const key = parseKey(body?.key);
    return this.moderate(actorId, code, (ctx) => {
      const player = this.cardHolder(ctx, body?.playerId);
      const used = ctx.participants
        .map((p) => cardOf(p)?.[key])
        .filter(Boolean) as string[];
      ctx.setCardValue(player, key, this.deck.randomValue(key, used));
      const visible = player.revealed.includes(key);
      ctx.log(
        `Ведущий заменил у ${player.name}: ${CARD_LABELS[key].toLowerCase()}` +
          (visible ? ` → ${cardOf(player)![key]}` : ''),
        'reveal',
      );
    });
  }

  modSwap(actorId: string, code: string, body: Body) {
    const key = parseKey(body?.key);
    return this.moderate(actorId, code, (ctx) => {
      const a = this.cardHolder(ctx, body?.playerId);
      const b = this.cardHolder(ctx, body?.otherId);
      if (a.id === b.id) throw new GameError('Выберите двух разных игроков');
      const valueA = cardOf(a)![key];
      ctx.setCardValue(a, key, cardOf(b)![key]);
      ctx.setCardValue(b, key, valueA);
      ctx.log(
        `Ведущий поменял «${CARD_LABELS[key]}» у ${a.name} и ${b.name}`,
        'reveal',
      );
    });
  }

  modNextRound(actorId: string, code: string) {
    return this.moderate(actorId, code, (ctx) => rules.startRound(ctx));
  }

  modFinish(actorId: string, code: string) {
    return this.moderate(actorId, code, (ctx) => rules.finishGame(ctx));
  }

  // ---- internals --------------------------------------------------------

  private readonly actionDeps: actions.ActionDeps = {
    randomValue: (key, exclude) => this.deck.randomValue(key, exclude),
  };

  private parseActionParams(body: Body): ActionParams {
    const id = (value: unknown) =>
      typeof value === 'string' ? value : undefined;
    return {
      targetId: id(body?.targetId),
      otherId: id(body?.otherId),
      key: isCardKey(body?.key) ? body.key : undefined,
    };
  }

  private moderate(
    actorId: string,
    code: string,
    action: (ctx: GameContext) => void,
  ) {
    return this.mutate(code, (ctx) => {
      const actor = ctx.player(actorId);
      if (actor.role !== 'MODERATOR' || actor.hasLeft) {
        throw new GameError('Это может сделать только ведущий');
      }
      if (ctx.state.phase === 'FINISHED') throw new GameError('Игра окончена');
      action(ctx);
    });
  }

  private alivePlayer(ctx: GameContext, id: unknown) {
    const player = ctx.alive.find((p) => p.id === id);
    if (!player) throw new GameError('Игрок выбыл или не найден');
    return player;
  }

  private cardHolder(ctx: GameContext, id: unknown) {
    const player = ctx.player(id);
    if (player.role !== 'PLAYER' || !cardOf(player))
      throw new GameError('У игрока нет карты');
    return player;
  }

  private mutate(code: string, action: (ctx: GameContext) => void) {
    return this.lock.run(code, () => this.mutateLocked(code, action));
  }

  /** Loads the game, applies `action`, persists changes, broadcasts, reschedules. */
  private async mutateLocked(code: string, action: (ctx: GameContext) => void) {
    const room = await this.rooms.findByCode(code);
    const state = gameOf(room);
    if (room.status !== 'PLAYING' || !state)
      throw new GameError('Игра не идёт');

    const ctx = new GameContext(room, structuredClone(state), (id) =>
      this.presence.isOnline(id),
    );
    action(ctx);
    if (!ctx.changed && ctx.mode === room.mode) return;

    await this.prisma.$transaction([
      ...[...ctx.dirtyPlayers].map((id) => {
        const p = ctx.player(id);
        return this.prisma.player.update({
          where: { id },
          data: {
            isAlive: p.isAlive,
            revealed: p.revealed,
            card: p.card === null ? Prisma.DbNull : toJson(p.card),
          },
        });
      }),
      this.prisma.room.update({
        where: { id: room.id },
        data: {
          game: toJson(ctx.state),
          mode: ctx.mode,
          ...(ctx.finished && { status: 'FINISHED' as const }),
        },
      }),
    ]);

    await this.realtime.broadcast(code);
    this.schedule(code, ctx.state, ctx.isAuto && !ctx.finished);
    // Exiled players lose the right to talk, everyone talks after the end.
    if (ctx.dirtyPlayers.size > 0 || ctx.finished || ctx.voiceChanged) {
      this.voice.syncLater(code);
    }
  }

  private schedule(code: string, state: GameState, auto: boolean) {
    this.clearTimer(code);
    if (!auto || state.phaseEndsAt === null || state.phase === 'FINISHED')
      return;

    const seq = state.seq;
    const delay = Math.max(0, state.phaseEndsAt - Date.now());
    this.timers.set(
      code,
      setTimeout(() => {
        this.timers.delete(code);
        this.mutate(code, (ctx) => {
          if (ctx.state.seq !== seq || !ctx.isAuto) return;
          rules.onPhaseTimeout(ctx);
        }).catch((e: unknown) => {
          if (!(e instanceof GameError)) this.logger.error(e);
        });
      }, delay),
    );
  }

  private clearTimer(code: string) {
    clearTimeout(this.timers.get(code));
    this.timers.delete(code);
  }
}
