import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { CurriculumService } from './curriculum.service';
import { SeedCurriculumDto } from './dto/seed-curriculum.dto';
import { SeedGeneralCurriculumDto } from './dto/seed-general-curriculum.dto';
import { CreateCurriculumReleaseDto } from './dto/create-curriculum-release.dto';
import { QueryReleasesDto } from './dto/query-releases.dto';
import { SeedCurriculumUnitsDto } from './dto/seed-curriculum-units.dto';
import { QueryCurriculumUnitsDto } from './dto/query-curriculum-units.dto';

@ApiTags('Curriculum')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('curriculum')
export class CurriculumController {
  constructor(private curriculumService: CurriculumService) {}

  // ─── Curriculum Releases (v2 ARCH-007) ────────────────────────────────────

  @Get('releases')
  @ApiOperation({
    summary: 'Browse curriculum releases',
    description:
      'Browse published and draft curriculum releases filtered optionally by stage and status.',
  })
  @ApiResponse({ status: 200, description: 'List of matching curriculum releases.' })
  async getReleases(@Query() query: QueryReleasesDto) {
    return {
      success: true,
      data: { releases: await this.curriculumService.getReleases(query) },
    };
  }

  @Post('releases')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new curriculum release (Admin)',
    description:
      'Creates a new versioned release entity (e.g. NERDC-JSS-2025.1, SABINOTE-ECE-2025.1).',
  })
  @ApiResponse({ status: 201, description: 'Curriculum release successfully created.' })
  async createRelease(@Body() dto: CreateCurriculumReleaseDto) {
    return {
      success: true,
      data: await this.curriculumService.createRelease(dto),
    };
  }

  @Post('releases/:id/units')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Import and seed versioned units (Admin)',
    description:
      'Bulk imports or upserts canonical curriculum units for a specific release ID.',
  })
  @ApiParam({ name: 'id', description: 'Curriculum Release UUID' })
  @ApiResponse({ status: 200, description: 'Units imported/upserted successfully.' })
  async seedUnits(
    @Param('id') releaseId: string,
    @Body() dto: SeedCurriculumUnitsDto,
  ) {
    return {
      success: true,
      data: await this.curriculumService.seedUnits(releaseId, dto),
    };
  }

  @Get('releases/:id/units')
  @ApiOperation({
    summary: 'Query versioned units for a release',
    description:
      'Query units belonging to a specific release filtered by classLevel, subject, term, and week.',
  })
  @ApiParam({ name: 'id', description: 'Curriculum Release UUID' })
  @ApiResponse({ status: 200, description: 'List of matching curriculum units.' })
  async getUnits(
    @Param('id') releaseId: string,
    @Query() query: QueryCurriculumUnitsDto,
  ) {
    return {
      success: true,
      data: {
        units: await this.curriculumService.getUnits(releaseId, query),
      },
    };
  }

  // ─── Dual-Read Browse (Fallback-Aware) ───────────────────────────────────

  @Get('states')
  @ApiOperation({ summary: 'Get list of available states' })
  async getStates() {
    return {
      success: true,
      data: { states: await this.curriculumService.getStates() },
    };
  }

  @Get('subjects')
  @ApiOperation({
    summary: 'Get subjects for a state and class level',
    description:
      'Merges subjects from published curriculum units, state tables, and general tables.',
  })
  async getSubjects(
    @Query('state') state: string,
    @Query('classLevel') classLevel: string,
  ) {
    return {
      success: true,
      data: {
        subjects: await this.curriculumService.getSubjects(state, classLevel),
      },
    };
  }

  /**
   * Returns weeks for a given state/subject/classLevel/term.
   * Each item carries a `source` ('release' | 'state' | 'general') and an `id`.
   */
  @Get('weeks')
  @ApiOperation({
    summary: 'Get weeks list (Dual-Read Engine)',
    description:
      'Resolves weeks from published CurriculumUnit releases first, gracefully falling back to legacy state and general rows.',
  })
  async getWeeks(
    @Query('state') state: string,
    @Query('subject') subject: string,
    @Query('classLevel') classLevel: string,
    @Query('term') term: string,
  ) {
    return {
      success: true,
      data: {
        weeks: await this.curriculumService.getWeeks(
          state,
          subject,
          classLevel,
          +term,
        ),
      },
    };
  }

  /**
   * Returns a single week — published releases preferred, state table next, general table as fallback.
   */
  @Get('week')
  @ApiOperation({
    summary: 'Get a single week curriculum content (Dual-Read Engine)',
  })
  async getWeek(
    @Query('state') state: string,
    @Query('subject') subject: string,
    @Query('classLevel') classLevel: string,
    @Query('term') term: string,
    @Query('week') week: string,
  ) {
    return {
      success: true,
      data: await this.curriculumService.getWeek(
        state,
        subject,
        classLevel,
        +term,
        +week,
      ),
    };
  }

  // ─── Legacy Admin Seeding ────────────────────────────────────────────────

  /** Seed state-specific curriculum weeks (admin only). */
  @Post('seed')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Seed legacy state curriculum weeks (Admin)' })
  async seed(@Body() dto: SeedCurriculumDto) {
    return { success: true, data: await this.curriculumService.seed(dto) };
  }

  /** Seed national (general) curriculum weeks (admin only). */
  @Post('general/seed')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Seed legacy national general curriculum weeks (Admin)' })
  async seedGeneral(@Body() dto: SeedGeneralCurriculumDto) {
    return {
      success: true,
      data: await this.curriculumService.seedGeneral(dto),
    };
  }
}
