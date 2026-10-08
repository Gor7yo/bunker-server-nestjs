import { Player } from '@prisma/client';

import { CARD_HINTS } from '../deck/card.hints';
import { cardOf, type RoomWithPlayers } from '../room/room.view';
import { myActionView } from './game.actions';
import { GameContext } from './game.context';
import { GameState, GameView } from './game.types';

const LOG_VIEW_LIMIT = 40;

/** Game state for one viewer: votes and peeks stay private. */
export const buildGameView = (
  room: RoomWithPlayers,
  viewer: Player,
  now: number,
): GameView | null => {
  const raw = room.game as unknown as GameState | null;
  if (!raw) return null;

  // Read-only context: normalizes optional fields, online state isn't needed.
  const ctx = new GameContext(room, structuredClone(raw), () => true);
  const state = ctx.state;
  const isModerator = viewer.role === 'MODERATOR';
  const requiredKey =
    state.round === 1 &&
    viewer.role === 'PLAYER' &&
    !viewer.revealed.includes('profession')
      ? 'profession'
      : null;

  const pending = state
    .pendingActions!.filter((a) => isModerator || a.playerId === viewer.id)
    .map((a) => {
      const value = cardOf(ctx.player(a.playerId))?.action ?? '';
      return { ...a, value, description: CARD_HINTS.get(value) ?? null };
    });

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
    aliveCount: ctx.alive.length,
    log: state.log.slice(-LOG_VIEW_LIMIT),
    myAction: myActionView(ctx, viewer),
    silenced: state.silenced!,
    immune: ctx.alive.filter((p) => ctx.isImmune(p.id)).map((p) => p.id),
    confession: state.confession ?? null,
    pendingActions: pending,
  };
};

/** Characteristics the viewer saw privately, per player id. */
export const peeksOf = (room: RoomWithPlayers, viewerId: string) => {
  const state = room.game as unknown as GameState | null;
  return state?.peeks?.[viewerId] ?? [];
};
