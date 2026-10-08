import { Player } from '@prisma/client';
import { randomInt } from 'crypto';

import { GameError } from '../../common/game-error';
import { CARD_HINTS } from '../deck/card.hints';
import { CARD_KEYS, CARD_LABELS, CardKey, isCardKey } from '../deck/card.types';
import { cardOf } from '../room/room.view';
import { GameContext } from './game.context';
import { ActionParams, MyActionView } from './game.types';

/** Randomness and the deck, injected by GameService. */
export interface ActionDeps {
  randomValue: (key: CardKey, exclude: string[]) => string;
}

type Target = MyActionView['target'];

interface ActionSpec {
  target: Target;
  /** Allowed characteristics for 'playerKey'. */
  keys?: CardKey[];
  allowSelf?: boolean;
  /** Overrides the room timing rule: the card only makes sense in this phase. */
  onlyInExile?: boolean;
  run: (
    ctx: GameContext,
    actor: Player,
    params: Resolved,
    deps: ActionDeps,
  ) => void;
}

interface Resolved {
  target?: Player;
  other?: Player;
  key?: CardKey;
}

const NO_PHOBIA = 'Нет фобии';
const HEALTHY = 'Полностью здоров';
const SWAPPABLE: CardKey[] = CARD_KEYS.filter((key) => key !== 'action');

const pick = <T>(items: readonly T[]): T => items[randomInt(items.length)];
const label = (key: CardKey) => CARD_LABELS[key].toLowerCase();

/** New random value for one characteristic, logged if it's visible. */
function redraw(
  ctx: GameContext,
  player: Player,
  key: CardKey,
  deps: ActionDeps,
) {
  const used = ctx.participants
    .map((p) => cardOf(p)?.[key])
    .filter(Boolean) as string[];
  ctx.setCardValue(player, key, deps.randomValue(key, used));
  if (player.revealed.includes(key)) {
    ctx.log(
      `${player.name}: новое значение «${label(key)}» — ${cardOf(player)![key]}`,
      'reveal',
    );
  }
}

function swapValue(ctx: GameContext, a: Player, b: Player, key: CardKey) {
  const valueA = cardOf(a)![key];
  ctx.setCardValue(a, key, cardOf(b)![key]);
  ctx.setCardValue(b, key, valueA);
}

