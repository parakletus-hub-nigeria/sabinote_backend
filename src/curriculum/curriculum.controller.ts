import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurriculumService } from './curriculum.service';
import { SeedCurriculumDto } from './dto/seed-curriculum.dto';

@UseGuards(JwtAuthGuard)
@Controller('curriculum')
export class CurriculumController {
  constructor(private curriculumService: CurriculumService) {}

  @Get('states')
  async getStates() {
    return { success: true, data: { states: await this.curriculumService.getStates() } };
  }

  @Get('subjects')
  async getSubjects(@Query('state') state: string, @Query('classLevel') classLevel: string) {
    return { success: true, data: { subjects: await this.curriculumService.getSubjects(state, classLevel) } };
  }

  @Get('weeks')
  async getWeeks(
    @Query('state') state: string, @Query('subject') subject: string,
    @Query('classLevel') classLevel: string, @Query('term') term: string,
  ) {
    return { success: true, data: { weeks: await this.curriculumService.getWeeks(state, subject, classLevel, +term) } };
  }

  @Get('week')
  async getWeek(
    @Query('state') state: string, @Query('subject') subject: string,
    @Query('classLevel') classLevel: string, @Query('term') term: string,
    @Query('week') week: string,
  ) {
    return { success: true, data: await this.curriculumService.getWeek(state, subject, classLevel, +term, +week) };
  }

  @Post('seed')
  async seed(@Body() dto: SeedCurriculumDto) {
    return { success: true, data: await this.curriculumService.seed(dto) };
  }
}
