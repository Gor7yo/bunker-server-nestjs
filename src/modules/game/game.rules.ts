import { randomInt } from 'crypto';
import { Player } from '@prisma/client';

import { CARD_LABELS, CardKey } from '../deck/card.types';
import { cardOf } from '../room/room.view';
import { GameContext } from './game.context';
import { VoteResult } from './game.types';

/**
 * Phase transitions. AUTO: called by timers and early-finish events.
 * MODERATED: the moderator triggers the same building blocks by hand.
 */

export const INTRO_SECONDS = 25;
export const EXILE_SECONDS = 12;
/** An offline speaker gets a short turn so the game doesn't stall. */
export const OFFLINE_TURN_SECONDS = 10;

const pick = <T>(items: T[]): T => items[randomInt(items.length)];

/** Timer only in AUTO; the moderator moves phases manually. */
const autoSeconds = (ctx: GameContext, seconds: number) =>
  ctx.isAuto ? seconds : null;

// ---- rounds & reveal ----------------------------------------------------

export function startRound(ctx: GameContext) {
  const s = ctx.state;
  s.round += 1;
  s.lastExiledId = null;
  s.exiledByLot = false;
  s.lastVote = null;
  ctx.log(`Раунд ${s.round}`);

  // Rotate who starts so everyone gets to go first.
  const alive = ctx.alive.map((p) => p.id);
  const shift = (s.round - 1) % Math.max(alive.length, 1);
  s.turnQueue = [...alive.slice(shift), ...alive.slice(0, shift)];

  if (ctx.isAuto) {
    nextSpeaker(ctx);
  } else {
    s.speakerId = null;
    ctx.setPhase('REVEAL', null);
  }
}

/** Gives the turn to the next player who still has something to reveal. */
export function nextSpeaker(ctx: GameContext) {
  const s = ctx.state;
  while (s.turnQueue.length > 0) {
    const id = s.turnQueue.shift()!;
    const player = ctx.alive.find((p) => p.id === id);
    if (!player || ctx.hiddenKeys(player).length === 0) continue;

    s.speakerId = id;
    s.revealedThisTurn = false;
    ctx.setPhase(
      'REVEAL',
      ctx.isOnline(id) ? ctx.settings.timers.reveal : OFFLINE_TURN_SECONDS,
    );
    return;
  }

  s.speakerId = null;
  startDiscussion(ctx);
}

/** Random hidden characteristic; the action card goes last. */
function randomHiddenKey(ctx: GameContext, player: Player): CardKey | null {
  const hidden = ctx.hiddenKeys(player);
  const preferred = hidden.filter((key) => key !== 'action');
  const pool = preferred.length > 0 ? preferred : hidden;
  return pool.length > 0 ? pick(pool) : null;
}

/** Speaker reveals a characteristic of their own card. */
export function revealOwn(ctx: GameContext, player: Player, key: CardKey) {
  const value = cardOf(player)?.[key];
  ctx.reveal(player, key);
  ctx.log(
    `${player.name}: ${CARD_LABELS[key].toLowerCase()} — ${value}`,
    'reveal',
  );
}

/** Turn ends: if the speaker didn't reveal anything, reveal for them. */
export function finishTurn(ctx: GameContext) {
  const s = ctx.state;
  const speaker = s.speakerId
    ? ctx.alive.find((p) => p.id === s.speakerId)
    : null;

  if (speaker && !s.revealedThisTurn) {
    const key = ctx.requiredKey(speaker) ?? randomHiddenKey(ctx, speaker);
    if (key) revealOwn(ctx, speaker, key);
  }

  nextSpeaker(ctx);
}

// ---- discussion & voting ------------------------------------------------

export function startDiscussion(ctx: GameContext) {
  const s = ctx.state;
  s.speakerId = null;
  s.readyToVote = [];
  ctx.setPhase('DISCUSSION', autoSeconds(ctx, ctx.settings.timers.discussion));
}

export function startVoting(
  ctx: GameContext,
  candidates: string[],
  isRevote: boolean,
  seconds: number | null = autoSeconds(ctx, ctx.settings.timers.voting),
) {
  const s = ctx.state;
  s.speakerId = null;
  s.turnQueue = [];
  s.votes = {};
  s.readyToVote = [];
  s.candidates = candidates;
  s.isRevote = isRevote;
  ctx.setPhase('VOTING', seconds);
  ctx.log(isRevote ? 'Переголосование' : 'Голосование началось', 'vote');
}

/** Everyone who can vote right now has voted — no need to wait. */
export function everyoneVoted(ctx: GameContext) {
  const voters = ctx.alive.filter((p) => ctx.isOnline(p.id));
  return voters.length > 0 && voters.every((p) => ctx.state.votes[p.id]);
}

