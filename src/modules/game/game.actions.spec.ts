import { Player } from '@prisma/client';

import { makeGame } from '../../testing/fixtures';
import { DeckService } from '../deck/deck.service';
import { cardOf } from '../room/room.view';
import {
  ActionDeps,
  blockedReason,
  executeAction,
  myActionView,
} from './game.actions';
import * as rules from './game.rules';

const deck = new DeckService();
const deps: ActionDeps = {
  randomValue: (cards, key, exclude) => deck.randomValue(cards, key, exclude),
};

/** Gives `player` this action card. */
const holding = (player: Player, card: string) => {
  player.card = { ...cardOf(player), action: card };
  return player;
};

/** A game in round 1, after the intro. */
const started = (options: Parameters<typeof makeGame>[0] = {}) => {
  const game = makeGame(options);
  rules.startRound(game.ctx);
  return game;
};

describe('action cards', () => {
  it('cannot be played during the intro', () => {
    const { ctx, players } = makeGame();
    expect(blockedReason(ctx, holding(players[0], 'Иммунитет'))).toMatch(
      'после начала раунда',
    );
  });

  it('is used once and becomes public', () => {
    const { ctx, players } = started();
    const actor = holding(players[1], 'Иммунитет');

    executeAction(ctx, actor, {}, deps);
    expect(actor.revealed).toContain('action');
    expect(ctx.isImmune(actor.id)).toBe(true);
    expect(blockedReason(ctx, actor)).toBe('Карта уже сыграна');
  });

  it('respects the "own turn only" room rule', () => {
    const { ctx, players } = started({
      settings: { actions: { timing: 'OWN_TURN' } },
    });
    expect(blockedReason(ctx, holding(players[0], 'Иммунитет'))).toBeNull(); // speaker
    expect(blockedReason(ctx, holding(players[1], 'Иммунитет'))).toMatch(
      'только в свой ход',
    );
  });

  it('«Выборочный обмен» swaps one characteristic', () => {
    const { ctx, players } = started();
    const [actor, target] = players;
    holding(actor, 'Выборочный обмен');
    const before = [cardOf(actor)!.hobby, cardOf(target)!.hobby];

    executeAction(ctx, actor, { targetId: target.id, key: 'hobby' }, deps);
    expect([cardOf(actor)!.hobby, cardOf(target)!.hobby]).toEqual(
      before.reverse(),
    );
  });

  it('offers and accepts only characteristics in play', () => {
    const { ctx, players } = started({
      settings: { cards: { disabled: ['hobby'] } },
    });
    const [actor, target] = players;
    holding(actor, 'Выборочный обмен');

    expect(myActionView(ctx, actor)!.keys).not.toContain('hobby');
    expect(() =>
      executeAction(ctx, actor, { targetId: target.id, key: 'hobby' }, deps),
    ).toThrow('Выберите характеристику');
  });

  it('«Подозрение» reveals something hidden of the target', () => {
    const { ctx, players } = started();
    const [actor, target] = players;
    executeAction(
      ctx,
      holding(actor, 'Подозрение'),
      { targetId: target.id },
      deps,
    );
    expect(target.revealed).toHaveLength(1);
  });

  it('«Проверка досье» is a private peek', () => {
    const { ctx, players } = started();
    const [actor, target] = players;
    executeAction(
      ctx,
      holding(actor, 'Проверка досье'),
      { targetId: target.id, key: 'health' },
      deps,
    );

    expect(target.revealed).not.toContain('health');
    expect(ctx.state.peeks![actor.id]).toEqual([
      { playerId: target.id, key: 'health' },
    ]);
  });

  it('cannot target yourself unless the card allows it', () => {
    const { ctx, players } = started();
    const actor = holding(players[0], 'Подозрение');
    expect(() =>
      executeAction(ctx, actor, { targetId: actor.id }, deps),
    ).toThrow('Нельзя выбрать себя');
  });

  it('«Экспериментальное лечение» never touches a phobia that is out of play', () => {
    const { ctx, players } = started({
      settings: { cards: { disabled: ['phobia'] } },
    });
    const [actor, target] = players;
    for (let i = 0; i < 20; i++) {
      target.card = { ...cardOf(target) };
      ctx.state.usedActions = [];
      executeAction(
        ctx,
        holding(actor, 'Экспериментальное лечение'),
        { targetId: target.id },
        deps,
      );
    }
    expect(cardOf(target)!.health).toBe('Полностью здоров');
    expect(cardOf(target)!.phobia).toBeUndefined();
  });
});
