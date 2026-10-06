import { PrismaClient, CurriculumStage, ReleaseStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

interface UnitSeedItem {
  classLevel: string;
  subject: string;
  term: number;
  week: number;
  topic: string;
  subTopics?: string[];
  learningObjectives?: string[];
  competencies?: string[];
  teachingActivities?: string;
  teachingAids?: string;
  evaluationGuide?: string;
  referenceMaterials?: string[];
  metadata?: Record<string, any>;
}

export async function seedV2Curriculums() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/sabinote';

  console.log('[SeedV2] Initializing database connection...');
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 10_000,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    await prisma.$connect();
    console.log('[SeedV2] Connected to database.');

    // 1. Ensure Authority Sources
    const nerdcSource = await prisma.curriculumSource.upsert({
      where: { code: 'NERDC' },
      update: {},
      create: {
        code: 'NERDC',
        name: 'Nigerian Educational Research and Development Council',
        authority: 'Federal Ministry of Education',
        jurisdiction: 'National',
        websiteUrl: 'https://nerdc.gov.ng',
      },
    });

    const nappsSource = await prisma.curriculumSource.upsert({
      where: { code: 'NAPPS' },
      update: {},
      create: {
        code: 'NAPPS',
        name: 'National Association of Proprietors of Private Schools',
        authority: 'NAPPS National Curriculum Committee',
        jurisdiction: 'National',
      },
    });

    console.log('[SeedV2] Curriculum sources verified (NERDC, NAPPS).');

    // 2. Define Release Manifests
    const releasesConfig: {
      tag: string;
      title: string;
      stage: CurriculumStage;
      version: string;
      sourceId: string;
      file: string;
    }[] = [
      {
        tag: 'NERDC-JSS-2025.1',
        title: 'NERDC Junior Secondary Curriculum Scheme of Work (2025 Edition)',
        stage: CurriculumStage.junior_secondary,
        version: '2025.1',
        sourceId: nerdcSource.sourceId,
        file: 'nerdc_jss_2025.json',
      },
      {
        tag: 'NERDC-SSS-2025.1',
        title: 'NERDC Senior Secondary Curriculum Scheme of Work (2025 Edition)',
        stage: CurriculumStage.senior_secondary,
        version: '2025.1',
        sourceId: nerdcSource.sourceId,
        file: 'nerdc_sss_2025.json',
      },
      {
        tag: 'NERDC-PRIMARY-2025.1',
        title: 'NERDC National Primary Curriculum Scheme of Work (2025 Edition)',
        stage: CurriculumStage.primary,
        version: '2025.1',
        sourceId: nerdcSource.sourceId,
        file: 'nerdc_primary_2025.json',
      },
      {
        tag: 'SABINOTE-ECE-2025.1',
        title: 'SabiNote Early Childhood Education & Nursery Curriculum (NAPPS/NERDC 2025)',
        stage: CurriculumStage.early_years,
        version: '2025.1',
        sourceId: nappsSource.sourceId,
        file: 'sabinote_ece_2025.json',
      },
    ];

    const seedsDir = path.join(__dirname, '..', 'seeds');
    let grandTotalUnits = 0;

    for (const relConf of releasesConfig) {
      console.log(`\n[SeedV2] Processing release: ${relConf.tag}...`);

      const release = await prisma.curriculumRelease.upsert({
        where: { releaseTag: relConf.tag },
        update: {
          title: relConf.title,
          stage: relConf.stage,
          version: relConf.version,
          status: ReleaseStatus.published,
          publishedAt: new Date(),
        },
        create: {
          sourceId: relConf.sourceId,
          releaseTag: relConf.tag,
          title: relConf.title,
          stage: relConf.stage,
          version: relConf.version,
          status: ReleaseStatus.published,
          publishedAt: new Date(),
          metadata: { verifiedSource: true, editionYear: '2025' },
        },
      });

      const filePath = path.join(seedsDir, relConf.file);
      if (!fs.existsSync(filePath)) {
        console.warn(`[SeedV2] Seed file not found yet: ${filePath}. Skipping.`);
        continue;
      }

      const unitsData: UnitSeedItem[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      console.log(`[SeedV2] Seeding ${unitsData.length} units into release ${relConf.tag}...`);

      // Upsert in batches of 25 to respect pool concurrency
      const batchSize = 25;
      let seeded = 0;

      for (let i = 0; i < unitsData.length; i += batchSize) {
        const batch = unitsData.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (u) => {
            // 1. Upsert into CurriculumUnit
            await prisma.curriculumUnit.upsert({
              where: {
                releaseId_classLevel_subject_term_week: {
                  releaseId: release.releaseId,
                  classLevel: u.classLevel,
                  subject: u.subject,
                  term: u.term,
                  week: u.week,
                },
              },
              update: {
                stage: relConf.stage,
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
                releaseId: release.releaseId,
                stage: relConf.stage,
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
            });

            // 2. Also upsert into GeneralCurriculum with year='2025' for dual legacy table sync
            const existingGen = await prisma.generalCurriculum.findFirst({
              where: {
                subject: u.subject,
                classLevel: u.classLevel,
                term: u.term,
                week: u.week,
                year: '2025',
              },
              select: { generalCurriculumId: true },
            });

            if (existingGen) {
              await prisma.generalCurriculum.update({
                where: { generalCurriculumId: existingGen.generalCurriculumId },
                data: {
                  topic: u.topic,
                  subTopics: u.subTopics ?? [],
                  objectives: u.learningObjectives ?? [],
                  teachingActivities: u.teachingActivities ?? null,
                  teachingAids: u.teachingAids ?? null,
                  evaluation: u.evaluationGuide ?? null,
                  referenceText: u.referenceMaterials?.join(', ') ?? null,
                  version: '2025.1',
                },
              });
            } else {
              await prisma.generalCurriculum.create({
                data: {
                  subject: u.subject,
                  classLevel: u.classLevel,
                  term: u.term,
                  week: u.week,
                  year: '2025',
                  version: '2025.1',
                  topic: u.topic,
                  subTopics: u.subTopics ?? [],
                  objectives: u.learningObjectives ?? [],
                  teachingActivities: u.teachingActivities ?? null,
                  teachingAids: u.teachingAids ?? null,
                  evaluation: u.evaluationGuide ?? null,
                  referenceText: u.referenceMaterials?.join(', ') ?? null,
                },
              });
            }
          }),
        );
        seeded += batch.length;
      }

      console.log(`[SeedV2] Successfully seeded ${seeded} units for ${relConf.tag}.`);
      grandTotalUnits += seeded;
    }

    console.log(`\n======================================================`);
    console.log(`[SeedV2] Completed! Grand total units seeded: ${grandTotalUnits}`);
    console.log(`======================================================\n`);

    return { success: true, grandTotalUnits };
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

if (require.main === module) {
  seedV2Curriculums()
    .then((res) => {
      console.log('[SeedV2] Finished:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[SeedV2] Error:', err);
      process.exit(1);
    });
}
