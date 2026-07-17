import { Injectable } from '@nestjs/common';
import { IPlayerCard, PROPERTY_CATEGORIES } from './data/characters';

@Injectable()
export class DeckService {
  constructor() {}

  generatePlayerCard(): IPlayerCard {
    return {
      age: this.getRandomItem('age'),
      profession: this.getRandomItem('profession'),
      health: this.getRandomItem('health'),
      fobia: this.getRandomItem('fobia'),
      hobbie: this.getRandomItem('hobbie'),
      bandage: this.getRandomItem('bandage'),
      action: this.getRandomItem('action'),
      fact: this.getRandomItem('fact'),
    };
  }

  private getRandomItem(category: string): string | null {
    const cat = PROPERTY_CATEGORIES.find((c) => c.category === category);
    if (!cat) return null;
    const randomIndex = Math.floor(Math.random() * cat.items.length);
    const randomVal = cat.items[randomIndex].value;

    return randomVal;
  }
}
