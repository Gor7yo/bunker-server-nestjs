import { CardKey } from '../deck/card.types';
import { Bunker, Catastrophe } from './data/scenarios';

export type GamePhase =
  /** Catastrophe and bunker are shown. */
  | 'INTRO'
  /** Players take turns revealing one characteristic each. */
  | 'REVEAL'
  | 'DISCUSSION'
  | 'VOTING'
  /** Tied candidates justify themselves before a revote. */
  | 'DEFENSE'
  /** Moderated mode: votes are counted, the moderator decides. */
  | 'VOTE_RESULT'
  /** Someone was exiled, their card is shown to everyone. */
  | 'EXILE'
  | 'FINISHED';

export interface VoteResult {
  /** voterId → targetId */
  votes: Record<string, string>;
  /** targetId → number of votes */
  tally: Record<string, number>;
  /** Candidates with the most votes. */
  leaders: string[];
}

export type LogTone = 'info' | 'reveal' | 'vote' | 'exile';

export interface GameLogEntry {
  at: number;
  text: string;
  tone: LogTone;
}

/** Stored in rooms.game as JSON. */
export interface GameState {
  /** Bumped on every phase change; stale timers compare against it. */
  seq: number;
  catastrophe: Catastrophe;
  bunker: Bunker;
  seats: number;
  round: number;
  phase: GamePhase;
  /** Epoch ms. Drives transitions in AUTO, purely visual in MODERATED. */
  phaseEndsAt: number | null;
  speakerId: string | null;
  /** Who speaks after the current speaker in this phase. */
  turnQueue: string[];
  revealedThisTurn: boolean;
  /** Current voting: voterId → targetId. Hidden until it closes. */
  votes: Record<string, string>;
  /** Who can be voted for in the current voting. */
  candidates: string[];
  isRevote: boolean;
  /** Discussion: players who want to vote right away. */
  readyToVote: string[];
  lastVote: VoteResult | null;
  lastExiledId: string | null;
  exiledByLot: boolean;
  log: GameLogEntry[];
}

/** Game state as seen by one participant. */
export interface GameView {
  catastrophe: Catastrophe;
  bunker: Bunker;
  seats: number;
  round: number;
  phase: GamePhase;
  phaseEndsAt: number | null;
  /** Server time when the view was built — for clock offset. */
  serverNow: number;
  speakerId: string | null;
  turnQueue: string[];
  revealedThisTurn: boolean;
  candidates: string[];
  isRevote: boolean;
  readyToVote: string[];
  /** Who has already voted in the current voting (not for whom). */
  votedIds: string[];
  myVote: string | null;
  /** Live votes — only for the moderator. */
  liveVotes: Record<string, string> | null;
  lastVote: VoteResult | null;
  lastExiledId: string | null;
  exiledByLot: boolean;
  /** Characteristic the viewer must reveal first (round 1 → profession). */
  requiredKey: CardKey | null;
  aliveCount: number;
  log: GameLogEntry[];
}
