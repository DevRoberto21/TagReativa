import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PetsService } from './pets.service';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetStatusDto } from './dto/update-pet-status.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

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
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.petsService.findOne(id, req.user.userId);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdatePetStatusDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.petsService.updateStatus(id, req.user.userId, dto.status);
  }

  @Patch(':id')
  updatePet(
    @Param('id') id: string,
    @Body() dto: UpdatePetDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.petsService.updatePet(id, req.user.userId, dto);
  }

  @Delete(':id')
  deletePet(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.petsService.deletePet(id, req.user.userId);
  }

  @Get(':id/scans')
  findScans(@Param('id') id: string, @Request() req: AuthenticatedRequest) {
    return this.petsService.findScans(id, req.user.userId);
  }
}
