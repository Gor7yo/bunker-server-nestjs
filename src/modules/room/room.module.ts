import { Module } from '@nestjs/common';
import { DeckModule } from '../deck/deck.module';
import { GameGateway } from '../game/game.gateway';
import { GameService } from '../game/game.service';
import { PresenceService } from './presence.service';
import { RealtimeService } from './realtime.service';
import { RoomLock } from './room-lock.service';
import { RoomGateway } from './room.gateway';
import { RoomService } from './room.service';
import { RoomsController } from './rooms.controller';
import { VoiceGateway } from '../voice/voice.gateway';
import { VoiceService } from '../voice/voice.service';

/** Rooms, lobby and the game share presence, the room lock and broadcasting. */
@Module({
  imports: [DeckModule],
  controllers: [RoomsController],
  providers: [
    RoomService,
    PresenceService,
    RoomLock,
    RealtimeService,
    GameService,
    VoiceService,
    RoomGateway,
    GameGateway,
    VoiceGateway,
  ],
})
export class RoomModule {}
