import { IPlayerCard } from "src/modules/deck/data/characters";

export interface IPlayer {
  id: string; // socket.id
  name: string;
  isReady: boolean;
  isHost: boolean;
  characters?: IPlayerCard; // позже добавим
  isAlive: boolean; // для голосования
}
