import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { GameError } from '../../common/game-error';
import { parseRoomFilters } from './room.filters';
import { RoomService } from './room.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomService) {}

  /** GET /rooms?q=&mode=AUTO|MODERATED&freeSlots=1&sort=popular|new&limit= */
  @Get()
  list(@Query() query: Record<string, unknown>) {
    try {
      return this.rooms.listPublic(parseRoomFilters(query));
    } catch (e) {
      if (e instanceof GameError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}
