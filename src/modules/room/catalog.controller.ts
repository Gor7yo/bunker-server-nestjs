import { Controller, Get } from '@nestjs/common';

import { CARD_KEYS } from '../deck/card.types';
import { ACTION_NEEDS, builtinItems } from '../deck/deck.rules';
import { BUNKER_FEATURES, BUNKERS, CATASTROPHES } from '../game/data/scenarios';
import { CUSTOM_LIMITS } from './room.settings';

/** Static game content for the room customization screen. */
@Controller('catalog')
export class CatalogController {
  private readonly catalog = {
    catastrophes: CATASTROPHES,
    bunkers: BUNKERS,
    bunkerFeatures: BUNKER_FEATURES,
    /** Built-in values of every characteristic. */
    cards: Object.fromEntries(CARD_KEYS.map((key) => [key, builtinItems(key)])),
    /** Action card → characteristics it needs (any of them). */
    actionNeeds: ACTION_NEEDS,
    limits: CUSTOM_LIMITS,
  };

  /** GET /catalog */
  @Get()
  get() {
    return this.catalog;
  }
}
