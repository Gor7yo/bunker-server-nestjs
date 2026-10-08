import { GameService } from './game.service';
import { CreateGameDto } from './dto/create-game.dto';
import { UpdateGameDto } from './dto/update-game.dto';
export declare class GameGateway {
    private readonly gameService;
    constructor(gameService: GameService);
    create(createGameDto: CreateGameDto): string;
    findAll(): string;
    findOne(id: number): string;
    update(updateGameDto: UpdateGameDto): string;
    remove(id: number): string;
}
