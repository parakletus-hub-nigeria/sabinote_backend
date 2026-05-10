import { BadRequestException, Body, Controller, Get, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ResourceType } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SeedCurriculumDto } from '../curriculum/dto/seed-curriculum.dto';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { CreditWalletDto } from './dto/credit-wallet.dto';

const PDF_UPLOAD_OPTIONS = {
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req: any, file: Express.Multer.File, cb: Function) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new BadRequestException('Only PDF files are accepted'), false);
    }
  },
};

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
    @Body('resourceName') resourceName: string,
    @Body('resourceType') resourceType: ResourceType,
    @Body('subject') subject?: string,
    @Body('classLevel') classLevel?: string,
    @Body('state') state?: string,
  ) {
    const data = await this.adminService.uploadPublicResource(user.userId, file, {
      resourceName, resourceType, subject, classLevel, state,
    });
    return { success: true, data };
  }
}
