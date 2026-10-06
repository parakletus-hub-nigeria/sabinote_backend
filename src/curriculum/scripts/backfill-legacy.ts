import { PrismaClient, CurriculumStage, ReleaseStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

function inferStage(classLevel: string): CurriculumStage {
  const norm = (classLevel || '').trim().toUpperCase();
  if (norm.includes('PRE') || norm.includes('NURSERY') || norm.includes('KG')) {
    return CurriculumStage.early_years;
  }
  if (norm.includes('PRI') || norm.includes('PRY')) {
    return CurriculumStage.primary;
  }
  if (norm.includes('JSS') || norm.includes('JS')) {
    return CurriculumStage.junior_secondary;
  }
  return CurriculumStage.senior_secondary;
}

export async function runLegacyBackfill() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/sabinote';

  console.log(`[Backfill] Initializing database connection...`);
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log(`[Backfill] Connected to database.`);

    // 1. Ensure Legacy Curriculum Source
    const legacySource = await prisma.curriculumSource.upsert({
      where: { code: 'LEGACY' },
      update: {},
      create: {
        code: 'LEGACY',
        name: 'Legacy Curriculum Archive',
        authority: 'NERDC / State Ministries of Education',
        jurisdiction: 'National & State',
      },
    });
    console.log(`[Backfill] Legacy source ensured: ${legacySource.sourceId} (${legacySource.code})`);

    // 2. Ensure Legacy Compatibility Releases per Stage
    const stageReleases: Record<CurriculumStage, string> = {} as any;

    const releaseConfigs: {
      stage: CurriculumStage;
      tag: string;
      title: string;
    }[] = [
      {
        stage: CurriculumStage.junior_secondary,
        tag: 'LEGACY-COMPATIBILITY-2024',
        title: 'NERDC Legacy Compatibility 2024 Baseline (Junior Secondary)',
      },
      {
        stage: CurriculumStage.senior_secondary,
        tag: 'LEGACY-COMPATIBILITY-SSS-2024',
        title: 'NERDC Legacy Compatibility 2024 Baseline (Senior Secondary)',
      },
      {
        stage: CurriculumStage.primary,
        tag: 'LEGACY-COMPATIBILITY-PRI-2024',
        title: 'NERDC Legacy Compatibility 2024 Baseline (Primary)',
      },
      {
        stage: CurriculumStage.early_years,
        tag: 'LEGACY-COMPATIBILITY-EY-2024',
        title: 'NERDC Legacy Compatibility 2024 Baseline (Early Years)',
      },
    ];

    for (const conf of releaseConfigs) {
      const rel = await prisma.curriculumRelease.upsert({
        where: { releaseTag: conf.tag },
        update: {
          status: ReleaseStatus.published,
          publishedAt: new Date('2024-09-01T00:00:00Z'),
        },
        create: {
          sourceId: legacySource.sourceId,
          releaseTag: conf.tag,
          title: conf.title,
          stage: conf.stage,
          version: '2024.1',
          status: ReleaseStatus.published,
          publishedAt: new Date('2024-09-01T00:00:00Z'),
          metadata: { isLegacyCompatibilityBaseline: true },
        },
      });
      stageReleases[conf.stage] = rel.releaseId;
      console.log(`[Backfill] Ensured release: ${conf.tag} -> ${rel.releaseId}`);
    }

    // 3. Migrate CurriculumWeek rows
    const stateWeeks = await prisma.curriculumWeek.findMany();
    console.log(`[Backfill] Found ${stateWeeks.length} state CurriculumWeek rows to map.`);

    let stateMigratedCount = 0;
    const legacyWeekUnitMap = new Map<string, string>(); // curriculumWeekId -> unitId

    for (const row of stateWeeks) {
      const stage = inferStage(row.classLevel);
      const releaseId = stageReleases[stage];

      const unit = await prisma.curriculumUnit.upsert({
        where: {
          releaseId_classLevel_subject_term_week: {
            releaseId,
            classLevel: row.classLevel,
            subject: row.subject,
            term: row.term,
            week: row.week,
          },
        },
        update: {
          topic: row.topic,
          subTopics: row.subTopics,
          learningObjectives: row.objectives,
          teachingActivities: row.teachingActivities,
          teachingAids: row.teachingAids,
          evaluationGuide: row.evaluation,
          referenceMaterials: row.referenceText ? [row.referenceText] : [],
          metadata: {
            legacyTable: 'CurriculumWeek',
            legacyState: row.state,
            legacyCurriculumWeekId: row.curriculumWeekId,
          },
        },
        create: {
          releaseId,
          stage,
          classLevel: row.classLevel,
          subject: row.subject,
          term: row.term,
          week: row.week,
          topic: row.topic,
          subTopics: row.subTopics,
          learningObjectives: row.objectives,
          competencies: ['Core Curriculum Competency'],
          teachingActivities: row.teachingActivities,
          teachingAids: row.teachingAids,
          evaluationGuide: row.evaluation,
          referenceMaterials: row.referenceText ? [row.referenceText] : [],
          metadata: {
            legacyTable: 'CurriculumWeek',
            legacyState: row.state,
            legacyCurriculumWeekId: row.curriculumWeekId,
          },
        },
      });

      legacyWeekUnitMap.set(row.curriculumWeekId, unit.unitId);
      stateMigratedCount++;
    }
    console.log(`[Backfill] Mapped ${stateMigratedCount} state rows into CurriculumUnit.`);

    // 4. Migrate GeneralCurriculum rows
    const generalWeeks = await prisma.generalCurriculum.findMany();
    console.log(`[Backfill] Found ${generalWeeks.length} GeneralCurriculum rows to map.`);

    let generalMigratedCount = 0;
    const legacyGeneralUnitMap = new Map<string, string>(); // generalCurriculumId -> unitId

    for (const row of generalWeeks) {
      const stage = inferStage(row.classLevel);
      const releaseId = stageReleases[stage];

      const unit = await prisma.curriculumUnit.upsert({
        where: {
          releaseId_classLevel_subject_term_week: {
            releaseId,
            classLevel: row.classLevel,
            subject: row.subject,
            term: row.term,
            week: row.week,
          },
        },
        update: {
          topic: row.topic,
          subTopics: row.subTopics,
          learningObjectives: row.objectives,
          teachingActivities: row.teachingActivities,
          teachingAids: row.teachingAids,
          evaluationGuide: row.evaluation,
          referenceMaterials: row.referenceText ? [row.referenceText] : [],
          metadata: {
            legacyTable: 'GeneralCurriculum',
            legacyYear: row.year,
            legacyVersion: row.version,
            legacyGeneralCurriculumId: row.generalCurriculumId,
          },
        },
        create: {
          releaseId,
          stage,
          classLevel: row.classLevel,
          subject: row.subject,
          term: row.term,
          week: row.week,
          topic: row.topic,
          subTopics: row.subTopics,
          learningObjectives: row.objectives,
          competencies: ['National Core Curriculum Competency'],
          teachingActivities: row.teachingActivities,
          teachingAids: row.teachingAids,
          evaluationGuide: row.evaluation,
          referenceMaterials: row.referenceText ? [row.referenceText] : [],
          metadata: {
            legacyTable: 'GeneralCurriculum',
            legacyYear: row.year,
            legacyVersion: row.version,
            legacyGeneralCurriculumId: row.generalCurriculumId,
          },
        },
      });

      legacyGeneralUnitMap.set(row.generalCurriculumId, unit.unitId);
      generalMigratedCount++;
    }
    console.log(`[Backfill] Mapped ${generalMigratedCount} general rows into CurriculumUnit.`);

    // 5. Backfill existing LessonNotes to associate curriculumReleaseId and curriculumUnitId
    const notesToUpdate = await prisma.lessonNote.findMany({
      where: {
        curriculumUnitId: null,
        OR: [
          { curriculumWeekId: { not: null } },
          { generalCurriculumId: { not: null } },
        ],
      },
    });

    console.log(`[Backfill] Found ${notesToUpdate.length} LessonNotes to backfill.`);
    let updatedNotesCount = 0;

    for (const note of notesToUpdate) {
      let unitId: string | undefined;
      let stage: CurriculumStage = inferStage(note.classLevel);

      if (note.curriculumWeekId && legacyWeekUnitMap.has(note.curriculumWeekId)) {
        unitId = legacyWeekUnitMap.get(note.curriculumWeekId);
      } else if (note.generalCurriculumId && legacyGeneralUnitMap.has(note.generalCurriculumId)) {
        unitId = legacyGeneralUnitMap.get(note.generalCurriculumId);
      }

      if (unitId) {
        await prisma.lessonNote.update({
          where: { noteId: note.noteId },
          data: {
            curriculumUnitId: unitId,
            curriculumReleaseId: stageReleases[stage],
          },
        });
        updatedNotesCount++;
      }
    }

    console.log(`[Backfill] Successfully backfilled ${updatedNotesCount} LessonNotes.`);

    return {
      success: true,
      stateMigrated: stateMigratedCount,
      generalMigrated: generalMigratedCount,
      notesUpdated: updatedNotesCount,
    };
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  runLegacyBackfill()
    .then((res) => {
      console.log('[Backfill] Finished successfully:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Backfill] Error:', err);
      process.exit(1);
    });
}
