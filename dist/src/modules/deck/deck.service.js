"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeckService = void 0;
const common_1 = require("@nestjs/common");
const characters_1 = require("./data/characters");
let DeckService = class DeckService {
    constructor() { }
    generatePlayerCard() {
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
    getRandomItem(category) {
        const cat = characters_1.PROPERTY_CATEGORIES.find((c) => c.category === category);
        if (!cat)
            return null;
        const randomIndex = Math.floor(Math.random() * cat.items.length);
        const randomVal = cat.items[randomIndex].value;
        return randomVal;
    }
};
exports.DeckService = DeckService;
exports.DeckService = DeckService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], DeckService);
//# sourceMappingURL=deck.service.js.map