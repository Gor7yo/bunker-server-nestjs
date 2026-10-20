import { PlayerRole, RoomStatus } from '@prisma/client';
import { CardKey, PlayerCard } from '../deck/card.types';
import type { GameView } from '../game/game.types';
import type { Bunker, Catastrophe } from '../game/data/scenarios';

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

/** A custom characteristic value. */
export interface CardItem {
  value: string;
  /** Shown as a tooltip, like the built-in illness/phobia descriptions. */
  description?: string;
}

/** Custom values of one characteristic. */
export interface CustomDeck {
  /** true — only these values; false — added to the built-in ones. */
  replace: boolean;
  items: CardItem[];
}

export interface CardRules {
  /** Characteristics left out of the game entirely. */
  disabled: CardKey[];
  /** Action cards (by name) removed from the deck. */
  disabledActions: string[];
  /** Action cards have mechanics, so they can't be custom. */
  custom: Partial<Record<Exclude<CardKey, 'action'>, CustomDeck>>;
}

export type CatastropheText = Omit<Catastrophe, 'id'>;
export type BunkerText = Omit<Bunker, 'id'>;

/** Random built-in, a specific built-in, or the host's own text. */
export type ScenarioChoice<T> =
  | { kind: 'RANDOM' }
  | { kind: 'PRESET'; id: string }
  | { kind: 'CUSTOM'; value: T };

export interface ScenarioRules {
  catastrophe: ScenarioChoice<CatastropheText>;
  bunker: ScenarioChoice<BunkerText>;
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
  /** Bunker seats; null — half of the players, rounded down. */
  seats: number | null;
  cards: CardRules;
  scenario: ScenarioRules;
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
