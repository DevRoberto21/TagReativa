import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Credenciais inválidas.');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas.');

    const payload = { sub: user.id, email: user.email };
    return { access_token: this.jwtService.sign(payload) };
  }
}
