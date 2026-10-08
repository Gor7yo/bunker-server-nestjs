import { Module } from '@nestjs/common';
import { DeckService } from './deck.service';

@Module({
  providers: [DeckService],
  exports: [DeckService],
})
export class DeckModule {}
