import { Module } from '@nestjs/common';
import { RoomService } from './room.service';
import { RoomGateway } from './room.gateway';
import { DeckService } from '../deck/deck.service';

@Module({
  providers: [RoomService, RoomGateway, DeckService],
  exports: [RoomService],
  imports: [],
})
export class RoomModule {}