const SPECS: Record<string, ActionSpec> = {
  'Обмен судьбами': {
    target: 'twoPlayers',
    allowSelf: true,
    run(ctx, _actor, { target, other }) {
      // Every characteristic open on either of them is swapped and stays open.
      const keys = SWAPPABLE.filter(
        (k) => target!.revealed.includes(k) || other!.revealed.includes(k),
      );
      for (const key of keys) {
        swapValue(ctx, target!, other!, key);
        ctx.reveal(target!, key);
        ctx.reveal(other!, key);
      }
      ctx.log(
        `${target!.name} и ${other!.name} поменялись открытыми картами`,
        'reveal',
      );
    },
  },
  'Выборочный обмен': {
    target: 'playerKey',
    keys: SWAPPABLE,
    run(ctx, actor, { target, key }) {
      swapValue(ctx, actor, target!, key!);
      ctx.log(
        `${actor.name} и ${target!.name} поменялись: ${label(key!)}`,
        'reveal',
      );
    },
  },
  Подозрение: {
    target: 'player',
    run(ctx, _actor, { target }) {
      const hidden = ctx.hiddenKeys(target!);
      if (hidden.length === 0) throw new GameError('У игрока всё уже раскрыто');
      const key = pick(hidden);
      ctx.reveal(target!, key);
      ctx.log(
        `${target!.name} раскрывает: ${label(key)} — ${cardOf(target!)![key]}`,
        'reveal',
      );
    },
  },
  'Проверка досье': {
    target: 'playerKey',
    keys: [...CARD_KEYS],
    run: peek,
  },
  'Тайное знание': {
    target: 'playerKey',
    keys: [...CARD_KEYS],
    run: peek,
  },
  'Атака на репутацию': {
    target: 'player',
    run(ctx, _actor, { target }) {
      ctx.state.silenced = [...new Set([...ctx.state.silenced!, target!.id])];
      ctx.voiceChanged = true;
      ctx.log(`${target!.name} лишается слова до конца обсуждения`, 'vote');
    },
  },
  Реинкарнация: {
    target: 'none',
    run: (ctx, actor, _p, deps) => redraw(ctx, actor, 'age', deps),
  },
  Переквалификация: {
    target: 'none',
    run: (ctx, actor, _p, deps) => redraw(ctx, actor, 'profession', deps),
  },
  'Фобия исчезла': {
    target: 'none',
    run(ctx, actor) {
      ctx.setCardValue(actor, 'phobia', NO_PHOBIA);
      ctx.log(`${actor.name} избавился от фобии`, 'reveal');
    },
  },
  'Сброс здоровья': {
    target: 'none',
    run(ctx, _actor, _p, deps) {
      for (const player of ctx.alive) redraw(ctx, player, 'health', deps);
      ctx.log('Все вытягивают новое здоровье', 'reveal');
    },
  },
  'Второй шанс': {
    target: 'exiled',
    run(ctx, _actor, { target }) {
      ctx.revive(target!);
      ctx.log(`${target!.name} возвращается в игру`, 'info');
    },
  },
  Иммунитет: {
    target: 'none',
    run(ctx, actor) {
      const s = ctx.state;
      s.immune = { ...s.immune, [actor.id]: s.round };
      ctx.forgetAsCandidate(actor.id);
      ctx.log(`${actor.name} неприкосновенен до конца раунда`, 'vote');
    },
  },
  Перезапуск: {
    target: 'none',
    run(ctx, _actor, _p, deps) {
      // Simplified: each player redraws a random open characteristic.
      for (const player of ctx.alive) {
        const open = player.revealed.filter(
          (k): k is CardKey => isCardKey(k) && k !== 'action',
        );
        if (open.length > 0) redraw(ctx, player, pick(open), deps);
      }
      ctx.log(
        'Перезапуск: каждый меняет одну открытую характеристику',
        'reveal',
      );
    },
  },
  Исповедь: {
    target: 'player',
    run(ctx, actor, { target }) {
      if (ctx.hiddenKeys(target!).length === 0)
        throw new GameError('У игрока всё уже раскрыто');
      ctx.state.confession = { targetId: target!.id, byId: actor.id };
      ctx.log(
        `${target!.name} должен раскрыть характеристику на свой выбор`,
        'reveal',
      );
    },
  },
  'Генная терапия': {
    target: 'playerKey',
    keys: ['health', 'phobia'],
    allowSelf: true,
    run(ctx, _actor, { target, key }, deps) {
      redraw(ctx, target!, key!, deps);
      if (!target!.revealed.includes(key!))
        ctx.log(`${target!.name}: ${label(key!)} изменено`, 'reveal');
    },
  },
  Наследие: {
    target: 'none',
    run(ctx, actor) {
      ctx.state.legacy = [...new Set([...ctx.state.legacy!, actor.id])];
      ctx.log(`Если ${actor.name} изгонят, профессия перейдёт соседу`, 'info');
    },
  },
  'Религиозный фанатизм': {
    target: 'none',
    onlyInExile: true,
    run(ctx, actor) {
      const s = ctx.state;
      const exiled = ctx.player(s.lastExiledId);
      ctx.revive(exiled);
      ctx.log(`Пророк ${actor.name} отменил изгнание ${exiled.name}`, 'vote');
    },
  },
  'Экспериментальное лечение': {
    target: 'player',
    allowSelf: true,
    run(ctx, _actor, { target }, deps) {
      ctx.setCardValue(target!, 'health', HEALTHY);
      ctx.log(`${target!.name} вылечен`, 'reveal');
      if (randomInt(2) === 0) {
        redraw(ctx, target!, 'phobia', deps);
        ctx.log(`Побочный эффект: у ${target!.name} новая фобия`, 'reveal');
      }
    },
  },
};

function peek(ctx: GameContext, actor: Player, { target, key }: Resolved) {
  if (target!.revealed.includes(key!))
    throw new GameError('Это уже раскрыто — выберите скрытое');
  const peeks = ctx.state.peeks!;
  peeks[actor.id] = [
    ...(peeks[actor.id] ?? []),
    { playerId: target!.id, key: key! },
  ];
  ctx.log(
    `${actor.name} тайно узнал «${label(key!)}» у ${target!.name}`,
    'info',
  );
}

