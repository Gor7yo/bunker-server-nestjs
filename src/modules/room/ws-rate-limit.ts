import { Logger } from '@nestjs/common';
import { Socket } from 'socket.io';

import {
  RATE_LIMIT_MESSAGE,
  RateLimiter,
  clientIp,
} from '../../common/rate-limit';
import type { WsResult } from '../../common/game-error';

const logger = new Logger('RateLimit');

/** Any event from one socket: generous bursts (clicking around), no floods. */
const perSocket = new RateLimiter(30, 10);

/** Events that create rows in the database, limited per IP. */
const perIp: Record<string, RateLimiter> = {
  'room:create': new RateLimiter(5, 5 / 60),
  'room:join': new RateLimiter(20, 20 / 60),
};

/**
 * Drops events over the limit. The client still gets its ack — an error
 * it can show — instead of waiting for a timeout.
 */
export function applyRateLimit(socket: Socket) {
  const ip = clientIp(socket.handshake.headers, socket.handshake.address);

  socket.use((packet, next) => {
    const [event, ...args] = packet as [string, ...unknown[]];
    const byIp = perIp[event];
    if (perSocket.take(socket.id) && (!byIp || byIp.take(ip))) return next();

    logger.warn(`${event} rejected for ${ip}`);
    const ack = args.at(-1);
    if (typeof ack === 'function') {
      (ack as (result: WsResult) => void)({
        ok: false,
        error: RATE_LIMIT_MESSAGE,
      });
    }
  });
}
