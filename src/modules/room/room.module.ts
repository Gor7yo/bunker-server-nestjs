import { Module } from '@nestjs/common';
import { RoomService } from './room.service';
import { RoomGateway } from './room.gateway';
import { DeckModule } from '../deck/deck.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [DeckModule, PrismaModule],
  providers: [RoomService, RoomGateway],
  exports: [RoomService],
})
export class RoomModule {}
