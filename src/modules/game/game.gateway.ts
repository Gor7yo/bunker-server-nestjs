import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

import { CLIENT_ORIGIN } from '../../env';
import { inRoom } from '../room/ws-utils';
import type { Body } from '../room/ws-utils';
import { GameService } from './game.service';

/**
 * Game commands. Each one answers `{ ok, error? }`; the new state comes to
 * everyone as `room:state`. Room locking happens inside GameService.
 */
@WebSocketGateway({ namespace: 'game', cors: { origin: CLIENT_ORIGIN } })
export class GameGateway {
  private readonly logger = new Logger(GameGateway.name);

  constructor(private readonly game: GameService) {}

  private run(
    client: Socket,
    action: (playerId: string, code: string) => Promise<void>,
  ) {
    return inRoom(this.logger, client, ({ playerId, roomCode }) =>
      action(playerId, roomCode),
    );
  }

  // ---- host ----

  @SubscribeMessage('game:start')
  start(@ConnectedSocket() c: Socket) {
    return this.run(c, (id, code) => this.game.start(id, code));
  }

  @SubscribeMessage('game:backToLobby')
  backToLobby(@ConnectedSocket() c: Socket) {
    return this.run(c, (id, code) => this.game.backToLobby(id, code));
  }

  // ---- players ----

  @SubscribeMessage('game:reveal')
  reveal(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.reveal(id, code, body));
  }

  @SubscribeMessage('game:endTurn')
  endTurn(@ConnectedSocket() c: Socket) {
    return this.run(c, (id, code) => this.game.endTurn(id, code));
  }

  @SubscribeMessage('game:readyToVote')
  readyToVote(@ConnectedSocket() c: Socket) {
    return this.run(c, (id, code) => this.game.readyToVote(id, code));
  }

  @SubscribeMessage('game:vote')
  vote(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.vote(id, code, body));
  }

  // ---- moderator ----

  @SubscribeMessage('mod:phase')
  modPhase(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.modPhase(id, code, body));
  }

  @SubscribeMessage('mod:speaker')
  modSpeaker(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.modSpeaker(id, code, body));
  }

  @SubscribeMessage('mod:startVoting')
  modStartVoting(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.modStartVoting(id, code, body));
  }

  @SubscribeMessage('mod:closeVoting')
  modCloseVoting(@ConnectedSocket() c: Socket) {
    return this.run(c, (id, code) => this.game.modCloseVoting(id, code));
  }

  @SubscribeMessage('mod:exile')
  modExile(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.modExile(id, code, body));
  }

  @SubscribeMessage('mod:revive')
  modRevive(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.modRevive(id, code, body));
  }

  @SubscribeMessage('mod:reveal')
  modReveal(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.modReveal(id, code, body));
  }

  @SubscribeMessage('mod:hide')
  modHide(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.modHide(id, code, body));
  }

  @SubscribeMessage('mod:reroll')
  modReroll(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.modReroll(id, code, body));
  }

  @SubscribeMessage('mod:swap')
  modSwap(@ConnectedSocket() c: Socket, @MessageBody() body: Body) {
    return this.run(c, (id, code) => this.game.modSwap(id, code, body));
  }

  @SubscribeMessage('mod:nextRound')
  modNextRound(@ConnectedSocket() c: Socket) {
    return this.run(c, (id, code) => this.game.modNextRound(id, code));
  }

  @SubscribeMessage('mod:finish')
  modFinish(@ConnectedSocket() c: Socket) {
    return this.run(c, (id, code) => this.game.modFinish(id, code));
  }
}
