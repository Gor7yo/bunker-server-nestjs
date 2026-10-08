import { PlayerRole, RoomStatus } from '@prisma/client';
import { CardKey, PlayerCard } from '../deck/card.types';
import type { GameView } from '../game/game.types';

export type GameMode = 'AUTO' | 'MODERATED';

/** Phase durations in seconds (used by the AUTO mode engine). */
export interface RoomTimers {
  reveal: number;
  discussion: number;
  voting: number;
  defense: number;
}

/** When action cards may be played. */
export type ActionTiming = 'ANYTIME' | 'OWN_TURN';
/** Moderated mode: cards apply at once or wait for the moderator. */
export type ActionApproval = 'AUTO' | 'MODERATOR';

export interface ActionRules {
  timing: ActionTiming;
  approval: ActionApproval;
}

export interface RoomSettings {
  title: string;
  /** Listed on the home page; private rooms are joined by code only. */
  isPublic: boolean;
  mode: GameMode;
  /** Max number of players, a moderator does not take a slot. */
  maxPlayers: number;
  timers: RoomTimers;
  actions: ActionRules;
}

/** A row in the public rooms list on the home page. */
export interface PublicRoomSummary {
  code: string;
  title: string;
  mode: GameMode;
  hostName: string;
  players: number;
  maxPlayers: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  role: PlayerRole;
  isReady: boolean;
  isOnline: boolean;
  isAlive: boolean;
  hasLeft: boolean;
  revealed: Partial<PlayerCard>;
  /** Hidden values the viewer saw privately. */
  known?: Partial<PlayerCard>;
  /** Full card, only present in the moderator's view. */
  card?: PlayerCard;
}

/** Room state as seen by one particular participant. */
export interface RoomView {
  code: string;
  status: RoomStatus;
  settings: RoomSettings;
  meId: string;
  myCard: PlayerCard | null;
  myRevealed: CardKey[];
  players: PublicPlayer[];
  /** Card value → description, for tooltips. */
  hints: Record<string, string>;
  game: GameView | null;
}
