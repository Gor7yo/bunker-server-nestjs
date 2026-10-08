import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Player } from '@prisma/client';
import { Namespace, Socket } from 'socket.io';

import { CLIENT_ORIGIN } from '../../env';
import { GameService } from '../game/game.service';
import { VoiceService } from '../voice/voice.service';
import { PresenceService } from './presence.service';
import { PUBLIC_ROOMS_CHANNEL, RealtimeService } from './realtime.service';
import { RoomLock } from './room-lock.service';
import { RoomService, normalizeCode } from './room.service';
import { handleWs, inRoom, roomChannel, sessionOf } from './ws-utils';
import type { Body, SocketSession } from './ws-utils';

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Rooms and lobby. Client → server events answer through the socket.io ack
 * with `{ ok, data | error }`; state changes are pushed as `room:state`.
 */
@WebSocketGateway({ namespace: 'game', cors: { origin: CLIENT_ORIGIN } })
export class RoomGateway
  implements OnGatewayInit, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RoomGateway.name);
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly rooms: RoomService,
    private readonly game: GameService,
    private readonly presence: PresenceService,
    private readonly realtime: RealtimeService,
    private readonly lock: RoomLock,
    private readonly voice: VoiceService,
  ) {}

  afterInit(server: Namespace) {
    this.realtime.attach(server);
  }

  onModuleInit() {
    this.cleanupTimer = setInterval(() => {
      this.rooms
        .deleteAbandoned()
        .then((count) => {
          if (count === 0) return;
          this.logger.log(`Deleted ${count} abandoned room(s)`);
          this.realtime.schedulePublicRooms();
        })
        .catch((e: unknown) => this.logger.error(e));
    }, CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  async handleDisconnect(client: Socket) {
    const session = sessionOf(client);
    if (!session) return;

    if (this.presence.unbind(session.playerId, client.id)) {
      await this.lock.run(session.roomCode, () =>
        this.realtime.broadcast(session.roomCode),
      );
    }
  }

  /**
   * Home page: subscribe to `rooms:changed` signals. The list itself is
   * fetched over HTTP (GET /rooms) with the client's own filters.
   */
  @SubscribeMessage('rooms:watch')
  watchRooms(@ConnectedSocket() client: Socket) {
    return handleWs(this.logger, async () => {
      await client.join(PUBLIC_ROOMS_CHANNEL);
    });
  }

  @SubscribeMessage('rooms:unwatch')
  unwatchRooms(@ConnectedSocket() client: Socket) {
    return handleWs(this.logger, async () => {
      await client.leave(PUBLIC_ROOMS_CHANNEL);
    });
  }

  @SubscribeMessage('room:create')
  create(@ConnectedSocket() client: Socket, @MessageBody() body: Body) {
    return handleWs(this.logger, async () => {
      const { room, player } = await this.rooms.create(
        body?.name,
        body?.settings,
      );
      return this.lock.run(room.code, () =>
        this.enter(client, player, room.code),
      );
    });
  }

  @SubscribeMessage('room:join')
  join(@ConnectedSocket() client: Socket, @MessageBody() body: Body) {
    return handleWs(this.logger, async () => {
      const code = normalizeCode(body?.code);
      return this.lock.run(code, async () => {
        const { player } = await this.rooms.join(code, body?.name);
        return this.enter(client, player, code);
      });
    });
  }

  @SubscribeMessage('session:resume')
  resume(@ConnectedSocket() client: Socket, @MessageBody() body: Body) {
    return handleWs(this.logger, async () => {
      const player = await this.rooms.findByToken(body?.token);
      return this.lock.run(player.room.code, () =>
        this.enter(client, player, player.room.code),
      );
    });
  }

  @SubscribeMessage('room:leave')
  leave(@ConnectedSocket() client: Socket) {
    return this.inRoom(client, async ({ playerId, roomCode }) => {
      const result = await this.rooms.leave(playerId, roomCode);
      this.detach(client, playerId, roomCode);
      void this.voice.remove(roomCode, playerId);
      if (result.deleted) {
        this.realtime.schedulePublicRooms();
        return;
      }
      if (result.duringGame) {
        await this.game.afterLeaveLocked(roomCode, playerId);
      }
      await this.realtime.broadcast(roomCode);
    });
  }

  @SubscribeMessage('lobby:ready')
  ready(@ConnectedSocket() client: Socket, @MessageBody() body: Body) {
    return this.inRoom(client, async ({ playerId, roomCode }) => {
      await this.rooms.setReady(playerId, roomCode, body?.ready);
      await this.realtime.broadcast(roomCode);
    });
  }

  @SubscribeMessage('lobby:settings')
  settings(@ConnectedSocket() client: Socket, @MessageBody() body: Body) {
    return this.inRoom(client, async ({ playerId, roomCode }) => {
      await this.rooms.updateSettings(playerId, roomCode, body?.settings);
      await this.realtime.broadcast(roomCode);
    });
  }

  @SubscribeMessage('lobby:setModerator')
  setModerator(@ConnectedSocket() client: Socket, @MessageBody() body: Body) {
    return this.inRoom(client, async ({ playerId, roomCode }) => {
      await this.rooms.setModerator(playerId, roomCode, body?.playerId);
      await this.realtime.broadcast(roomCode);
    });
  }

  @SubscribeMessage('room:transferHost')
  transferHost(@ConnectedSocket() client: Socket, @MessageBody() body: Body) {
    return this.inRoom(client, async ({ playerId, roomCode }) => {
      await this.rooms.transferHost(playerId, roomCode, body?.playerId);
      await this.realtime.broadcast(roomCode);
    });
  }

  @SubscribeMessage('lobby:kick')
  kick(@ConnectedSocket() client: Socket, @MessageBody() body: Body) {
    return this.inRoom(client, async ({ playerId, roomCode }) => {
      const kicked = await this.rooms.kick(playerId, roomCode, body?.playerId);

      const kickedSocketId = this.presence.socketOf(kicked.id);
      const kickedSocket = kickedSocketId
        ? this.realtime.socket(kickedSocketId)
        : undefined;
      if (kickedSocket) {
        kickedSocket.emit('room:kicked');
        this.detach(kickedSocket, kicked.id, roomCode);
      }
      void this.voice.remove(roomCode, kicked.id);

      await this.realtime.broadcast(roomCode);
    });
  }

  /** Binds the socket to the player and returns what the client must store. */
  private async enter(client: Socket, player: Player, roomCode: string) {
    const previous = sessionOf(client);
    if (previous && previous.playerId !== player.id) {
      this.detach(client, previous.playerId, previous.roomCode);
      await this.realtime.broadcast(previous.roomCode);
    }

    const replacedSocketId = this.presence.bind(player.id, client.id);
    if (replacedSocketId && replacedSocketId !== client.id) {
      const replaced = this.realtime.socket(replacedSocketId);
      replaced?.emit('session:replaced');
      replaced?.disconnect(true);
    }

    const session: SocketSession = { playerId: player.id, roomCode };
    client.data = session;
    await client.join(roomChannel(roomCode));
    await this.realtime.broadcast(roomCode);

    return { code: roomCode, token: player.token };
  }

  private detach(client: Socket, playerId: string, roomCode: string) {
    this.presence.unbind(playerId, client.id);
    void client.leave(roomChannel(roomCode));
    client.data = undefined;
  }

  private inRoom(
    client: Socket,
    action: (session: SocketSession) => Promise<void>,
  ) {
    return inRoom(this.logger, client, (session) =>
      this.lock.run(session.roomCode, () => action(session)),
    );
  }
}
