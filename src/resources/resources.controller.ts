import {
  BadRequestException,
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UploadResourceDto } from './dto/upload-resource.dto';
import { ResourcesService } from './resources.service';

// Browsers/OSes disagree on the PDF MIME type (Android and some Windows setups send
// octet-stream or x-pdf), so the filter is lenient and the real check is the %PDF magic
// bytes in ResourcesService.assertPdf.
const PDF_MIME_TYPES = new Set(['application/pdf', 'application/x-pdf', 'application/octet-stream']);

export const PDF_UPLOAD_OPTIONS = {
  limits: { fileSize: 30 * 1024 * 1024 },   // 30 MB — covers large textbooks
  fileFilter: (_req: any, file: Express.Multer.File, cb: Function) => {
    if (PDF_MIME_TYPES.has(file.mimetype) || /\.pdf$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Only PDF files are accepted'), false);
    }
  },
};

@UseGuards(JwtAuthGuard)
@Controller('resources')
export class ResourcesController {
  constructor(private resourcesService: ResourcesService) {}

  @Get()
  async list(
    @CurrentUser() user: { userId: string },
    @Query('state') state?: string,
    @Query('subject') subject?: string,
    @Query('classLevel') classLevel?: string,
  ) {
    return { success: true, data: await this.resourcesService.list(user.userId, state, subject, classLevel) };
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', PDF_UPLOAD_OPTIONS))
  async upload(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadResourceDto,
  ) {
    const data = await this.resourcesService.upload(user.userId, file, dto);
    return { success: true, data };
  }

  @Delete(':resourceId')
  @HttpCode(HttpStatus.OK)
  async delete(@CurrentUser() user: { userId: string }, @Param('resourceId') resourceId: string) {
    await this.resourcesService.delete(user.userId, resourceId);
    return { success: true, message: 'Resource deleted' };
  }

  @Get('match')
  async match(
    @Query('state') state: string,
    @Query('subject') subject: string,
    @Query('classLevel') classLevel: string,
  ) {
    return { success: true, data: await this.resourcesService.match(state, subject, classLevel) };
  }
}
