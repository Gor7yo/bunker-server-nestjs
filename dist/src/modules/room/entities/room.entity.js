"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Room = void 0;
class Room {
    code;
    players = [];
    maxPlayers = 12;
    usedCards;
    gameState = 'WAITING';
    createdAt = new Date();
    constructor(code) {
        this.code = code;
        this.usedCards = {
            age: new Set(),
            profession: new Set(),
            health: new Set(),
            fobia: new Set(),
            hobbie: new Set(),
            bandage: new Set(),
            action: new Set(),
            fact: new Set(),
        };
    }
    addPlayer(player) {
        if (this.players.length >= this.maxPlayers) {
            return false;
        }
        this.players.push(player);
        return true;
    }
    removePlayer(playerId) {
        this.players = this.players.filter((p) => p.id !== playerId);
    }
    getPlayer(playerId) {
        return this.players.find((p) => p.id === playerId);
    }
    setReady(playerId) {
        const player = this.getPlayer(playerId);
        if (player) {
            player.isReady = !player.isReady;
        }
    }
    setUsedCards(playerId) {
        const player = this.getPlayer(playerId);
        if (!player?.characters)
            return;
        const characterKeys = Object.keys(player.characters);
        for (const key of characterKeys) {
            const value = player.characters[key];
            if (value) {
                this.usedCards[key].add(value);
            }
        }
        return this.usedCards;
    }
    allReady() {
        const notHostPlayers = this.players.filter((p) => !p.isHost);
        if (notHostPlayers.length === 0)
            return false;
        return notHostPlayers.every((p) => p.isReady === true);
    }
    getHost() {
        return this.players.find((p) => p.isHost === true);
    }
}
exports.Room = Room;
//# sourceMappingURL=room.entity.js.map