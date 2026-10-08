import { Player, Prisma, Room } from '@prisma/client';
import { CardKey, PlayerCard, isCardKey } from '../deck/card.types';
import { DEFAULT_SETTINGS } from './room.settings';
import { CARD_HINTS } from '../deck/card.hints';
import { buildGameView, peeksOf } from '../game/game.view';
import { PublicPlayer, RoomSettings, RoomView } from './room.types';

export type RoomWithPlayers = Room & { players: Player[] };

/** Assembles settings from the room columns and the JSON part. */
export const settingsOf = (room: Room): RoomSettings => {
  const stored = room.settings as unknown as Partial<RoomSettings> | null;
  return {
    title: room.title,
    isPublic: room.isPublic,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    timers: { ...DEFAULT_SETTINGS.timers, ...stored?.timers },
    actions: { ...DEFAULT_SETTINGS.actions, ...stored?.actions },
  };
};

/** Inverse of settingsOf(): data for prisma.room.create/update. */
export const settingsData = ({
  timers,
  actions,
  ...columns
}: RoomSettings) => ({
  ...columns,
  settings: { timers, actions } as unknown as Prisma.InputJsonValue,
});

export const cardOf = (player: Player) =>
  player.card as unknown as PlayerCard | null;

export const revealedKeysOf = (player: Player): CardKey[] =>
  player.revealed.filter(isCardKey);

const revealedPart = (player: Player): Partial<PlayerCard> => {
  const card = cardOf(player);
  if (!card) return {};
  return Object.fromEntries(
    revealedKeysOf(player).map((key) => [key, card[key]]),
  );
};

/**
 * Builds the room state for one viewer. Hidden characteristics of other
 * players never leave the server — except for the moderator and after the
 * game is over.
 */
export const buildRoomView = (
  room: RoomWithPlayers,
  viewer: Player,
  isOnline: (playerId: string) => boolean,
  now: number,
): RoomView => {
  const seesAllCards =
    viewer.role === 'MODERATOR' || room.status === 'FINISHED';
  const peeks = peeksOf(room, viewer.id);

  /** Values seen privately by the viewer (Проверка досье, Тайное знание). */
  const knownPart = (p: Player): Partial<PlayerCard> => {
    const card = cardOf(p);
    if (!card) return {};
    return Object.fromEntries(
      peeks.filter((x) => x.playerId === p.id).map((x) => [x.key, card[x.key]]),
    );
  };

  const players = [...room.players]
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
    .map<PublicPlayer>((p) => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      role: p.role,
      isReady: p.isReady,
      isOnline: isOnline(p.id),
      isAlive: p.isAlive,
      hasLeft: p.hasLeft,
      revealed: revealedPart(p),
      known: knownPart(p),
      ...(seesAllCards && cardOf(p) ? { card: cardOf(p)! } : {}),
    }));

  // Descriptions only for values the viewer can actually see.
  const visible = new Set<string>([
    ...Object.values(cardOf(viewer) ?? {}),
    ...players.flatMap((p) => [
      ...Object.values(p.revealed),
      ...Object.values(p.known ?? {}),
      ...Object.values(p.card ?? {}),
    ]),
  ]);
  const hints = Object.fromEntries(
    [...visible].flatMap((value) => {
      const hint = CARD_HINTS.get(value);
      return hint ? [[value, hint]] : [];
    }),
  );

  return {
    code: room.code,
    status: room.status,
    settings: settingsOf(room),
    meId: viewer.id,
    myCard: cardOf(viewer),
    myRevealed: revealedKeysOf(viewer),
    players,
    hints,
    game: buildGameView(room, viewer, now),
  };
};
