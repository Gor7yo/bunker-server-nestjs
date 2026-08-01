import { IPlayerCard } from 'src/modules/deck/data/characters';

export interface IPlayer {
  id: string;
  createdAt: Date;
  name: string;
  isReady: boolean;
  isHost: boolean;
  isAlive: boolean;
  characters?: IPlayerCard | null;
  roomCode: string;
}
