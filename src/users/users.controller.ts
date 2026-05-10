import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: { userId: string }) {
    return { success: true, data: await this.usersService.getProfile(user.userId) };
  }

  @Patch('profile')
  async updateProfile(@CurrentUser() user: { userId: string }, @Body() dto: UpdateProfileDto) {
    return { success: true, data: await this.usersService.updateProfile(user.userId, dto) };
  }

  @Get('settings')
  async getSettings(@CurrentUser() user: { userId: string }) {
    return { success: true, data: await this.usersService.getSettings(user.userId) };
  }

  @Patch('settings')
  async updateSettings(@CurrentUser() user: { userId: string }, @Body() dto: UpdateSettingsDto) {
    return { success: true, data: await this.usersService.updateSettings(user.userId, dto) };
  }

  @Delete('account')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@CurrentUser() user: { userId: string }) {
    await this.usersService.deleteAccount(user.userId);
    return { success: true, message: 'Account deleted' };
  }
}
