import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Patch,
  Delete,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

interface AuthenticatedRequest {
  user: {
    userId: string;
  };
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  findMe(@Request() req: AuthenticatedRequest) {
    return this.usersService.findMe(req.user.userId);
  }

  @UseGuards(AuthGuard('jwt'))
  @Patch('me')
  updateMe(@Body() dto: UpdateUserDto, @Request() req: AuthenticatedRequest) {
    return this.usersService.updateMe(req.user.userId, dto);
  }

  @UseGuards(AuthGuard('jwt'))
  @Delete('me')
  deleteMe(
    @Body() dto: DeleteAccountDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.deleteMe(req.user.userId, dto);
  }
}
