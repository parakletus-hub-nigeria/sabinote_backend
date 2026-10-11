import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
    const data = await this.authService.register(dto, meta);
    return { success: true, data };
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
    const data = await this.authService.login(dto, meta);
    return { success: true, data };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @CurrentUser() user: { userId: string; email: string; role: any },
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ) {
    const meta = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
    const data = await this.authService.refreshTokens(
      user.userId,
      dto.refreshToken,
      meta,
    );
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: { userId: string },
    @Body('refreshToken') refreshToken?: string,
  ) {
    await this.authService.logout(user.userId, refreshToken);
    return { success: true, message: 'Logged out successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: { userId: string }) {
    const data = await this.authService.getMe(user.userId);
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: { userId: string },
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    const data = await this.authService.changePassword(user.userId, dto, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    return { success: true, data };
  }

  // POST (not GET) so the current refresh token travels in the body, not the URL.
  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  @HttpCode(HttpStatus.OK)
  async sessions(
    @CurrentUser() user: { userId: string },
    @Body('refreshToken') refreshToken?: string,
  ) {
    return { success: true, data: await this.authService.listSessions(user.userId, refreshToken) };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-others')
  @HttpCode(HttpStatus.OK)
  async logoutOthers(
    @CurrentUser() user: { userId: string },
    @Body('refreshToken') refreshToken: string,
  ) {
    if (!refreshToken) throw new BadRequestException('refreshToken is required');
    await this.authService.logoutOthers(user.userId, refreshToken);
    return { success: true, message: 'Signed out of all other devices' };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @CurrentUser() user: { userId: string },
    @Param('sessionId') sessionId: string,
  ) {
    await this.authService.revokeSession(user.userId, sessionId);
    return { success: true, message: 'Session revoked' };
  }
}
