import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  async getAll(
    @CurrentUser() user: { userId: string },
    @Query('page') page = '1', @Query('limit') limit = '20',
  ) {
    return { success: true, data: await this.notificationsService.getAll(user.userId, +page, +limit) };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentUser() user: { userId: string }) {
    await this.notificationsService.markAllRead(user.userId);
    return { success: true, message: 'All notifications marked as read' };
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return { success: true, data: await this.notificationsService.markRead(user.userId, id) };
  }
}
