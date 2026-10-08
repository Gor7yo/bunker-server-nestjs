import { GameMode } from '@prisma/client';

import { GameError } from '../../common/game-error';
import { TITLE_MAX_LENGTH } from './room.settings';

export type RoomSort = 'new' | 'popular';

export interface RoomFilters {
  /** Search in room title and host name. */
  q?: string;
  mode?: GameMode;
  /** Only rooms with at least one free slot. */
  freeSlots: boolean;
  sort: RoomSort;
  limit: number;
}

const MODES: GameMode[] = ['AUTO', 'MODERATED'];
const SORTS: RoomSort[] = ['new', 'popular'];
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

const single = (value: unknown) =>
  Array.isArray(value) ? (value[0] as unknown) : value;

/** Parses untrusted query params (?q=&mode=&freeSlots=&sort=&limit=). */
export const parseRoomFilters = (
  query: Record<string, unknown>,
): RoomFilters => {
  const rawQ = single(query.q);
  const q = (typeof rawQ === 'string' ? rawQ : '')
    .trim()
    .slice(0, TITLE_MAX_LENGTH);

  const mode = single(query.mode);
  if (mode !== undefined && mode !== '' && !MODES.includes(mode as GameMode)) {
    throw new GameError('Неизвестный режим игры');
  }

  const sort = single(query.sort) ?? 'popular';
  if (!SORTS.includes(sort as RoomSort)) {
    throw new GameError('Неизвестная сортировка');
  }

  const limit = Number(single(query.limit) ?? DEFAULT_LIMIT);

  return {
    q: q || undefined,
    mode: mode ? (mode as GameMode) : undefined,
    freeSlots: ['1', 'true'].includes(String(single(query.freeSlots))),
    sort: sort as RoomSort,
    limit: Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), MAX_LIMIT)
      : DEFAULT_LIMIT,
  };
};