// ---- public API -----------------------------------------------------------

export const actionValueOf = (player: Player) => cardOf(player)?.action ?? null;

export const specOf = (value: string | null) =>
  value ? (SPECS[value] ?? null) : null;

/** Why `actor` can't play their card now, or null. Approval waits are separate. */
export function blockedReason(ctx: GameContext, actor: Player): string | null {
  const s = ctx.state;
  const spec = specOf(actionValueOf(actor));
  if (!spec) return 'У этой карты нет действия';
  if (s.usedActions!.includes(actor.id)) return 'Карта уже сыграна';
  if (s.pendingActions!.some((a) => a.playerId === actor.id))
    return 'Ждёт одобрения ведущего';
  if (!ctx.isAlivePlayer(actor.id)) return 'Вы выбыли из игры';
  if (s.phase === 'INTRO' || s.phase === 'FINISHED')
    return 'Карты играют после начала раунда';

  if (spec.onlyInExile) {
    const exiled = s.lastExiledId ? ctx.player(s.lastExiledId) : null;
    const canCancel =
      s.phase === 'EXILE' && exiled && !exiled.isAlive && !exiled.hasLeft;
    return canCancel ? null : 'Можно сыграть только сразу после изгнания';
  }
  if (ctx.settings.actions.timing === 'OWN_TURN') {
    const myTurn =
      s.speakerId === actor.id &&
      (s.phase === 'REVEAL' || s.phase === 'DEFENSE');
    if (!myTurn) return 'По правилам комнаты — только в свой ход';
  }
  return null;
}

/** Validates params against the card and resolves players. */
export function resolveParams(
  ctx: GameContext,
  actor: Player,
  params: ActionParams,
): Resolved {
  const spec = specOf(actionValueOf(actor))!;
  const alive = (id: unknown) => {
    const p = ctx.alive.find((x) => x.id === id);
    if (!p) throw new GameError('Выберите игрока, который ещё в игре');
    if (p.id === actor.id && !spec.allowSelf)
      throw new GameError('Нельзя выбрать себя');
    return p;
  };

  switch (spec.target) {
    case 'none':
      return {};
    case 'player':
      return { target: alive(params.targetId) };
    case 'playerKey': {
      if (
        !isCardKey(params.key) ||
        !(spec.keys ?? CARD_KEYS).includes(params.key)
      ) {
        throw new GameError('Выберите характеристику');
      }
      return { target: alive(params.targetId), key: params.key };
    }
    case 'twoPlayers': {
      const target = alive(params.targetId);
      const other = alive(params.otherId);
      if (target.id === other.id)
        throw new GameError('Выберите двух разных игроков');
      return { target, other };
    }
    case 'exiled': {
      const target = ctx.participants.find((p) => p.id === params.targetId);
      if (!target || target.isAlive || target.hasLeft)
        throw new GameError('Выберите изгнанного игрока');
      return { target };
    }
  }
}

/** Applies the card: the effect, then the card itself becomes public. */
export function executeAction(
  ctx: GameContext,
  actor: Player,
  params: ActionParams,
  deps: ActionDeps,
) {
  const value = actionValueOf(actor)!;
  const spec = specOf(value)!;
  const resolved = resolveParams(ctx, actor, params);

  ctx.state.usedActions = [...ctx.state.usedActions!, actor.id];
  ctx.reveal(actor, 'action');
  ctx.log(`${actor.name} играет карту «${value}»`, 'vote');
  spec.run(ctx, actor, resolved, deps);
}

export function myActionView(
  ctx: GameContext,
  viewer: Player,
): MyActionView | null {
  if (viewer.role !== 'PLAYER') return null;
  const value = actionValueOf(viewer);
  const spec = specOf(value);
  if (!value || !spec) return null;

  return {
    value,
    description: CARD_HINTS.get(value) ?? null,
    target: spec.target,
    keys: spec.keys ?? [],
    allowSelf: spec.allowSelf ?? false,
    used: ctx.state.usedActions!.includes(viewer.id),
    pending: ctx.state.pendingActions!.some((a) => a.playerId === viewer.id),
    blockedReason: blockedReason(ctx, viewer),
  };
}
