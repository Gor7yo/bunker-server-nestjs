import { makeGame } from '../../testing/fixtures';
import { cardOf } from '../room/room.view';
import * as rules from './game.rules';

const vote = (
  ctx: ReturnType<typeof makeGame>['ctx'],
  votes: Record<string, string>,
) => {
  ctx.state.votes = votes;
};

describe('rounds and turns (AUTO)', () => {
  it('starts round 1 with the first player and a reveal timer', () => {
    const { ctx, players } = makeGame({ players: 4 });
    rules.startRound(ctx);

    expect(ctx.state.round).toBe(1);
    expect(ctx.state.phase).toBe('REVEAL');
    expect(ctx.state.speakerId).toBe(players[0].id);
    expect(ctx.state.turnQueue).toEqual(players.slice(1).map((p) => p.id));
    expect(ctx.state.phaseEndsAt).not.toBeNull();
  });

  it('rotates who goes first every round', () => {
    const { ctx, players } = makeGame({ players: 4, state: { round: 1 } });
    rules.startRound(ctx);
    expect(ctx.state.speakerId).toBe(players[1].id);
  });

  it('gives an offline speaker a short turn', () => {
    const { ctx } = makeGame({ players: 4, isOnline: () => false });
    rules.startRound(ctx);
    expect(ctx.state.phaseEndsAt! - ctx.now).toBe(
      rules.OFFLINE_TURN_SECONDS * 1000,
    );
  });

  it('requires the profession first in round 1 — unless it is out of play', () => {
    const { ctx, players } = makeGame();
    rules.startRound(ctx);
    expect(ctx.requiredKey(players[0])).toBe('profession');

    const noProfession = makeGame({
      settings: { cards: { disabled: ['profession'] } },
    });
    rules.startRound(noProfession.ctx);
    expect(noProfession.ctx.requiredKey(noProfession.players[0])).toBeNull();
  });

  it('reveals the required characteristic for a speaker who ran out of time', () => {
    const { ctx, players } = makeGame();
    rules.startRound(ctx);
    rules.finishTurn(ctx);

    expect(players[0].revealed).toEqual(['profession']);
    expect(ctx.state.speakerId).toBe(players[1].id);
  });

  it('skips players with nothing left to reveal and moves on to the discussion', () => {
    const { ctx, players } = makeGame({ players: 3 });
    for (const p of players.slice(1)) p.revealed = [...ctx.keys];
    rules.startRound(ctx);
    rules.finishTurn(ctx);

    expect(ctx.state.phase).toBe('DISCUSSION');
    expect(ctx.state.speakerId).toBeNull();
  });
});

