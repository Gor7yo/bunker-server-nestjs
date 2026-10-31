import { Player, Prisma } from '@prisma/client';

import { DeckService } from '../modules/deck/deck.service';
import { GameContext } from '../modules/game/game.context';
import { GameState } from '../modules/game/game.types';
import { DEFAULT_SETTINGS, mergeSettings } from '../modules/room/room.settings';
import { RoomSettings } from '../modules/room/room.types';
import { RoomWithPlayers, settingsData } from '../modules/room/room.view';

/** In-memory rooms and games for unit tests — no database involved. */

let joinOrder = 0;

export const makePlayer = (overrides: Partial<Player> = {}): Player => {
  joinOrder += 1;
  return {
    id: `p${joinOrder}`,
    token: `token-${joinOrder}`,
    name: `Игрок ${joinOrder}`,
    roomId: 'room',
    isHost: false,
    role: 'PLAYER',
    isReady: true,
    isAlive: true,
    hasLeft: false,
    card: null,
    revealed: [],
    joinedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, joinOrder)),
    ...overrides,
  };
};

export const makeState = (overrides: Partial<GameState> = {}): GameState => ({
  seq: 0,
  catastrophe: { id: 'c', title: 'Катастрофа', description: '', stay: '1 год' },
  bunker: {
    id: 'b',
    title: 'Бункер',
    description: '',
    area: '100 м²',
    supplies: 'Еды на год',
    features: [],
  },
  seats: 2,
  round: 0,
  phase: 'INTRO',
  phaseEndsAt: null,
  speakerId: null,
  turnQueue: [],
  revealedThisTurn: false,
  votes: {},
  candidates: [],
  isRevote: false,
  readyToVote: [],
  lastVote: null,
  lastExiledId: null,
  exiledByLot: false,
  log: [],
  ...overrides,
});

interface GameOptions {
  players?: number;
  /** Settings patch, validated like the real lobby does. */
  settings?: unknown;
  state?: Partial<GameState>;
  /** Who is connected; everyone by default. */
  isOnline?: (playerId: string) => boolean;
}

/** A started game: dealt cards, a GameContext ready for the rules. */
export const makeGame = ({
  players: count = 4,
  settings: patch,
  state,
  isOnline = () => true,
}: GameOptions = {}) => {
  const settings: RoomSettings = mergeSettings(DEFAULT_SETTINGS, patch);
  const cards = new DeckService().deal(count, settings.cards);
  const players = cards.map((card) =>
    makePlayer({ card: card as Prisma.JsonObject }),
  );
  if (settings.mode === 'MODERATED') {
    players.push(makePlayer({ role: 'MODERATOR', card: null, isHost: true }));
  }

  const room: RoomWithPlayers = {
    id: 'room',
    code: 'TEST1',
    status: 'PLAYING',
    ...settingsData(settings),
    settings: settingsData(settings).settings as Prisma.JsonValue,
    game: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    players,
  };

  const ctx = new GameContext(
    room,
    makeState({ seats: Math.floor(count / 2), ...state }),
    isOnline,
  );
  return { ctx, room, players: players.filter((p) => p.role === 'PLAYER') };
};