export function countVotes(ctx: GameContext): VoteResult {
  const s = ctx.state;
  const votes = Object.fromEntries(
    Object.entries(s.votes).filter(
      ([voter, target]) =>
        ctx.isAlivePlayer(voter) && s.candidates.includes(target),
    ),
  );

  const tally: Record<string, number> = {};
  for (const target of Object.values(votes)) {
    tally[target] = (tally[target] ?? 0) + 1;
  }

  const max = Math.max(0, ...Object.values(tally));
  const leaders =
    max === 0
      ? [...s.candidates]
      : s.candidates.filter((id) => tally[id] === max);

  return { votes, tally, leaders };
}

export function closeVoting(ctx: GameContext) {
  const s = ctx.state;
  const result = countVotes(ctx);
  s.lastVote = result;
  s.votes = {};

  const voteCount = Object.keys(result.votes).length;
  ctx.log(`Голосование закрыто, голосов: ${voteCount}`, 'vote');

  if (!ctx.isAuto) {
    ctx.setPhase('VOTE_RESULT', null);
    return;
  }

  resolveVote(ctx);
}

/** AUTO: single leader → exile; tie → defense and revote; tie again → lot. */
export function resolveVote(ctx: GameContext) {
  const s = ctx.state;
  const leaders = (s.lastVote?.leaders ?? []).filter((id) =>
    ctx.isAlivePlayer(id),
  );
  const pool = leaders.length > 0 ? leaders : ctx.alive.map((p) => p.id);

  if (pool.length === 1) {
    exilePlayer(ctx, ctx.player(pool[0]), false);
  } else if (!s.isRevote) {
    startDefense(ctx, pool);
  } else {
    exilePlayer(ctx, ctx.player(pick(pool)), true);
  }
}

export function startDefense(ctx: GameContext, candidates: string[]) {
  const s = ctx.state;
  s.candidates = candidates;
  s.turnQueue = [...candidates];
  const names = candidates.map((id) => ctx.player(id).name).join(', ');
  ctx.log(`Ничья: ${names}. Слово для оправдания`, 'vote');
  nextDefender(ctx);
}

export function nextDefender(ctx: GameContext) {
  const s = ctx.state;
  while (s.turnQueue.length > 0) {
    const id = s.turnQueue.shift()!;
    if (!ctx.isAlivePlayer(id)) continue;
    s.speakerId = id;
    ctx.setPhase('DEFENSE', autoSeconds(ctx, ctx.settings.timers.defense));
    return;
  }

  const candidates = s.candidates.filter((id) => ctx.isAlivePlayer(id));
  if (candidates.length <= 1 && ctx.isAuto) {
    s.lastVote = { votes: {}, tally: {}, leaders: candidates };
    s.isRevote = true;
    resolveVote(ctx);
    return;
  }
  startVoting(ctx, candidates, true);
}

// ---- exile & finish -----------------------------------------------------

export function exilePlayer(ctx: GameContext, player: Player, byLot: boolean) {
  const s = ctx.state;
  ctx.exile(player);
  s.speakerId = null;
  s.lastExiledId = player.id;
  s.exiledByLot = byLot;
  ctx.log(
    byLot
      ? `${player.name} покидает бункер по жребию`
      : `${player.name} изгнан из бункера`,
    'exile',
  );
  ctx.setPhase('EXILE', autoSeconds(ctx, EXILE_SECONDS));
}

/** AUTO, after the exile screen: next round or the end. */
export function afterExile(ctx: GameContext) {
  if (ctx.alive.length <= ctx.state.seats) finishGame(ctx);
  else startRound(ctx);
}

export function finishGame(ctx: GameContext) {
  const s = ctx.state;
  s.speakerId = null;
  s.turnQueue = [];
  s.votes = {};
  ctx.setPhase('FINISHED', null);
  ctx.finished = true;
  const names = ctx.alive.map((p) => p.name).join(', ');
  ctx.log(
    names ? `В бункер попали: ${names}` : 'В бункер не попал никто',
    'info',
  );
}

/** AUTO timer fired for the current phase. */
export function onPhaseTimeout(ctx: GameContext) {
  switch (ctx.state.phase) {
    case 'INTRO':
      return startRound(ctx);
    case 'REVEAL':
      return finishTurn(ctx);
    case 'DISCUSSION':
      return startVoting(
        ctx,
        ctx.alive.map((p) => p.id),
        false,
      );
    case 'VOTING':
      return closeVoting(ctx);
    case 'DEFENSE':
      return nextDefender(ctx);
    case 'VOTE_RESULT':
      return resolveVote(ctx);
    case 'EXILE':
      return afterExile(ctx);
    case 'FINISHED':
      return;
  }
}
