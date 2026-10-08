import { Injectable, Logger } from '@nestjs/common';
import { Player } from '@prisma/client';
import {
  AccessToken,
  ParticipantInfo,
  RoomServiceClient,
  TrackSource,
} from 'livekit-server-sdk';

import { GameError } from '../../common/game-error';
import { LIVEKIT } from '../../env';
import { RoomService } from '../room/room.service';
import { RoomWithPlayers } from '../room/room.view';

const TOKEN_TTL = '6h';

/**
 * Voice & video through LiveKit. One LiveKit room per game room; the
 * participant identity is the player id. Without credentials voice is off.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly client: RoomServiceClient | null;

  constructor(private readonly rooms: RoomService) {
    this.client = this.enabled
      ? new RoomServiceClient(
          LIVEKIT.url.replace(/^ws/, 'http'),
          LIVEKIT.apiKey,
          LIVEKIT.apiSecret,
        )
      : null;
    if (!this.enabled)
      this.logger.warn('LiveKit is not configured, voice is disabled');
  }

  get enabled() {
    return Boolean(LIVEKIT.url && LIVEKIT.apiKey && LIVEKIT.apiSecret);
  }

  /**
   * Who may talk: everyone in the lobby and after the game; during the game
   * the moderator and players still in the game. Exiled players only listen.
   */
  canPublish(room: RoomWithPlayers, player: Player) {
    if (room.status !== 'PLAYING') return true;
    if (player.role === 'MODERATOR') return true;
    return player.isAlive && !player.hasLeft;
  }

  async token(playerId: string, code: string) {
    if (!this.enabled)
      throw new GameError('Голосовой чат не настроен на сервере');

    const room = await this.rooms.findByCode(code);
    const player = room.players.find((p) => p.id === playerId && !p.hasLeft);
    if (!player) throw new GameError('Игрок не найден');

    const token = new AccessToken(LIVEKIT.apiKey, LIVEKIT.apiSecret, {
      identity: player.id,
      name: player.name,
      ttl: TOKEN_TTL,
    });
    token.addGrant({
      room: this.roomName(code),
      roomJoin: true,
      canSubscribe: true,
      canPublish: this.canPublish(room, player),
      canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA],
      canPublishData: false,
    });

    return { url: LIVEKIT.url, token: await token.toJwt() };
  }

  /** Applies canPublish to everyone currently connected (after exile, end of game, …). */
  async syncPermissions(code: string) {
    if (!this.client) return;
    const room = await this.rooms.findByCode(code).catch(() => null);
    if (!room) return;

    const connected = await this.client
      .listParticipants(this.roomName(code))
      .catch((): ParticipantInfo[] => []);

    await Promise.all(
      connected.map(async (participant) => {
        const player = room.players.find((p) => p.id === participant.identity);
        const canPublish = player ? this.canPublish(room, player) : false;
        if (participant.permission?.canPublish === canPublish) return;

        await this.client!.updateParticipant(
          this.roomName(code),
          participant.identity,
          {
            permission: {
              canPublish,
              canSubscribe: true,
              canPublishData: false,
              canPublishSources: [TrackSource.MICROPHONE, TrackSource.CAMERA],
            },
          },
        );
      }),
    );
  }

  /** Moderator: mutes a player's microphone (they can unmute themselves). */
  async muteMicrophone(code: string, playerId: string) {
    if (!this.client)
      throw new GameError('Голосовой чат не настроен на сервере');

    const participant = await this.client
      .getParticipant(this.roomName(code), playerId)
      .catch(() => null);
    if (!participant) throw new GameError('Игрок не в голосовом чате');

    const mics = participant.tracks.filter(
      (track) => track.source === TrackSource.MICROPHONE && !track.muted,
    );
    await Promise.all(
      mics.map((track) =>
        this.client!.mutePublishedTrack(
          this.roomName(code),
          playerId,
          track.sid,
          true,
        ),
      ),
    );
  }

  /** Disconnects a player from voice (kicked from the room). */
  async remove(code: string, playerId: string) {
    await this.client
      ?.removeParticipant(this.roomName(code), playerId)
      .catch(() => undefined);
  }

  /** Fire-and-forget wrapper for callers holding the room lock. */
  syncLater(code: string) {
    void this.syncPermissions(code).catch((e: unknown) => this.logger.warn(e));
  }

  private roomName(code: string) {
    return `bunker-${code}`;
  }
}
