import { IPlayer } from "../../../common/interfaces/player.interface";
import { UsedCards } from "../../deck/data/characters";
export type GameState = 'WAITING' | 'READY_CHECK' | 'GAME_RUNNING' | 'FINISHED';
export declare class Room {
    code: string;
    players: IPlayer[];
    maxPlayers: number;
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
    gameState: GameState;
    createdAt: Date;
    constructor(code: string);
    addPlayer(player: IPlayer): boolean;
    removePlayer(playerId: string): void;
    getPlayer(playerId: string): IPlayer | undefined;
    setReady(playerId: string): void;
    setUsedCards(playerId: string): UsedCards | undefined;
    allReady(): boolean;
    getHost(): IPlayer | undefined;
}
