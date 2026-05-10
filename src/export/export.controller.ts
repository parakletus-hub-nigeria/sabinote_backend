import { Controller, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExportService } from './export.service';

@UseGuards(JwtAuthGuard)
@Controller('export')
export class ExportController {
  constructor(private exportService: ExportService) {}

  @Post(':noteId/pdf')
  async exportPdf(
    @CurrentUser() user: { userId: string },
    @Param('noteId') noteId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.exportService.exportPdf(user.userId, noteId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post(':noteId/docx')
  async exportDocx(
    @CurrentUser() user: { userId: string },
    @Param('noteId') noteId: string,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.exportService.exportDocx(user.userId, noteId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
