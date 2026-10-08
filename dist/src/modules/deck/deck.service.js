"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeckService = void 0;
const common_1 = require("@nestjs/common");
const card_types_1 = require("./card.types");
const characters_1 = require("./data/characters");
const shuffle = (items) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
};
let DeckService = class DeckService {
    deal(count) {
        const piles = new Map(card_types_1.CARD_KEYS.map((key) => [key, shuffle(this.valuesOf(key))]));
        return Array.from({ length: count }, (_, i) => {
            const card = {};
            for (const key of card_types_1.CARD_KEYS) {
                const pile = piles.get(key);
                card[key] = pile[i % pile.length];
            }
            return card;
        });
    }
    randomValue(key, exclude = []) {
        const values = this.valuesOf(key);
        const fresh = values.filter((value) => !exclude.includes(value));
        const pool = fresh.length > 0 ? fresh : values;
        return pool[Math.floor(Math.random() * pool.length)];
    }
    valuesOf(key) {
        const category = characters_1.PROPERTY_CATEGORIES.find((c) => c.category === key);
        if (!category || category.items.length === 0) {
            throw new Error(`Deck category "${key}" is empty`);
        }
        return category.items.map((item) => item.value);
    }
};
exports.DeckService = DeckService;
exports.DeckService = DeckService = __decorate([
    (0, common_1.Injectable)()
], DeckService);
//# sourceMappingURL=deck.service.js.map