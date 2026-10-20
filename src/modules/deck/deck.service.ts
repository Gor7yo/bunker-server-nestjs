import { Injectable } from '@nestjs/common';
import type { CardRules } from '../room/room.types';
import { CardKey, PlayerCard } from './card.types';
import { activeKeys, pileOf } from './deck.rules';

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
   * Deals `count` cards with the room's characteristics. Every one is drawn
   * without replacement, so players never share a value unless a category
   * runs out of items.
   */
  deal(count: number, rules: CardRules): PlayerCard[] {
    const keys = activeKeys(rules);
    const piles = new Map<CardKey, string[]>(
      keys.map((key) => [key, shuffle(this.valuesOf(rules, key))]),
    );

    return Array.from({ length: count }, (_, i) => {
      const card: PlayerCard = {};
      for (const key of keys) {
        const pile = piles.get(key)!;
        card[key] = pile[i % pile.length];
      }
      return card;
    });
  }

  /** Random value of one characteristic, avoiding `exclude` when possible. */
  randomValue(rules: CardRules, key: CardKey, exclude: string[] = []): string {
    const values = this.valuesOf(rules, key);
    const fresh = values.filter((value) => !exclude.includes(value));
    const pool = fresh.length > 0 ? fresh : values;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private valuesOf(rules: CardRules, key: CardKey): string[] {
    const values = pileOf(rules, key);
    if (values.length === 0) throw new Error(`Deck category "${key}" is empty`);
    return values;
  }
}
