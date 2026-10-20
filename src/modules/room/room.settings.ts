import { GameError } from '../../common/game-error';
import { CARD_LABELS, CardKey, isCardKey } from '../deck/card.types';
import { activeKeys, availableActions, builtinItems } from '../deck/deck.rules';
import { BUNKERS, CATASTROPHES } from '../game/data/scenarios';
import {
  ActionApproval,
  ActionTiming,
  BunkerText,
  CardItem,
  CardRules,
  CatastropheText,
  CustomDeck,
  GameMode,
  RoomSettings,
  RoomTimers,
  ScenarioChoice,
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
  seats: null,
  cards: { disabled: [], disabledActions: [], custom: {} },
  scenario: { catastrophe: { kind: 'RANDOM' }, bunker: { kind: 'RANDOM' } },
};

/** Limits for host-written content, keep the room JSON small. */
export const CUSTOM_LIMITS = {
  items: 150,
  value: 60,
  description: 300,
  title: 60,
  text: 1000,
  short: 60,
  features: 8,
  feature: 120,
};

const ACTION_TIMINGS: ActionTiming[] = ['ANYTIME', 'OWN_TURN'];
const ACTION_APPROVALS: ActionApproval[] = ['AUTO', 'MODERATOR'];

const MODES: GameMode[] = ['AUTO', 'MODERATED'];

/** Trimmed text of 1..max chars (0..max if optional). */
const text = (
  value: unknown,
  max: number,
  label: string,
  optional = false,
): string => {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((!result && !optional) || result.length > max) {
    throw new GameError(
      `${label}: ${optional ? 'до' : 'от 1 до'} ${max} символов`,
    );
  }
  return result;
};

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
    scenario: { ...base.scenario },
  };

  if (patch.title !== undefined) {
    const title =
      typeof patch.title === 'string'
        ? patch.title.trim().replace(/\s+/g, ' ')
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

  if (patch.seats !== undefined) {
    next.seats =
      patch.seats === null
        ? null
        : intInRange(patch.seats, [1, PLAYER_LIMITS.max - 1], 'Мест в бункере');
  }

  if (patch.cards !== undefined) {
    next.cards = mergeCards(next.cards, patch.cards);
  }

  if (patch.scenario !== undefined) {
    if (!isObject(patch.scenario)) throw new GameError('Некорректный сценарий');
    const { catastrophe, bunker } = patch.scenario;
    if (catastrophe !== undefined) {
      next.scenario.catastrophe = parseChoice(
        catastrophe,
        CATASTROPHES,
        parseCatastrophe,
      );
    }
    if (bunker !== undefined) {
      next.scenario.bunker = parseChoice(bunker, BUNKERS, parseBunker);
    }
  }

  return next;
};

// ---- characteristics ------------------------------------------------------

/** Each given field replaces the stored one. */
const mergeCards = (base: CardRules, patch: unknown): CardRules => {
  if (!isObject(patch)) throw new GameError('Некорректные настройки карт');
  const next = { ...base };

  if (patch.disabled !== undefined) {
    if (!Array.isArray(patch.disabled) || !patch.disabled.every(isCardKey)) {
      throw new GameError('Неизвестная характеристика');
    }
    next.disabled = [...new Set(patch.disabled)];
  }

  if (patch.disabledActions !== undefined) {
    const known = builtinItems('action').map((item) => item.value);
    const list: unknown = patch.disabledActions;
    if (
      !Array.isArray(list) ||
      !list.every((v) => typeof v === 'string' && known.includes(v))
    ) {
      throw new GameError('Неизвестная карта действия');
    }
    next.disabledActions = [...new Set(list as string[])];
  }

  if (patch.custom !== undefined) {
    if (!isObject(patch.custom)) {
      throw new GameError('Некорректные значения карт');
    }
    const custom: CardRules['custom'] = {};
    for (const [key, deck] of Object.entries(patch.custom)) {
      if (!isCardKey(key) || key === 'action') {
        throw new GameError(`Нельзя задать свои значения для «${key}»`);
      }
      const parsed = deck === null ? null : parseDeck(deck, key);
      if (parsed) custom[key] = parsed;
    }
    next.custom = custom;
  }

  const active = activeKeys(next);
  if (!active.some((key) => key !== 'action')) {
    throw new GameError('Оставьте в игре хотя бы одну характеристику');
  }
  if (active.includes('action') && availableActions(next).length === 0) {
    throw new GameError(
      'Не осталось ни одной карты действия: включите карты или уберите характеристику «Действие»',
    );
  }
  return next;
};

/** null — nothing custom left for this characteristic. */
const parseDeck = (raw: unknown, key: CardKey): CustomDeck | null => {
  const label = CARD_LABELS[key];
  if (!isObject(raw) || !Array.isArray(raw.items)) {
    throw new GameError(`${label}: некорректный список значений`);
  }
  if (raw.items.length > CUSTOM_LIMITS.items) {
    throw new GameError(`${label}: не больше ${CUSTOM_LIMITS.items} значений`);
  }

  const items = new Map<string, CardItem>();
  for (const item of raw.items as unknown[]) {
    if (!isObject(item)) throw new GameError(`${label}: некорректное значение`);
    const value = text(item.value, CUSTOM_LIMITS.value, label);
    const description = text(
      item.description,
      CUSTOM_LIMITS.description,
      `${label} «${value}», описание`,
      true,
    );
    items.set(value, description ? { value, description } : { value });
  }

  const replace = raw.replace === true;
  if (items.size === 0) {
    if (replace) {
      throw new GameError(`${label}: добавьте хотя бы одно значение`);
    }
    return null;
  }
  return { replace, items: [...items.values()] };
};

// ---- scenario -------------------------------------------------------------

const parseChoice = <T>(
  raw: unknown,
  presets: { id: string }[],
  parseCustom: (value: Record<string, unknown>) => T,
): ScenarioChoice<T> => {
  if (!isObject(raw)) throw new GameError('Некорректный сценарий');
  switch (raw.kind) {
    case 'RANDOM':
      return { kind: 'RANDOM' };
    case 'PRESET':
      if (!presets.some((p) => p.id === raw.id)) {
        throw new GameError('Такого сценария нет');
      }
      return { kind: 'PRESET', id: raw.id as string };
    case 'CUSTOM':
      if (!isObject(raw.value)) throw new GameError('Некорректный сценарий');
      return { kind: 'CUSTOM', value: parseCustom(raw.value) };
    default:
      throw new GameError('Некорректный сценарий');
  }
};

const L = CUSTOM_LIMITS;

const parseCatastrophe = (v: Record<string, unknown>): CatastropheText => ({
  title: text(v.title, L.title, 'Катастрофа: название'),
  description: text(v.description, L.text, 'Катастрофа: описание'),
  stay: text(v.stay, L.short, 'Катастрофа: срок в бункере'),
});

const parseBunker = (v: Record<string, unknown>): BunkerText => {
  const features: unknown = v.features ?? [];
  if (!Array.isArray(features) || features.length > L.features) {
    throw new GameError(`Бункер: не больше ${L.features} особенностей`);
  }
  return {
    title: text(v.title, L.title, 'Бункер: название'),
    description: text(v.description, L.text, 'Бункер: описание'),
    area: text(v.area, L.short, 'Бункер: площадь'),
    supplies: text(v.supplies, L.short, 'Бункер: запасы'),
    features: (features as unknown[])
      .map((f) => text(f, L.feature, 'Бункер: особенность', true))
      .filter(Boolean),
  };
};
