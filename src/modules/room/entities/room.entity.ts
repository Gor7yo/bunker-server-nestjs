import { IPlayer } from 'src/common/interfaces/player.interface';
import { IPlayerCard, UsedCards } from 'src/modules/deck/data/characters';

export type GameState = 'WAITING' | 'READY_CHECK' | 'GAME_RUNNING' | 'FINISHED';

export class Room {
  code: string;
  players: IPlayer[] = [];
  maxPlayers: number = 12;
  usedCards: {
    age: Set<string>;
    profession: Set<string>;
    health: Set<string>;
    fobia: Set<string>;
    hobbie: Set<string>;
    bandage: Set<string>;
    action: Set<string>;
    fact: Set<string>;
  };
  gameState: GameState = 'WAITING';
  createdAt: Date = new Date();

  constructor(code: string) {
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

  addPlayer(player: IPlayer): boolean {
    if (this.players.length >= this.maxPlayers) {
      return false;
    }
    this.players.push(player);
    return true;
  }

  removePlayer(playerId: string): void {
    this.players = this.players.filter((p) => p.id !== playerId);
  }

  getPlayer(playerId: string): IPlayer | undefined {
    return this.players.find((p) => p.id === playerId);
  }

  setReady(playerId: string): void {
    const player = this.getPlayer(playerId);
    if (player) {
      player.isReady = !player.isReady;
    }
  }

  setUsedCards(playerId: string): UsedCards | undefined {
    const player = this.getPlayer(playerId);
    if (!player?.characters) return;

    const characterKeys = Object.keys(
      player.characters,
    ) as (keyof IPlayerCard)[];

    for (const key of characterKeys) {
      const value = player.characters[key];
      if (value) {
        this.usedCards[key].add(value);
      }
    }

    return this.usedCards;
  }

  allReady(): boolean {
    const notHostPlayers = this.players.filter((p) => !p.isHost);

    if (notHostPlayers.length === 0) return false;

    return notHostPlayers.every((p) => p.isReady === true);
  }

  getHost(): IPlayer | undefined {
    return this.players.find((p) => p.isHost === true);
  }
}
