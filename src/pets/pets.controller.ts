import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PetsService } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';

interface AuthenticatedRequest {
  user: {
    userId: string;
  };
}

@UseGuards(AuthGuard('jwt'))
@Controller('pets')
export class PetsController {
  constructor(private readonly petsService: PetsService) {}

  @Post()
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreatePetDto) {
    return this.petsService.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Request() req: AuthenticatedRequest) {
    return this.petsService.findAllByOwner(req.user.userId);
  }
}
