import { Injectable } from '@nestjs/common';
import { CARD_KEYS, CardKey, PlayerCard } from './card.types';
import { PROPERTY_CATEGORIES } from './data/characters';

const shuffle = <T>(items: readonly T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

@Injectable()
export class DeckService {
  /**
   * Deals `count` cards. Every characteristic is drawn without replacement,
   * so players never share a value unless a category runs out of items.
   */
  deal(count: number): PlayerCard[] {
    const piles = new Map<CardKey, string[]>(
      CARD_KEYS.map((key) => [key, shuffle(this.valuesOf(key))]),
    );

    return Array.from({ length: count }, (_, i) => {
      const card = {} as PlayerCard;
      for (const key of CARD_KEYS) {
        const pile = piles.get(key)!;
        card[key] = pile[i % pile.length];
      }
      return card;
    });
  }

  /** Random value of one characteristic, avoiding `exclude` when possible. */
  randomValue(key: CardKey, exclude: string[] = []): string {
    const values = this.valuesOf(key);
    const fresh = values.filter((value) => !exclude.includes(value));
    const pool = fresh.length > 0 ? fresh : values;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private valuesOf(key: CardKey): string[] {
    const category = PROPERTY_CATEGORIES.find((c) => c.category === key);
    if (!category || category.items.length === 0) {
      throw new Error(`Deck category "${key}" is empty`);
    }
    return category.items.map((item) => item.value);
  }
}
