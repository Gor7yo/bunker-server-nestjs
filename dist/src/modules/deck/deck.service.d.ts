import { CardKey, PlayerCard } from './card.types';
export declare class DeckService {
    deal(count: number): PlayerCard[];
    randomValue(key: CardKey, exclude?: string[]): string;
    private valuesOf;
}
