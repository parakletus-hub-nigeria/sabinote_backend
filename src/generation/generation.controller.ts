import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GenerateNoteDto } from './dto/generate-note.dto';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { RegenerateDto } from './dto/regenerate.dto';
import { GenerationService } from './generation.service';

@UseGuards(JwtAuthGuard)
@Controller('generate')
export class GenerationController {
  constructor(private generationService: GenerationService) {}

  @Post('lesson-plan')
  @HttpCode(HttpStatus.CREATED)
  async generatePlan(@CurrentUser() user: { userId: string }, @Body() dto: GeneratePlanDto) {
    return { success: true, data: await this.generationService.generatePlan(user.userId, dto) };
  }

  @Post('lesson-note')
  @HttpCode(HttpStatus.OK)
  async generateNote(@CurrentUser() user: { userId: string }, @Body() dto: GenerateNoteDto) {
    return { success: true, data: await this.generationService.generateNote(user.userId, dto) };
  }

  // Streaming variant — Server-Sent Events. Pre-check failures still return a
  // normal JSON error (thrown before the stream opens); once streaming starts,
  // progress is emitted as `token` events and the result as a final `done` event.
  @Post('lesson-note/stream')
  async streamNote(
    @CurrentUser() user: { userId: string },
    @Body() dto: GenerateNoteDto,
    @Res() res: Response,
  ) {
    await this.generationService.streamNote(user.userId, dto, res);
  }

  @Post('regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerate(@CurrentUser() user: { userId: string }, @Body() dto: RegenerateDto) {
    return { success: true, data: await this.generationService.regenerate(user.userId, dto) };
  }
}
