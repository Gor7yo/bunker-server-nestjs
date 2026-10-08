import { Injectable } from '@nestjs/common';

import { KeyedLock } from '../../common/keyed-lock';

/**
 * One lock per room code, shared by every gateway and the game timers, so
 * all changes to a room run strictly one after another. Not reentrant:
 * code running inside `run` must call the `...Locked` variants of services.
 */
@Injectable()
export class RoomLock {
  private readonly lock = new KeyedLock();

  run<T>(roomCode: string, task: () => Promise<T>): Promise<T> {
    return this.lock.run(roomCode, task);
  }
}
