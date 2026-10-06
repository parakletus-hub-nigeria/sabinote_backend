import { NotFoundException } from '@nestjs/common';
import { CurriculumService } from './curriculum.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CurriculumStage, ReleaseStatus } from '@prisma/client';

describe('CurriculumService (v2 Release & Dual-Read Engine)', () => {
  let service: CurriculumService;
  let prisma: any;
  let cache: any;

  beforeEach(() => {
    cache = {
      wrap: jest.fn().mockImplementation((key, fn) => fn()),
      delByPrefix: jest.fn().mockResolvedValue(true),
    };

    prisma = {
      curriculumSource: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
      curriculumRelease: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      curriculumUnit: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      curriculumWeek: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
      generalCurriculum: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new CurriculumService(
      prisma as unknown as PrismaService,
      cache as unknown as CacheService,
    );
  });

  describe('Curriculum Releases & Units Management', () => {
    it('should create a new release and auto-upsert source if not provided', async () => {
      prisma.curriculumSource.upsert.mockResolvedValue({
        sourceId: 'src-nerdc',
        code: 'NERDC',
        name: 'Nigerian Educational Research and Development Council',
      });

      prisma.curriculumRelease.create.mockResolvedValue({
        releaseId: 'rel-1',
        releaseTag: 'NERDC-JSS-2025.1',
        title: 'NERDC JSS 2025 Edition',
        stage: CurriculumStage.junior_secondary,
        version: '2025.1',
        status: ReleaseStatus.published,
      });

      const res = await service.createRelease({
        releaseTag: 'NERDC-JSS-2025.1',
        title: 'NERDC JSS 2025 Edition',
        stage: CurriculumStage.junior_secondary,
        version: '2025.1',
        status: ReleaseStatus.published,
      });

      expect(prisma.curriculumSource.upsert).toHaveBeenCalled();
      expect(prisma.curriculumRelease.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            releaseTag: 'NERDC-JSS-2025.1',
            sourceId: 'src-nerdc',
          }),
        }),
      );
      expect(cache.delByPrefix).toHaveBeenCalledWith('cur:');
      expect(res.releaseId).toBe('rel-1');
    });

    it('should query releases filtered by stage and status', async () => {
      prisma.curriculumRelease.findMany.mockResolvedValue([
        {
          releaseId: 'rel-1',
          releaseTag: 'NERDC-JSS-2025.1',
          stage: CurriculumStage.junior_secondary,
          status: ReleaseStatus.published,
        },
      ]);

      const res = await service.getReleases({
        stage: CurriculumStage.junior_secondary,
        status: ReleaseStatus.published,
      });

      expect(prisma.curriculumRelease.findMany).toHaveBeenCalledWith({
        where: {
          stage: CurriculumStage.junior_secondary,
          status: ReleaseStatus.published,
        },
        include: {
          source: true,
          _count: { select: { units: true } },
        },
        orderBy: [
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
      });
      expect(res).toHaveLength(1);
    });

    it('should seed units into a release and invalidate cache', async () => {
      prisma.curriculumRelease.findUnique.mockResolvedValue({
        releaseId: 'rel-1',
        stage: CurriculumStage.junior_secondary,
      });

      prisma.curriculumUnit.upsert.mockResolvedValue({
        unitId: 'unit-1',
        classLevel: 'JSS 1',
        subject: 'Mathematics',
        term: 1,
        week: 1,
      });

      const res = await service.seedUnits('rel-1', {
        units: [
          {
            classLevel: 'JSS 1',
            subject: 'Mathematics',
            term: 1,
            week: 1,
            topic: 'Whole Numbers',
            subTopics: ['Place value'],
            learningObjectives: ['Identify place values'],
          },
        ],
      });

      expect(res.upserted).toBe(1);
      expect(res.total).toBe(1);
      expect(cache.delByPrefix).toHaveBeenCalledWith('cur:');
    });
  });

  describe('Dual-Read Engine (v2 Release Priority with Legacy Fallback)', () => {
    it('should resolve weeks from published CurriculumUnit releases first', async () => {
      // Mock published units for Week 1 & Week 2
      prisma.curriculumUnit.findMany.mockResolvedValue([
        {
          unitId: 'unit-w1',
          releaseId: 'rel-2025',
          week: 1,
          topic: 'Number Systems (2025)',
          release: { publishedAt: new Date() },
        },
        {
          unitId: 'unit-w2',
          releaseId: 'rel-2025',
          week: 2,
          topic: 'LCM & HCF (2025)',
          release: { publishedAt: new Date() },
        },
      ]);

      // Mock legacy state and general tables
      prisma.curriculumWeek.findMany.mockResolvedValue([
        { curriculumWeekId: 'state-w2', week: 2, topic: 'Legacy State Week 2' },
        { curriculumWeekId: 'state-w3', week: 3, topic: 'Legacy State Week 3' },
      ]);

      prisma.generalCurriculum.findMany.mockResolvedValue([
        { generalCurriculumId: 'gen-w4', week: 4, topic: 'Legacy General Week 4' },
      ]);

      const weeks = await service.getWeeks('Lagos', 'Mathematics', 'JSS 1', 1);

      expect(weeks).toHaveLength(4);

      // Weeks 1 & 2 come from published release
      expect(weeks[0]).toEqual({
        id: 'unit-w1',
        unitId: 'unit-w1',
        releaseId: 'rel-2025',
        week: 1,
        topic: 'Number Systems (2025)',
        source: 'release',
      });
      expect(weeks[1]).toEqual({
        id: 'unit-w2',
        unitId: 'unit-w2',
        releaseId: 'rel-2025',
        week: 2,
        topic: 'LCM & HCF (2025)',
        source: 'release',
      });

      // Week 3 falls back gracefully to state row
      expect(weeks[2]).toEqual({
        id: 'state-w3',
        week: 3,
        topic: 'Legacy State Week 3',
        source: 'state',
      });

      // Week 4 falls back to general row
      expect(weeks[3]).toEqual({
        id: 'gen-w4',
        week: 4,
        topic: 'Legacy General Week 4',
        source: 'general',
      });
    });

    it('should return single week from published CurriculumUnit when available', async () => {
      prisma.curriculumUnit.findFirst.mockResolvedValue({
        unitId: 'unit-math-1',
        releaseId: 'rel-2025',
        subject: 'Mathematics',
        classLevel: 'JSS 1',
        term: 1,
        week: 1,
        topic: 'Whole Numbers',
        subTopics: ['Units', 'Tens'],
        learningObjectives: ['Count to 1000'],
        competencies: ['Numeracy'],
        teachingActivities: 'Use abacus',
        teachingAids: 'Abacus, flashcards',
        evaluationGuide: 'Exercises 1-5',
        referenceMaterials: ['NERDC 2025 Mathematics'],
      });

      const week = await service.getWeek('Lagos', 'Mathematics', 'JSS 1', 1, 1);

      expect(week.source).toBe('release');
      expect(week.id).toBe('unit-math-1');
      expect(week.topic).toBe('Whole Numbers');
      expect(week.objectives).toEqual(['Count to 1000']);
      expect(week.competencies).toEqual(['Numeracy']);
      expect(week.teachingActivities).toBe('Use abacus');
    });

    it('should fall back to state row when published unit is missing', async () => {
      prisma.curriculumUnit.findFirst.mockResolvedValue(null);
      prisma.curriculumWeek.findUnique.mockResolvedValue({
        curriculumWeekId: 'state-w1',
        state: 'Lagos',
        subject: 'Basic Science',
        classLevel: 'JSS 1',
        term: 1,
        week: 1,
        topic: 'Living Things',
        subTopics: ['Plants', 'Animals'],
        objectives: ['Identify plants'],
        teachingActivities: 'Field trip',
      });

      const week = await service.getWeek('Lagos', 'Basic Science', 'JSS 1', 1, 1);

      expect(week.source).toBe('state');
      expect(week.id).toBe('state-w1');
      expect(week.topic).toBe('Living Things');
    });

    it('should fall back to general row when published unit and state row are both missing', async () => {
      prisma.curriculumUnit.findFirst.mockResolvedValue(null);
      prisma.curriculumWeek.findUnique.mockResolvedValue(null);
      prisma.generalCurriculum.findFirst.mockResolvedValue({
        generalCurriculumId: 'gen-w1',
        subject: 'French',
        classLevel: 'JSS 1',
        term: 1,
        week: 1,
        topic: 'Salutations',
        subTopics: ['Bonjour'],
        objectives: ['Greet in French'],
      });

      const week = await service.getWeek('Oyo', 'French', 'JSS 1', 1, 1);

      expect(week.source).toBe('general');
      expect(week.id).toBe('gen-w1');
      expect(week.state).toBe('Oyo');
      expect(week.topic).toBe('Salutations');
    });

    it('should throw NotFoundException if curriculum is absent from all sources', async () => {
      prisma.curriculumUnit.findFirst.mockResolvedValue(null);
      prisma.curriculumWeek.findUnique.mockResolvedValue(null);
      prisma.generalCurriculum.findFirst.mockResolvedValue(null);

      await expect(
        service.getWeek('Kano', 'Unknown Subject', 'JSS 1', 1, 99),
      ).rejects.toThrow(NotFoundException);
    });

    it('should retrieve a CurriculumUnit directly by unitId', async () => {
      prisma.curriculumUnit.findUnique.mockResolvedValue({
        unitId: 'unit-direct-1',
        releaseId: 'rel-2025',
        subject: 'Computer Studies',
        classLevel: 'Primary 4',
        term: 2,
        week: 3,
        topic: 'Hardware Components',
        subTopics: ['CPU', 'Monitor'],
        learningObjectives: ['Describe CPU function'],
      });

      const unit = await service.getUnitById('unit-direct-1', 'Abuja');

      expect(unit.source).toBe('release');
      expect(unit.id).toBe('unit-direct-1');
      expect(unit.state).toBe('Abuja');
      expect(unit.topic).toBe('Hardware Components');
    });
  });
});
