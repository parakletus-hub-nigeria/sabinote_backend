import { Body, Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SeedCurriculumDto } from '../curriculum/dto/seed-curriculum.dto';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { CreditWalletDto } from './dto/credit-wallet.dto';
import { UploadResourceDto } from '../resources/dto/upload-resource.dto';
import { PDF_UPLOAD_OPTIONS } from '../resources/resources.controller';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  async getUsers(@Query('page') page = '1', @Query('limit') limit = '20') {
    return { success: true, data: await this.adminService.getUsers(+page, +limit) };
  }

  @Get('stats')
  async getStats() {
    return { success: true, data: await this.adminService.getStats() };
  }

  @Post('curriculum/seed')
  async seedCurriculum(@Body() dto: SeedCurriculumDto) {
    return { success: true, data: await this.adminService.seedCurriculum(dto) };
  }

  @Post('credit')
  async credit(@Body() dto: CreditWalletDto) {
    return { success: true, data: await this.adminService.creditWallet(dto) };
  }

  @Get('transactions')
  async getTransactions(@Query('page') page = '1', @Query('limit') limit = '20') {
    return { success: true, data: await this.adminService.getTransactions(+page, +limit) };
  }

  @Post('resources/upload')
  @UseInterceptors(FileInterceptor('file', PDF_UPLOAD_OPTIONS))
  async uploadResource(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadResourceDto,
  ) {
    const data = await this.adminService.uploadPublicResource(user.userId, file, dto);
    return { success: true, data };
  }
}
