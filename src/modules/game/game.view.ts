import { Player } from '@prisma/client';

import type { RoomWithPlayers } from '../room/room.view';
import { GameState, GameView } from './game.types';

const LOG_VIEW_LIMIT = 40;

/** Game state for one viewer: votes stay secret until the voting closes. */
export const buildGameView = (
  room: RoomWithPlayers,
  viewer: Player,
  now: number,
): GameView | null => {
  const state = room.game as unknown as GameState | null;
  if (!state) return null;

  const isModerator = viewer.role === 'MODERATOR';
  const alive = room.players.filter(
    (p) => p.role === 'PLAYER' && p.isAlive && !p.hasLeft,
  );
  const requiredKey =
    state.round === 1 &&
    viewer.role === 'PLAYER' &&
    !viewer.revealed.includes('profession')
      ? 'profession'
      : null;

  return {
    catastrophe: state.catastrophe,
    bunker: state.bunker,
    seats: state.seats,
    round: state.round,
    phase: state.phase,
    phaseEndsAt: state.phaseEndsAt,
    serverNow: now,
    speakerId: state.speakerId,
    turnQueue: state.turnQueue,
    revealedThisTurn: state.revealedThisTurn,
    candidates: state.candidates,
    isRevote: state.isRevote,
    readyToVote: state.readyToVote,
    votedIds: Object.keys(state.votes),
    myVote: state.votes[viewer.id] ?? null,
    liveVotes: isModerator ? state.votes : null,
    lastVote: state.lastVote,
    lastExiledId: state.lastExiledId,
    exiledByLot: state.exiledByLot,
    requiredKey,
    aliveCount: alive.length,
    log: state.log.slice(-LOG_VIEW_LIMIT),
  };
};
