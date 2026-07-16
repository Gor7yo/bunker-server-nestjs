import { IPlayer } from 'src/common/interfaces/player.interface';
import { IPlayerCard, TakedCards } from 'src/modules/deck/data/characters';

export class Room {
  code: string;
  players: IPlayer[] = [];
  maxPlayers: number = 12;
  takedCards: TakedCards = {
    age: [],
    profession: [],
    health: [],
    fobia: [],
    hobbie: [],
    bandage: [],
    action: [],
    fact: [],
  };
  gameState: 'WAITING' | 'READY_CHECK' | 'GAME_RUNNING' | 'FINISHED' =
    'WAITING';
  createdAt: Date = new Date();

  constructor(code: string) {
    this.code = code;
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

  setTakedCards(playerId: string): TakedCards | undefined {
    const player = this.getPlayer(playerId);
    if (!player?.characters) return;

    const characterKeys = Object.keys(
      player.characters,
    ) as (keyof IPlayerCard)[];

    for (const key of characterKeys) {
      const value = player.characters[key];
      if (value) {
        this.takedCards[key].push(value);
      }
    }

    return this.takedCards;
  }

  allReady(): boolean {
    return this.players.every((p) => p.isReady === true);
  }

  getHost(): IPlayer | undefined {
    return this.players.find((p) => p.isHost === true);
  }
}
