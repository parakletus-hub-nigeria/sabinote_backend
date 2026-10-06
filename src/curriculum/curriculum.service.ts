import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CurriculumStage, ReleaseStatus } from '@prisma/client';
import { SeedCurriculumDto } from './dto/seed-curriculum.dto';
import { SeedGeneralCurriculumDto } from './dto/seed-general-curriculum.dto';
import { CreateCurriculumReleaseDto } from './dto/create-curriculum-release.dto';
import { QueryReleasesDto } from './dto/query-releases.dto';
import { SeedCurriculumUnitsDto } from './dto/seed-curriculum-units.dto';
import { QueryCurriculumUnitsDto } from './dto/query-curriculum-units.dto';

// Unified shape returned to callers — same fields regardless of source
export type NormalizedCurriculum = {
  source: 'release' | 'state' | 'general';
  id: string;
  releaseId?: string;
  unitId?: string;
  state: string;
  subject: string;
  classLevel: string;
  term: number;
  week: number;
  topic: string;
  subTopics: string[];
  objectives: string[];
  competencies?: string[];
  teachingActivities?: string | null;
  teachingAids?: string | null;
  evaluation?: string | null;
  referenceText?: string | null;
};

// Cache TTLs (milliseconds)
const TTL = {
  STATES: 86_400_000,      // 24h — states never change between seeds
  WEEK_BY_ID: 86_400_000,  // 24h — curriculum content rarely changes
  SUBJECTS: 21_600_000,    // 6h
  WEEKS_LIST: 21_600_000,  // 6h
  WEEK_LOOKUP: 43_200_000, // 12h
  RELEASES: 3_600_000,     // 1h
};

@Injectable()
export class CurriculumService {
  private readonly logger = new Logger(CurriculumService.name);

  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  // ─── Curriculum Releases (v2 ARCH-007) ────────────────────────────────────

