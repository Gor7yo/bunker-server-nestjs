import type { CardItem, CardRules } from '../room/room.types';
import { CARD_HINTS } from './card.hints';
import { CARD_KEYS, CardKey } from './card.types';
import { PROPERTY_CATEGORIES } from './data/characters';

/**
 * Characteristics an action card works with: it stays in the deck only if
 * at least one of them is in play (e.g. «Реинкарнация» needs the age).
 */
export const ACTION_NEEDS: Readonly<Record<string, CardKey[]>> = {
  Реинкарнация: ['age'],
  Переквалификация: ['profession'],
  'Фобия исчезла': ['phobia'],
  'Сброс здоровья': ['health'],
  'Генная терапия': ['health', 'phobia'],
  Наследие: ['profession'],
  'Экспериментальное лечение': ['health'],
};

/** Built-in values with their (normalized) descriptions. */
export const builtinItems = (key: CardKey): CardItem[] =>
  (PROPERTY_CATEGORIES.find((c) => c.category === key)?.items ?? []).map(
    ({ value }) => {
      const description = CARD_HINTS.get(value);
      return description ? { value, description } : { value };
    },
  );

/** Characteristics that are dealt in this room, in card order. */
export const activeKeys = (rules: CardRules): CardKey[] =>
  CARD_KEYS.filter((key) => !rules.disabled.includes(key));

/** Action cards that can be dealt with these rules. */
export const availableActions = (rules: CardRules): string[] => {
  const active = activeKeys(rules);
  return builtinItems('action')
    .map((item) => item.value)
    .filter((value) => {
      const needs = ACTION_NEEDS[value];
      return (
        !rules.disabledActions.includes(value) &&
        (!needs || needs.some((key) => active.includes(key)))
      );
    });
};

/** All values a characteristic can take in this room. */
export const pileOf = (rules: CardRules, key: CardKey): string[] => {
  if (key === 'action') return availableActions(rules);
  const custom = rules.custom[key];
  const items = custom?.replace
    ? custom.items
    : [...builtinItems(key), ...(custom?.items ?? [])];
  return [...new Set(items.map((item) => item.value))];
};

/** Card value → description, custom descriptions win over built-in ones. */
export const hintsOf = (rules: CardRules): ReadonlyMap<string, string> => {
  const custom = Object.values(rules.custom).flatMap((deck) =>
    (deck?.items ?? []).flatMap((item) =>
      item.description ? [[item.value, item.description] as const] : [],
    ),
  );
  return custom.length === 0 ? CARD_HINTS : new Map([...CARD_HINTS, ...custom]);
};