describe('voting', () => {
  it('counts only living voters and candidates', () => {
    const { ctx, players } = makeGame({ players: 4 });
    const [a, b, c, d] = players;
    rules.startVoting(ctx, [a.id, b.id, c.id], false);
    d.isAlive = false;
    vote(ctx, { [a.id]: b.id, [b.id]: c.id, [c.id]: b.id, [d.id]: c.id });

    const result = rules.countVotes(ctx);
    expect(result.tally).toEqual({ [b.id]: 2, [c.id]: 1 });
    expect(result.leaders).toEqual([b.id]);
  });

  it('makes everyone a leader when nobody voted', () => {
    const { ctx, players } = makeGame({ players: 3 });
    rules.startVoting(
      ctx,
      players.map((p) => p.id),
      false,
    );
    expect(rules.countVotes(ctx).leaders).toEqual(players.map((p) => p.id));
  });

  it('keeps immune players off the ballot', () => {
    const { ctx, players } = makeGame({ players: 3, state: { round: 2 } });
    ctx.state.immune = { [players[0].id]: 2 };
    rules.startVoting(
      ctx,
      players.map((p) => p.id),
      false,
    );
    expect(ctx.state.candidates).toEqual([players[1].id, players[2].id]);
  });

  it('exiles a single leader and opens their whole card', () => {
    const { ctx, players } = makeGame({
      players: 4,
      settings: { cards: { disabled: ['gender'] } },
    });
    const [a, b, c] = players;
    rules.startVoting(
      ctx,
      players.map((p) => p.id),
      false,
    );
    vote(ctx, { [a.id]: c.id, [b.id]: c.id });
    rules.closeVoting(ctx);

    expect(ctx.state.phase).toBe('EXILE');
    expect(c.isAlive).toBe(false);
    expect(c.revealed).toEqual(ctx.keys);
    expect(c.revealed).not.toContain('gender');
    expect(ctx.state.exiledByLot).toBe(false);
  });

  it('settles a tie with a defense, a revote and then a lot', () => {
    const { ctx, players } = makeGame({ players: 4 });
    const [a, b, c, d] = players;
    rules.startVoting(
      ctx,
      players.map((p) => p.id),
      false,
    );
    vote(ctx, { [a.id]: c.id, [b.id]: d.id });
    rules.closeVoting(ctx);

    // Defense: each tied player speaks, then a revote between them.
    expect(ctx.state.phase).toBe('DEFENSE');
    expect(ctx.state.speakerId).toBe(c.id);
    rules.nextDefender(ctx);
    expect(ctx.state.speakerId).toBe(d.id);
    rules.nextDefender(ctx);
    expect(ctx.state.phase).toBe('VOTING');
    expect(ctx.state.isRevote).toBe(true);
    expect(ctx.state.candidates).toEqual([c.id, d.id]);

    // Tie again: one of them leaves by lot.
    vote(ctx, { [a.id]: c.id, [b.id]: d.id });
    rules.closeVoting(ctx);
    expect(ctx.state.phase).toBe('EXILE');
    expect(ctx.state.exiledByLot).toBe(true);
    expect([c, d].filter((p) => !p.isAlive)).toHaveLength(1);
  });

  it('leaves the decision to the moderator in moderated games', () => {
    const { ctx, players } = makeGame({
      players: 4,
      settings: { mode: 'MODERATED' },
    });
    rules.startVoting(
      ctx,
      players.map((p) => p.id),
      false,
    );
    vote(ctx, { [players[0].id]: players[1].id });
    rules.closeVoting(ctx);

    expect(ctx.state.phase).toBe('VOTE_RESULT');
    expect(ctx.state.phaseEndsAt).toBeNull();
    expect(players.every((p) => p.isAlive)).toBe(true);
  });
});

describe('exile and the end of the game', () => {
  it('starts the next round while there are more players than seats', () => {
    const { ctx, players } = makeGame({
      players: 4,
      state: { seats: 2, round: 1 },
    });
    rules.exilePlayer(ctx, players[0], false);
    rules.afterExile(ctx);
    expect(ctx.state.phase).toBe('REVEAL');
    expect(ctx.state.round).toBe(2);
  });

  it('finishes when the survivors fit into the bunker', () => {
    const { ctx, players } = makeGame({
      players: 3,
      state: { seats: 2, round: 1 },
    });
    rules.exilePlayer(ctx, players[0], false);
    rules.afterExile(ctx);
    expect(ctx.state.phase).toBe('FINISHED');
    expect(ctx.finished).toBe(true);
  });

  it('passes the profession on with «Наследие»', () => {
    const { ctx, players } = makeGame({ players: 4 });
    const [a, b] = players;
    ctx.state.legacy = [a.id];
    const profession = cardOf(a)!.profession;

    rules.exilePlayer(ctx, a, false);
    expect(cardOf(b)!.profession).toBe(profession);
    expect(b.revealed).toContain('profession');
    expect(ctx.state.legacy).toEqual([]);
  });

  it('refuses to touch characteristics that are out of play', () => {
    const { ctx, players } = makeGame({
      settings: { cards: { disabled: ['phobia'] } },
    });
    expect(() => ctx.reveal(players[0], 'phobia')).toThrow(
      'не участвует в игре',
    );
    expect(() => ctx.setCardValue(players[0], 'phobia', 'x')).toThrow(
      'не участвует в игре',
    );
  });
});
