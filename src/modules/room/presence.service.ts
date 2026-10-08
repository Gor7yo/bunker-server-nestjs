import { Injectable } from '@nestjs/common';

/**
 * In-memory map of which socket currently represents which player.
 * A player has at most one live socket; a newer one replaces the older.
 */
@Injectable()
export class PresenceService {
  private readonly socketByPlayer = new Map<string, string>();

  /** Returns the socket id this player had before, if any. */
  bind(playerId: string, socketId: string): string | undefined {
    const previous = this.socketByPlayer.get(playerId);
    this.socketByPlayer.set(playerId, socketId);
    return previous;
  }

  /** Returns true if `socketId` was the player's current socket. */
  unbind(playerId: string, socketId: string): boolean {
    if (this.socketByPlayer.get(playerId) !== socketId) return false;
    this.socketByPlayer.delete(playerId);
    return true;
  }

  socketOf(playerId: string): string | undefined {
    return this.socketByPlayer.get(playerId);
  }

  isOnline(playerId: string): boolean {
    return this.socketByPlayer.has(playerId);
  }
}
