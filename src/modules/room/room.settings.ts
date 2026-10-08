import { GameError } from '../../common/game-error';
import {
  ActionApproval,
  ActionTiming,
  GameMode,
  RoomSettings,
  RoomTimers,
} from './room.types';

export const PLAYER_LIMITS = {
  /** Minimal players to start. Override with MIN_PLAYERS for local testing. */
  min: Number(process.env.MIN_PLAYERS) || 4,
  max: 16,
};

const TIMER_LIMITS: Record<keyof RoomTimers, [number, number]> = {
  reveal: [15, 180],
  discussion: [30, 600],
  voting: [10, 120],
  defense: [15, 120],
};

const TIMER_LABELS: Record<keyof RoomTimers, string> = {
  reveal: 'Время на раскрытие',
  discussion: 'Время на обсуждение',
  voting: 'Время на голосование',
  defense: 'Время на оправдание',
};

export const TITLE_MAX_LENGTH = 40;

export const DEFAULT_SETTINGS: RoomSettings = {
  title: '',
  isPublic: true,
  mode: 'AUTO',
  maxPlayers: 12,
  timers: { reveal: 60, discussion: 180, voting: 30, defense: 45 },
  actions: { timing: 'ANYTIME', approval: 'AUTO' },
};

const ACTION_TIMINGS: ActionTiming[] = ['ANYTIME', 'OWN_TURN'];
const ACTION_APPROVALS: ActionApproval[] = ['AUTO', 'MODERATOR'];

const MODES: GameMode[] = ['AUTO', 'MODERATED'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const intInRange = (
  value: unknown,
  [min, max]: [number, number],
  label: string,
): number => {
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  ) {
    throw new GameError(`${label}: допустимо от ${min} до ${max}`);
  }
  return value as number;
};

/** Applies an untrusted partial settings patch on top of `base`. */
export const mergeSettings = (
  base: RoomSettings,
  patch: unknown,
): RoomSettings => {
  if (patch === undefined) return base;
  if (!isObject(patch)) throw new GameError('Некорректные настройки');

  const next: RoomSettings = {
    ...base,
    timers: { ...base.timers },
    actions: { ...base.actions },
  };

  if (patch.title !== undefined) {
    const title =
      typeof patch.title === 'string'
        ? patch.title.trim().replace(/s+/g, ' ')
        : '';
    if (!title || title.length > TITLE_MAX_LENGTH) {
      throw new GameError(
        `Название комнаты: от 1 до ${TITLE_MAX_LENGTH} символов`,
      );
    }
    next.title = title;
  }

  if (patch.isPublic !== undefined) {
    if (typeof patch.isPublic !== 'boolean') {
      throw new GameError('Некорректная настройка публичности');
    }
    next.isPublic = patch.isPublic;
  }

  if (patch.mode !== undefined) {
    if (!MODES.includes(patch.mode as GameMode)) {
      throw new GameError('Неизвестный режим игры');
    }
    next.mode = patch.mode as GameMode;
  }

  if (patch.maxPlayers !== undefined) {
    next.maxPlayers = intInRange(
      patch.maxPlayers,
      [PLAYER_LIMITS.min, PLAYER_LIMITS.max],
      'Лимит игроков',
    );
  }

  if (patch.timers !== undefined) {
    if (!isObject(patch.timers)) throw new GameError('Некорректные таймеры');
    for (const key of Object.keys(TIMER_LIMITS) as (keyof RoomTimers)[]) {
      if (patch.timers[key] !== undefined) {
        next.timers[key] = intInRange(
          patch.timers[key],
          TIMER_LIMITS[key],
          TIMER_LABELS[key],
        );
      }
    }
  }

  if (patch.actions !== undefined) {
    if (!isObject(patch.actions))
      throw new GameError('Некорректные правила карт');
    const { timing, approval } = patch.actions;
    if (timing !== undefined) {
      if (!ACTION_TIMINGS.includes(timing as ActionTiming)) {
        throw new GameError('Неизвестное правило карт действий');
      }
      next.actions.timing = timing as ActionTiming;
    }
    if (approval !== undefined) {
      if (!ACTION_APPROVALS.includes(approval as ActionApproval)) {
        throw new GameError('Неизвестное правило одобрения карт');
      }
      next.actions.approval = approval as ActionApproval;
    }
  }

  return next;
};
