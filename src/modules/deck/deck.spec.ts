import { DEFAULT_SETTINGS, mergeSettings } from '../room/room.settings';
import { CardRules } from '../room/room.types';
import { CARD_HINTS } from './card.hints';
import {
  ACTION_NEEDS,
  activeKeys,
  availableActions,
  builtinItems,
  hintsOf,
  pileOf,
} from './deck.rules';
import { DeckService } from './deck.service';

const rules = (patch: Partial<CardRules> = {}) =>
  mergeSettings(DEFAULT_SETTINGS, { cards: patch }).cards;

describe('deck rules', () => {
  it('keeps card order for the characteristics in play', () => {
    expect(activeKeys(rules({ disabled: ['phobia', 'gender'] }))).toEqual([
      'age',
      'profession',
      'health',
      'hobby',
      'baggage',
      'fact',
      'action',
    ]);
  });

  it('removes action cards the host turned off', () => {
    const cards = availableActions(rules({ disabledActions: ['Подозрение'] }));
    expect(cards).not.toContain('Подозрение');
    expect(cards).toHaveLength(builtinItems('action').length - 1);
  });

  it('removes action cards whose characteristics are all out of play', () => {
    const cards = availableActions(rules({ disabled: ['age', 'phobia'] }));
    expect(cards).not.toContain('Реинкарнация');
    expect(cards).not.toContain('Фобия исчезла');
    // Needs health OR phobia — health is still there.
    expect(cards).toContain('Генная терапия');
  });

  it('only names real action cards in ACTION_NEEDS', () => {
    const names = builtinItems('action').map((item) => item.value);
    for (const card of Object.keys(ACTION_NEEDS)) expect(names).toContain(card);
  });

  it('adds custom values to the built-in ones or replaces them', () => {
    const builtin = builtinItems('hobby').length;
    const add = rules({
      custom: {
        hobby: { replace: false, items: [{ value: 'Рыбалка в аномалии' }] },
      },
    });
    const replace = rules({
      custom: {
        hobby: { replace: true, items: [{ value: 'Рыбалка в аномалии' }] },
      },
    });

    expect(pileOf(add, 'hobby')).toHaveLength(builtin + 1);
    expect(pileOf(replace, 'hobby')).toEqual(['Рыбалка в аномалии']);
  });

  it('lets custom descriptions override built-in hints', () => {
    const [item] = builtinItems('health').filter((i) => i.description);
    const hints = hintsOf(
      rules({
        custom: {
          health: {
            replace: false,
            items: [{ value: item.value, description: 'своё' }],
          },
        },
      }),
    );
    expect(hints.get(item.value)).toBe('своё');
    expect(hintsOf(rules())).toBe(CARD_HINTS);
  });
});

describe('DeckService', () => {
  const deck = new DeckService();

  it('deals only the characteristics in play', () => {
    const cards = deck.deal(4, rules({ disabled: ['gender', 'action'] }));
    for (const card of cards) {
      expect(Object.keys(card).sort()).toEqual(
        [
          'age',
          'profession',
          'health',
          'phobia',
          'hobby',
          'baggage',
          'fact',
        ].sort(),
      );
    }
  });

  it('never repeats a value while the pile lasts', () => {
    const cards = deck.deal(8, rules());
    for (const key of ['profession', 'health', 'action'] as const) {
      expect(new Set(cards.map((c) => c[key])).size).toBe(8);
    }
  });

  it('deals custom values', () => {
    const cards = deck.deal(
      3,
      rules({
        custom: { profession: { replace: true, items: [{ value: 'Повар' }] } },
      }),
    );
    expect(cards.map((c) => c.profession)).toEqual(['Повар', 'Повар', 'Повар']);
  });

  it('draws a fresh value when one is left', () => {
    const custom = rules({
      custom: {
        age: { replace: true, items: [{ value: '20' }, { value: '30' }] },
      },
    });
    expect(deck.randomValue(custom, 'age', ['20'])).toBe('30');
    // Everything used — falls back to any value instead of failing.
    expect(['20', '30']).toContain(
      deck.randomValue(custom, 'age', ['20', '30']),
    );
  });
});
