import { Module } from '@nestjs/common';
import { RoomModule } from './modules/room/room.module';
import { DeckModule } from './modules/deck/deck.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, DeckModule, RoomModule],
})
export class AppModule {}
