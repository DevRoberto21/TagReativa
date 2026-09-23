import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { ConfirmTwoFactorDto } from './dto/confirm-two-factor.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';

interface AuthenticatedRequest {
  user: { userId: string };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('login/verify-2fa')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  verifyTwoFactorLogin(@Body() dto: VerifyTwoFactorDto) {
    return this.authService.verifyTwoFactorLogin(dto);
  }

  @Post('forgot-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('2fa/enable')
  @UseGuards(AuthGuard('jwt'))
  enableTwoFactor(@Request() req: AuthenticatedRequest) {
    return this.authService.enableTwoFactor(req.user.userId);
  }

  @Post('2fa/confirm')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  confirmTwoFactor(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ConfirmTwoFactorDto,
  ) {
    return this.authService.confirmTwoFactor(req.user.userId, dto);
  }

  @Post('2fa/disable')
  @UseGuards(AuthGuard('jwt'))
  disableTwoFactor(
    @Request() req: AuthenticatedRequest,
    @Body() dto: DisableTwoFactorDto,
  ) {
    return this.authService.disableTwoFactor(req.user.userId, dto);
  }
}
