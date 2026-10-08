import { PROPERTY_CATEGORIES } from './data/characters';

/** Card value → its description (action cards, illnesses, phobias, …). */
export const CARD_HINTS: ReadonlyMap<string, string> = new Map(
  PROPERTY_CATEGORIES.flatMap((category) =>
    category.items
      .filter((item) => item.description)
      .map((item) => {
        const text = item.description!.trim();
        return [
          item.value,
          text.charAt(0).toUpperCase() + text.slice(1),
        ] as const;
      }),
  ),
);
