import { GameMode, Player } from '@prisma/client';

import { GameError } from '../../common/game-error';
import { CARD_KEYS, CardKey } from '../deck/card.types';
import { RoomWithPlayers, cardOf, settingsOf } from '../room/room.view';
import { RoomSettings } from '../room/room.types';
import { GamePhase, GameState, LogTone } from './game.types';

const LOG_LIMIT = 60;

export const gameOf = (room: { game: unknown }) =>
  room.game as GameState | null;

/**
 * One game transaction: the room is loaded once, rules mutate the state and
 * players in memory, then GameService persists whatever got dirty.
 */
export class GameContext {
  readonly now = Date.now();
  readonly settings: RoomSettings;
  mode: GameMode;
  /** Player ids whose isAlive / revealed / card changed. */
  readonly dirtyPlayers = new Set<string>();
  changed = false;
  finished = false;

  constructor(
    readonly room: RoomWithPlayers,
    readonly state: GameState,
    readonly isOnline: (playerId: string) => boolean,
  ) {
    this.settings = settingsOf(room);
    this.mode = room.mode;
  }

  get isAuto() {
    return this.mode === 'AUTO';
  }

  // ---- players ----------------------------------------------------------

  player(id: unknown): Player {
    const player = this.room.players.find((p) => p.id === id);
    if (!player) throw new GameError('Игрок не найден');
    return player;
  }

  /** Card holders (not the moderator), in join order. */
  get participants(): Player[] {
    return this.room.players
      .filter((p) => p.role === 'PLAYER')
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  }

  get alive(): Player[] {
    return this.participants.filter((p) => p.isAlive && !p.hasLeft);
  }

  isAlivePlayer(id: string) {
    return this.alive.some((p) => p.id === id);
  }

  hiddenKeys(player: Player): CardKey[] {
    return CARD_KEYS.filter((key) => !player.revealed.includes(key));
  }

  /** Round 1 starts with the profession. */
  requiredKey(player: Player): CardKey | null {
    return this.state.round === 1 && !player.revealed.includes('profession')
      ? 'profession'
      : null;
  }

  reveal(player: Player, key: CardKey) {
    if (player.revealed.includes(key)) return;
    player.revealed = [...player.revealed, key];
    this.markPlayer(player);
  }

  hide(player: Player, key: CardKey) {
    player.revealed = player.revealed.filter((k) => k !== key);
    this.markPlayer(player);
  }

  setCardValue(player: Player, key: CardKey, value: string) {
    const card = cardOf(player);
    if (!card) throw new GameError('У игрока нет карты');
    player.card = { ...card, [key]: value };
    this.markPlayer(player);
  }

  /** Exiled players lose their seat and show the whole card. */
  exile(player: Player) {
    player.isAlive = false;
    player.revealed = [...CARD_KEYS];
    this.markPlayer(player);
    this.forget(player.id);
  }

  revive(player: Player) {
    player.isAlive = true;
    this.markPlayer(player);
  }

  /** Removes a player from turns, votes and candidates of the current phase. */
  forget(playerId: string) {
    const s = this.state;
    s.turnQueue = s.turnQueue.filter((id) => id !== playerId);
    s.candidates = s.candidates.filter((id) => id !== playerId);
    s.readyToVote = s.readyToVote.filter((id) => id !== playerId);
    s.votes = Object.fromEntries(
      Object.entries(s.votes).filter(
        ([voter, target]) => voter !== playerId && target !== playerId,
      ),
    );
    this.changed = true;
  }

  private markPlayer(player: Player) {
    this.dirtyPlayers.add(player.id);
    this.changed = true;
  }

  // ---- state ------------------------------------------------------------

  /** `seconds = null` — no timer (moderator decides when to move on). */
  setPhase(phase: GamePhase, seconds: number | null) {
    this.state.phase = phase;
    this.state.phaseEndsAt =
      seconds === null ? null : this.now + seconds * 1000;
    this.state.seq += 1;
    this.changed = true;
  }

  log(text: string, tone: LogTone = 'info') {
    this.state.log = [...this.state.log, { at: this.now, text, tone }].slice(
      -LOG_LIMIT,
    );
    this.changed = true;
  }

  touch() {
    this.changed = true;
  }
}
