import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

import { GameError } from '../../common/game-error';
import { CLIENT_ORIGIN } from '../../env';
import { RoomService } from '../room/room.service';
import { inRoom } from '../room/ws-utils';
import type { Body } from '../room/ws-utils';
import { VoiceService } from './voice.service';

@WebSocketGateway({ namespace: 'game', cors: { origin: CLIENT_ORIGIN } })
export class VoiceGateway {
  private readonly logger = new Logger(VoiceGateway.name);

  constructor(
    private readonly voice: VoiceService,
    private readonly rooms: RoomService,
  ) {}

  /** `{ url, token }` for connecting to the room's LiveKit room. */
  @SubscribeMessage('voice:token')
  token(@ConnectedSocket() client: Socket) {
    return inRoom(this.logger, client, ({ playerId, roomCode }) =>
      this.voice.token(playerId, roomCode),
    );
  }

  /** Moderator (or the host in the lobby) mutes someone's microphone. */
  @SubscribeMessage('voice:mute')
  mute(@ConnectedSocket() client: Socket, @MessageBody() body: Body) {
    return inRoom(this.logger, client, async ({ playerId, roomCode }) => {
      const room = await this.rooms.findByCode(roomCode);
      const actor = room.players.find((p) => p.id === playerId);
      const allowed =
        actor?.role === 'MODERATOR' ||
        (room.status === 'LOBBY' && actor?.isHost);
      if (!allowed)
        throw new GameError('Выключать микрофон может только ведущий');

      const targetId = body?.playerId;
      if (
        typeof targetId !== 'string' ||
        !room.players.some((p) => p.id === targetId)
      ) {
        throw new GameError('Игрок не найден');
      }
      await this.voice.muteMicrophone(roomCode, targetId);
    });
  }
}
