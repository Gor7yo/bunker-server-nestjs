import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

import { GameError, WsResult } from '../../common/game-error';

export interface SocketSession {
  playerId: string;
  roomCode: string;
}

export type Body = Record<string, unknown> | undefined;

export const roomChannel = (code: string) => `room:${code}`;

export const sessionOf = (client: Socket): SocketSession | undefined => {
  const data = client.data as SocketSession | undefined;
  return data?.playerId ? data : undefined;
};

/** Turns an action into an ack payload; unexpected errors are logged. */
export async function handleWs<T>(
  logger: Logger,
  action: () => Promise<T>,
): Promise<WsResult<T>> {
  try {
    return { ok: true, data: await action() };
  } catch (e) {
    if (e instanceof GameError) return { ok: false, error: e.message };
    logger.error(e);
    return { ok: false, error: 'Ошибка сервера, попробуйте ещё раз' };
  }
}

/** Like handleWs, but requires the socket to be bound to a room player. */
export function inRoom<T>(
  logger: Logger,
  client: Socket,
  action: (session: SocketSession) => Promise<T>,
) {
  return handleWs(logger, () => {
    const session = sessionOf(client);
    if (!session) throw new GameError('Вы не в комнате');
    return action(session);
  });
}