  /**
   * Browse published and draft curriculum releases by stage and status.
   */
  async getReleases(query: QueryReleasesDto) {
    const where: {
      stage?: CurriculumStage;
      status?: ReleaseStatus;
    } = {};

    if (query.stage) where.stage = query.stage;
    if (query.status) where.status = query.status;

    return this.prisma.curriculumRelease.findMany({
      where,
      include: {
        source: true,
        _count: { select: { units: true } },
      },
      orderBy: [
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Fetch a single curriculum release by its ID.
   */
  async getReleaseById(releaseId: string) {
    const release = await this.prisma.curriculumRelease.findUnique({
      where: { releaseId },
      include: {
        source: true,
        _count: { select: { units: true } },
      },
    });

    if (!release) {
      throw new NotFoundException(`Curriculum release ${releaseId} not found`);
    }

    return release;
  }

  /**
   * Create a new versioned curriculum release (admin only).
   */
  async createRelease(dto: CreateCurriculumReleaseDto) {
    let sourceId = dto.sourceId;

    if (!sourceId) {
      const code = (dto.sourceCode || 'NERDC').toUpperCase();
      const source = await this.prisma.curriculumSource.upsert({
        where: { code },
        update: {},
        create: {
          code,
          name:
            code === 'NAPPS'
              ? 'National Association of Proprietors of Private Schools'
              : code === 'LEGACY'
              ? 'Legacy Curriculum Archive'
              : 'Nigerian Educational Research and Development Council',
          authority:
            code === 'NAPPS' ? 'NAPPS National' : 'Federal Ministry of Education',
          jurisdiction: 'National',
        },
      });
      sourceId = source.sourceId;
    }

    const release = await this.prisma.curriculumRelease.create({
      data: {
        sourceId,
        releaseTag: dto.releaseTag,
        title: dto.title,
        stage: dto.stage,
        version: dto.version,
        status: dto.status ?? ReleaseStatus.draft,
        checksum: dto.checksum ?? null,
        publishedAt: dto.status === ReleaseStatus.published ? new Date() : null,
        metadata: dto.metadata ?? {},
      },
      include: { source: true },
    });

    await this.cache.delByPrefix('cur:');
    return release;
  }

  /**
   * Import and seed versioned curriculum units for a release.
   */
  async seedUnits(releaseId: string, dto: SeedCurriculumUnitsDto) {
    const release = await this.prisma.curriculumRelease.findUnique({
      where: { releaseId },
    });
    if (!release) {
      throw new NotFoundException(`Curriculum release ${releaseId} not found`);
    }

    const results = await Promise.allSettled(
      dto.units.map((u) =>
        this.prisma.curriculumUnit.upsert({
          where: {
            releaseId_classLevel_subject_term_week: {
              releaseId,
              classLevel: u.classLevel,
              subject: u.subject,
              term: u.term,
              week: u.week,
            },
          },
          update: {
            stage: release.stage,
            topic: u.topic,
            subTopics: u.subTopics ?? [],
            learningObjectives: u.learningObjectives ?? [],
            competencies: u.competencies ?? [],
            teachingActivities: u.teachingActivities ?? null,
            teachingAids: u.teachingAids ?? null,
            evaluationGuide: u.evaluationGuide ?? null,
            referenceMaterials: u.referenceMaterials ?? [],
            metadata: u.metadata ?? {},
          },
          create: {
            releaseId,
            stage: release.stage,
            classLevel: u.classLevel,
            subject: u.subject,
            term: u.term,
            week: u.week,
            topic: u.topic,
            subTopics: u.subTopics ?? [],
            learningObjectives: u.learningObjectives ?? [],
            competencies: u.competencies ?? [],
            teachingActivities: u.teachingActivities ?? null,
            teachingAids: u.teachingAids ?? null,
            evaluationGuide: u.evaluationGuide ?? null,
            referenceMaterials: u.referenceMaterials ?? [],
            metadata: u.metadata ?? {},
          },
        }),
      ),
    );

    await this.cache.delByPrefix('cur:');

    const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;

    if (rejected > 0) {
      this.logger.warn(`seedUnits: ${rejected}/${dto.units.length} unit rows rejected`);
    }

    return {
      upserted: fulfilled,
      failed: rejected,
      total: dto.units.length,
    };
  }

  /**
   * Query versioned curriculum units by classLevel, subject, term, and week.
   */
  async getUnits(releaseId: string, query: QueryCurriculumUnitsDto) {
    const release = await this.prisma.curriculumRelease.findUnique({
      where: { releaseId },
    });
    if (!release) {
      throw new NotFoundException(`Curriculum release ${releaseId} not found`);
    }

    const where: any = { releaseId };
    if (query.classLevel) {
      where.classLevel = { equals: query.classLevel, mode: 'insensitive' };
    }
    if (query.subject) {
      where.subject = { equals: query.subject, mode: 'insensitive' };
    }
    if (query.term !== undefined) {
      where.term = query.term;
    }
    if (query.week !== undefined) {
      where.week = query.week;
    }

    return this.prisma.curriculumUnit.findMany({
      where,
      orderBy: [
        { classLevel: 'asc' },
        { subject: 'asc' },
        { term: 'asc' },
        { week: 'asc' },
      ],
    });
  }

  /**
   * Lookup a versioned CurriculumUnit by its ID, returning a NormalizedCurriculum.
   */
  async getUnitById(unitId: string, teacherState?: string): Promise<NormalizedCurriculum> {
    return this.cache.wrap(
      `cur:unit:${unitId}:${teacherState ?? 'National'}`,
      async () => {
        const unit = await this.prisma.curriculumUnit.findUnique({
          where: { unitId },
          include: { release: true },
        });

        if (!unit) {
          throw new NotFoundException(`Curriculum unit ${unitId} not found`);
        }

        return {
          source: 'release',
          id: unit.unitId,
          unitId: unit.unitId,
          releaseId: unit.releaseId,
          state: teacherState || 'National',
          subject: unit.subject,
          classLevel: unit.classLevel,
          term: unit.term,
          week: unit.week,
          topic: unit.topic,
          subTopics: unit.subTopics ?? [],
          objectives: unit.learningObjectives ?? [],
          competencies: unit.competencies ?? [],
          teachingActivities: unit.teachingActivities,
          teachingAids: unit.teachingAids,
          evaluation: unit.evaluationGuide,
          referenceText: unit.referenceMaterials?.length
            ? unit.referenceMaterials.join(', ')
            : null,
        };
      },
      TTL.WEEK_BY_ID,
    );
  }

  // ─── Dual-Read Engine (v2 Release-First with Legacy Fallback) ─────────────

  async getStates(): Promise<string[]> {
    return this.cache.wrap(
      'cur:states',
      () =>
        this.prisma.curriculumWeek
          .findMany({ distinct: ['state'], select: { state: true }, orderBy: { state: 'asc' } })
          .then((rows) => rows.map((r) => r.state)),
      TTL.STATES,
    );
  }

  /**
   * Returns subjects available for a state + classLevel.
   * Merges subjects from:
   * 1. Published CurriculumUnit releases
   * 2. State-specific CurriculumWeek table
   * 3. National GeneralCurriculum table
   */
  async getSubjects(state: string, classLevel: string): Promise<string[]> {
    return this.cache.wrap(
      `cur:subjects:${state}:${classLevel}`,
      async () => {
        const [publishedUnits, stateRows, generalRows] = await Promise.all([
          this.prisma.curriculumUnit.findMany({
            where: {
              release: { status: ReleaseStatus.published },
              classLevel: { equals: classLevel, mode: 'insensitive' },
            },
            distinct: ['subject'],
            select: { subject: true },
            orderBy: { subject: 'asc' },
          }),
          this.prisma.curriculumWeek.findMany({
            where: { state, classLevel },
            distinct: ['subject'],
            select: { subject: true },
            orderBy: { subject: 'asc' },
          }),
          this.prisma.generalCurriculum.findMany({
            where: { classLevel },
            distinct: ['subject'],
            select: { subject: true },
            orderBy: { subject: 'asc' },
          }),
        ]);

        const seen = new Set<string>();
        const subjects: string[] = [];

        for (const r of [...publishedUnits, ...stateRows, ...generalRows]) {
          const s = r.subject.trim();
          const key = s.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            subjects.push(s);
          }
        }

        return subjects.sort((a, b) => a.localeCompare(b));
      },
      TTL.SUBJECTS,
    );
  }

  /**
   * Dual-read week list resolver.
   * 1. Resolves first from published CurriculumUnit releases.
   * 2. Seamlessly falls back to state-level CurriculumWeek and general GeneralCurriculum rows.
   */
  async getWeeks(
    state: string,
    subject: string,
    classLevel: string,
    term: number,
  ): Promise<{
    id: string;
    week: number;
    topic: string;
    source: 'release' | 'state' | 'general';
    releaseId?: string;
    unitId?: string;
  }[]> {
    return this.cache.wrap(
      `cur:weeks:${state}:${subject}:${classLevel}:${term}`,
      async () => {
        // 1. Dual-Read Step 1: Query published CurriculumUnit records first
        const publishedUnits = await this.prisma.curriculumUnit.findMany({
          where: {
            release: { status: ReleaseStatus.published },
            classLevel: { equals: classLevel, mode: 'insensitive' },
            subject: { equals: subject, mode: 'insensitive' },
            term,
          },
          select: {
            unitId: true,
            releaseId: true,
            week: true,
            topic: true,
            release: { select: { publishedAt: true } },
          },
          orderBy: [
            { release: { publishedAt: 'desc' } },
            { week: 'asc' },
          ],
        });

        const seenWeeks = new Set<number>();
        const results: {
          id: string;
          week: number;
          topic: string;
          source: 'release' | 'state' | 'general';
          releaseId?: string;
          unitId?: string;
        }[] = [];

        for (const u of publishedUnits) {
          if (!seenWeeks.has(u.week)) {
            seenWeeks.add(u.week);
            results.push({
              id: u.unitId,
              unitId: u.unitId,
              releaseId: u.releaseId,
              week: u.week,
              topic: u.topic,
              source: 'release',
            });
          }
        }

        // 2. Dual-Read Step 2: Graceful fallback to legacy rows for uncovered weeks
        const [stateRows, generalRows] = await Promise.all([
          this.prisma.curriculumWeek.findMany({
            where: { state, subject, classLevel, term },
            select: { curriculumWeekId: true, week: true, topic: true },
            orderBy: { week: 'asc' },
          }),
          this.prisma.generalCurriculum.findMany({
            where: { subject, classLevel, term },
            select: { generalCurriculumId: true, week: true, topic: true },
            orderBy: { week: 'asc' },
          }),
        ]);

        for (const r of stateRows) {
          if (!seenWeeks.has(r.week)) {
            seenWeeks.add(r.week);
            results.push({
              id: r.curriculumWeekId,
              week: r.week,
              topic: r.topic,
              source: 'state',
            });
          }
        }

        for (const r of generalRows) {
          if (!seenWeeks.has(r.week)) {
            seenWeeks.add(r.week);
            results.push({
              id: r.generalCurriculumId,
              week: r.week,
              topic: r.topic,
              source: 'general',
            });
          }
        }

        return results.sort((a, b) => a.week - b.week);
      },
      TTL.WEEKS_LIST,
    );
  }

  /**
   * Returns a single curriculum week using Dual-Read Engine:
   * 1. Tries published CurriculumUnit releases first.
   * 2. Falls back to state CurriculumWeek row.
   * 3. Falls back to national GeneralCurriculum row.
   */
  async getWeek(
    state: string,
    subject: string,
    classLevel: string,
    term: number,
    week: number,
  ): Promise<NormalizedCurriculum> {
    return this.cache.wrap(
      `cur:week:${state}:${subject}:${classLevel}:${term}:${week}`,
      async () => {
        // 1. Dual-Read Step 1: Query published CurriculumUnit records first
        const publishedUnit = await this.prisma.curriculumUnit.findFirst({
          where: {
            release: { status: ReleaseStatus.published },
            classLevel: { equals: classLevel, mode: 'insensitive' },
            subject: { equals: subject, mode: 'insensitive' },
            term,
            week,
          },
          include: { release: true },
          orderBy: [
            { release: { publishedAt: 'desc' } },
            { createdAt: 'desc' },
          ],
        });

        if (publishedUnit) {
          return {
            source: 'release',
            id: publishedUnit.unitId,
            unitId: publishedUnit.unitId,
            releaseId: publishedUnit.releaseId,
            state: state || 'National',
            subject: publishedUnit.subject,
            classLevel: publishedUnit.classLevel,
            term: publishedUnit.term,
            week: publishedUnit.week,
            topic: publishedUnit.topic,
            subTopics: publishedUnit.subTopics ?? [],
            objectives: publishedUnit.learningObjectives ?? [],
            competencies: publishedUnit.competencies ?? [],
            teachingActivities: publishedUnit.teachingActivities,
            teachingAids: publishedUnit.teachingAids,
            evaluation: publishedUnit.evaluationGuide,
            referenceText: publishedUnit.referenceMaterials?.length
              ? publishedUnit.referenceMaterials.join(', ')
              : null,
          };
        }

        // 2. Dual-Read Step 2: Try state-specific curriculum week table
        const stateRow = await this.prisma.curriculumWeek.findUnique({
          where: {
            state_subject_classLevel_term_week: {
              state,
              subject,
              classLevel,
              term,
              week,
            },
          },
        });

        if (stateRow) {
          return {
            source: 'state',
            id: stateRow.curriculumWeekId,
            ...stateRow,
          };
        }

        // 3. Dual-Read Step 3: Try general national curriculum table
        const generalRow = await this.prisma.generalCurriculum.findFirst({
          where: { subject, classLevel, term, week },
          orderBy: { year: { sort: 'desc', nulls: 'last' } },
        });

        if (generalRow) {
          return {
            source: 'general',
            id: generalRow.generalCurriculumId,
            state,
            ...generalRow,
          };
        }

        throw new NotFoundException(
          `No curriculum found for ${subject} ${classLevel} Term ${term} Week ${week} in published releases, ${state}, or general curriculum.`,
        );
      },
      TTL.WEEK_LOOKUP,
    );
  }

  /**
   * Looks up a state curriculum week by its primary key.
   */
  async getStateWeekById(curriculumWeekId: string): Promise<NormalizedCurriculum> {
    return this.cache.wrap(
      `cur:sw:${curriculumWeekId}`,
      async () => {
        const row = await this.prisma.curriculumWeek.findUnique({
          where: { curriculumWeekId },
        });
        if (!row) throw new NotFoundException('Curriculum week not found');
        return { source: 'state' as const, id: row.curriculumWeekId, ...row };
      },
      TTL.WEEK_BY_ID,
    );
  }

  /**
   * Looks up a general curriculum week by its primary key.
   */
  async getGeneralWeekById(
    generalCurriculumId: string,
    teacherState: string,
  ): Promise<NormalizedCurriculum> {
    return this.cache.wrap(
      `cur:gw:${generalCurriculumId}:${teacherState}`,
      async () => {
        const row = await this.prisma.generalCurriculum.findUnique({
          where: { generalCurriculumId },
        });
        if (!row) throw new NotFoundException('General curriculum week not found');
        return {
          source: 'general' as const,
          id: row.generalCurriculumId,
          state: teacherState,
          ...row,
        };
      },
      TTL.WEEK_BY_ID,
    );
  }

  // ─── Legacy Seeding Support ───────────────────────────────────────────────

  async seed(dto: SeedCurriculumDto) {
    const results = await Promise.allSettled(
      dto.weeks.map((w) =>
        this.prisma.curriculumWeek.upsert({
          where: {
            state_subject_classLevel_term_week: {
              state: w.state,
              subject: w.subject,
              classLevel: w.classLevel,
              term: w.term,
              week: w.week,
            },
          },
          update: w,
          create: w,
        }),
      ),
    );
    await this.cache.delByPrefix('cur:');
    return {
      upserted: results.filter((r) => r.status === 'fulfilled').length,
      total: dto.weeks.length,
    };
  }

  async seedGeneral(dto: SeedGeneralCurriculumDto) {
    const results = await Promise.allSettled(
      dto.weeks.map(async (w) => {
        const existing = await this.prisma.generalCurriculum.findFirst({
          where: {
            subject: w.subject,
            classLevel: w.classLevel,
            term: w.term,
            week: w.week,
            year: w.year ?? null,
          },
          select: { generalCurriculumId: true },
        });
        return existing
          ? this.prisma.generalCurriculum.update({
              where: { generalCurriculumId: existing.generalCurriculumId },
              data: w,
            })
          : this.prisma.generalCurriculum.create({ data: w });
      }),
    );
    await this.cache.delByPrefix('cur:');

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (failures.length) {
      const first = failures[0].reason;
      this.logger.error(
        `seedGeneral: ${failures.length}/${dto.weeks.length} rows failed. First error: ${first?.message ?? first}`,
      );
    }

    return {
      upserted: results.length - failures.length,
      failed: failures.length,
      total: dto.weeks.length,
      ...(failures.length
        ? { firstError: String(failures[0].reason?.message ?? failures[0].reason).slice(0, 300) }
        : {}),
    };
  }
}
