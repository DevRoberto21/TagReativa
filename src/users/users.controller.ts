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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

interface AuthenticatedRequest {
  user: {
    userId: string;
  };
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post('register')
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
  deleteMe(@Request() req: AuthenticatedRequest) {
    return this.usersService.deleteMe(req.user.userId);
  }

  @Post('me/callmebot-test')
  @UseGuards(AuthGuard('jwt'))
  async testCallMeBot(
    @Request() req: { user: { userId: string } },
    @Body('apiKey') apiKey: string,
  ) {
    await this.usersService.testCallMeBot(req.user.userId, apiKey);
    return { ok: true };
  }
}
