import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
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

  @Post('regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerate(@CurrentUser() user: { userId: string }, @Body() dto: RegenerateDto) {
    return { success: true, data: await this.generationService.regenerate(user.userId, dto) };
  }
}
