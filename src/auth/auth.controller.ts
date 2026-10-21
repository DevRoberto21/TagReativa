import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { AuthCookieInterceptor, clearAuthCookie } from './auth-cookie';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { ConfirmTwoFactorDto } from './dto/confirm-two-factor.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

interface AuthenticatedRequest {
  user: { userId: string };
}

@Controller('auth')
@UseInterceptors(AuthCookieInterceptor)
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

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  changePassword(
    @Request() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.userId, dto);
  }

  // tokenVersion is per account, so this ends the session on every device.
  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(204)
  async logout(
    @Request() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.user.userId);
    clearAuthCookie(res);
  }

  @Post('2fa/enable')
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ default: { ttl: 60000, limit: 3 } })
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
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  disableTwoFactor(
    @Request() req: AuthenticatedRequest,
    @Body() dto: DisableTwoFactorDto,
  ) {
    return this.authService.disableTwoFactor(req.user.userId, dto);
  }
}
