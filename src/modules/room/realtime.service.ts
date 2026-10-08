import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Namespace } from 'socket.io';

import { PresenceService } from './presence.service';
import { RoomService } from './room.service';
import { buildRoomView } from './room.view';

export const PUBLIC_ROOMS_CHANNEL = 'public-rooms';
const PUBLIC_ROOMS_THROTTLE_MS = 1000;

/** Pushes room state to connected players. The gateway attaches the server. */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private server?: Namespace;
  private publicRoomsTimer?: NodeJS.Timeout;

  constructor(
    private readonly rooms: RoomService,
    private readonly presence: PresenceService,
  ) {}

  attach(server: Namespace) {
    this.server = server;
  }

  onModuleDestroy() {
    clearTimeout(this.publicRoomsTimer);
  }

  socket(socketId: string) {
    return this.server?.sockets.get(socketId);
  }

  /** Sends every connected room member their own view of the room. */
  async broadcast(roomCode: string) {
    this.schedulePublicRooms();
    if (!this.server) return;

    const room = await this.rooms.findByCode(roomCode).catch(() => null);
    if (!room) return;

    const isOnline = (id: string) => this.presence.isOnline(id);
    const now = Date.now();

    for (const player of room.players) {
      const socketId = this.presence.socketOf(player.id);
      if (!socketId) continue;
      this.server
        .to(socketId)
        .emit('room:state', buildRoomView(room, player, isOnline, now));
    }
  }

  /**
   * Any room change may affect the public list. Watchers get at most one
   * signal per interval and refetch with their own filters.
   */
  schedulePublicRooms() {
    if (this.publicRoomsTimer) return;
    this.publicRoomsTimer = setTimeout(() => {
      this.publicRoomsTimer = undefined;
      this.server?.to(PUBLIC_ROOMS_CHANNEL).emit('rooms:changed');
    }, PUBLIC_ROOMS_THROTTLE_MS);
  }
}
