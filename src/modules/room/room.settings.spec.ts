import { builtinItems } from '../deck/deck.rules';
import { DEFAULT_SETTINGS, mergeSettings } from './room.settings';

const merge = (patch: unknown) => mergeSettings(DEFAULT_SETTINGS, patch);

describe('mergeSettings', () => {
  it('keeps the base when there is no patch', () => {
    expect(merge(undefined)).toBe(DEFAULT_SETTINGS);
  });

  it('only changes the fields in the patch', () => {
    const next = merge({ timers: { voting: 45 } });
    expect(next.timers).toEqual({ ...DEFAULT_SETTINGS.timers, voting: 45 });
    expect(next.cards).toEqual(DEFAULT_SETTINGS.cards);
    expect(next.scenario).toEqual(DEFAULT_SETTINGS.scenario);
  });

  it('does not mutate the base settings', () => {
    const snapshot = structuredClone(DEFAULT_SETTINGS);
    merge({
      cards: { disabled: ['gender'] },
      scenario: { bunker: { kind: 'PRESET', id: 'x18' } },
    });
    expect(DEFAULT_SETTINGS).toEqual(snapshot);
  });

  describe('title', () => {
    it('collapses whitespace and keeps letters intact', () => {
      expect(merge({ title: '  sss   room\tx ' }).title).toBe('sss room x');
    });

    it.each(['', '   ', 'x'.repeat(41), 42])('rejects %p', (title) => {
      expect(() => merge({ title })).toThrow('Название комнаты');
    });
  });

  describe('seats', () => {
    it('accepts a number or null (half of the players)', () => {
      expect(merge({ seats: 3 }).seats).toBe(3);
      expect(
        mergeSettings(merge({ seats: 3 }), { seats: null }).seats,
      ).toBeNull();
    });

    it.each([0, 16, 2.5, '3'])('rejects %p', (seats) => {
      expect(() => merge({ seats })).toThrow('Мест в бункере');
    });
  });

  describe('cards', () => {
    it('leaves characteristics out of the game', () => {
      const { cards } = merge({
        cards: { disabled: ['gender', 'gender', 'phobia'] },
      });
      expect(cards.disabled).toEqual(['gender', 'phobia']);
    });

    it('rejects unknown characteristics', () => {
      expect(() => merge({ cards: { disabled: ['wings'] } })).toThrow(
        'Неизвестная характеристика',
      );
    });

    it('needs at least one characteristic besides the action card', () => {
      const all = [
        'gender',
        'age',
        'profession',
        'health',
        'phobia',
        'hobby',
        'baggage',
        'fact',
      ];
      expect(() => merge({ cards: { disabled: all } })).toThrow(
        'хотя бы одну характеристику',
      );
    });

    it('needs at least one action card while «Действие» is in play', () => {
      const every = builtinItems('action').map((item) => item.value);
      expect(() => merge({ cards: { disabledActions: every } })).toThrow(
        'ни одной карты действия',
      );
      // Without the action characteristic, no action cards are needed.
      expect(
        merge({ cards: { disabled: ['action'], disabledActions: every } }).cards
          .disabledActions,
      ).toHaveLength(every.length);
    });

    it('rejects unknown action cards', () => {
      expect(() => merge({ cards: { disabledActions: ['Телепорт'] } })).toThrow(
        'Неизвестная карта',
      );
    });

    it('trims and dedupes custom values', () => {
      const { cards } = merge({
        cards: {
          custom: {
            profession: {
              replace: true,
              items: [
                { value: ' Повар ' },
                { value: 'Повар' },
                { value: 'Сталкер', description: ' ходит ' },
              ],
            },
          },
        },
      });
      expect(cards.custom.profession).toEqual({
        replace: true,
        items: [{ value: 'Повар' }, { value: 'Сталкер', description: 'ходит' }],
      });
    });

    it('drops an empty "add" list but rejects an empty "replace" list', () => {
      expect(
        merge({ cards: { custom: { hobby: { replace: false, items: [] } } } })
          .cards.custom,
      ).toEqual({});
      expect(() =>
        merge({ cards: { custom: { age: { replace: true, items: [] } } } }),
      ).toThrow('добавьте хотя бы одно значение');
    });

    it('does not allow custom action cards — they have mechanics', () => {
      expect(() =>
        merge({
          cards: {
            custom: { action: { replace: true, items: [{ value: 'x' }] } },
          },
        }),
      ).toThrow('Нельзя задать свои значения');
    });

    it('limits the number and length of custom values', () => {
      const many = Array.from({ length: 151 }, (_, i) => ({ value: `v${i}` }));
      expect(() =>
        merge({ cards: { custom: { hobby: { items: many } } } }),
      ).toThrow('не больше 150');
      expect(() =>
        merge({
          cards: { custom: { hobby: { items: [{ value: 'x'.repeat(61) }] } } },
        }),
      ).toThrow('Хобби');
    });
  });

  describe('scenario', () => {
    it('accepts random, a built-in and a custom one', () => {
      const { scenario } = merge({
        scenario: {
          catastrophe: { kind: 'PRESET', id: 'emission' },
          bunker: {
            kind: 'CUSTOM',
            value: {
              title: ' Метро ',
              description: 'd',
              area: '10',
              supplies: 's',
              features: ['a', '  ', 'b'],
            },
          },
        },
      });
      expect(scenario.catastrophe).toEqual({ kind: 'PRESET', id: 'emission' });
      expect(scenario.bunker).toEqual({
        kind: 'CUSTOM',
        value: {
          title: 'Метро',
          description: 'd',
          area: '10',
          supplies: 's',
          features: ['a', 'b'],
        },
      });
    });

    it('rejects unknown presets and incomplete custom text', () => {
      expect(() =>
        merge({ scenario: { catastrophe: { kind: 'PRESET', id: 'nope' } } }),
      ).toThrow('Такого сценария нет');
      expect(() =>
        merge({
          scenario: {
            catastrophe: {
              kind: 'CUSTOM',
              value: { title: 'x', description: '' },
            },
          },
        }),
      ).toThrow('Катастрофа: описание');
    });
  });
});
