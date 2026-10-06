export interface CurriculumBaselineInfo {
  tag: string;
  authorities: string[];
  totalUnits: number;
  stages: string[];
  lastUpdated: string;
}

export interface CurrentReleaseInfo {
  version: string;
  versionTag: string;
  codename: string;
  releaseDate: string;
  status: 'stable' | 'beta' | 'maintenance';
  environment: string;
  curriculumBaseline: CurriculumBaselineInfo;
  highlights: string[];
}

export interface HistoricReleaseItem {
  version: string;
  versionTag: string;
  title: string;
  date: string;
  type: 'major' | 'minor' | 'patch' | 'initial';
  highlights: string[];
  changes?: Record<string, string[]>;
}

export interface ReleaseManifest {
  current: CurrentReleaseInfo;
  history: HistoricReleaseItem[];
}

export const PLATFORM_RELEASE_MANIFEST: ReleaseManifest = {
  current: {
    version: '2.0.1',
    versionTag: 'v2.0.1',
    codename: 'Curriculum Release Engine & 2025 Schemes',
    releaseDate: '2026-10-06',
    status: 'stable',
    environment: process.env.NODE_ENV || 'development',
    curriculumBaseline: {
      tag: 'NERDC-2025.1',
      authorities: ['NERDC', 'NAPPS'],
      totalUnits: 6182,
      stages: ['early_years', 'primary', 'junior_secondary', 'senior_secondary'],
      lastUpdated: '2026-10-06',
    },
    highlights: [
      'Dual-Read Engine: Prioritizes published versioned CurriculumUnit releases with graceful fallback to legacy rows',
      '6,182 Verified 2025 Scheme units extracted from official NERDC and NAPPS curriculum archives',
      'Curriculum Releases & Units API endpoints (ARCH-007): Browse, create, seed, and query versioned schemes',
      'Grounded AI generation: Directly grounds lesson plans and lesson notes on canonical curriculum unit IDs',
      'Automated legacy backfill migration into LEGACY-COMPATIBILITY-2024',
    ],
  },
  history: [
    {
      version: '2.0.1',
      versionTag: 'v2.0.1',
      title: 'v2.0.1: Curriculum Release Engine & 2025 Schemes',
      date: '2026-10-06',
      type: 'minor',
      highlights: [
        'Dual-Read Engine: Resolves from published CurriculumUnit releases first with graceful fallback to legacy rows',
        '6,182 Verified 2025 Scheme units extracted from official NERDC and NAPPS curriculum documents',
        'Curriculum Releases & Units API endpoints (ARCH-007) with OpenAPI documentation',
        'Automatic grounding in generation: Lesson plans and notes linked to curriculumReleaseId and curriculumUnitId',
        'Legacy backfill automation into LEGACY-COMPATIBILITY-2024 baseline release',
      ],
      changes: {
        features: [
          'GET /curriculum/releases: Browse published and draft releases by stage and status',
          'POST /curriculum/releases: Admin creation of versioned curriculum releases with auto-provisioned sources',
          'POST /curriculum/releases/:id/units: Bulk import and upsert of canonical curriculum units',
          'GET /curriculum/releases/:id/units: Filtered query by classLevel, subject, term, and week',
          'getUnitById service resolver for direct unit-grounded retrieval',
        ],
        curriculum: [
          'Junior Secondary (JSS 1-3): 1,107 units across all national subjects',
          'Senior Secondary (SSS 1-3): 2,219 units across 26 verified subjects',
          'Primary (Primary 1-6): 2,103 units across 15 core subjects',
          'Early Childhood Education (Pre-Nursery & Nursery 1-3): 753 units',
        ],
        tooling: [
          'Added npm run curriculum:seed for automated database release population',
          'Added npm run curriculum:backfill for historical lesson note association',
        ],
      },
    },
    {
      version: '2.0.0',
      versionTag: 'v2.0.0',
      title: 'v2.0.0: Programme Baseline & Security Architecture',
      date: '2026-09-28',
      type: 'major',
      highlights: [
        'Revocable PostgreSQL refresh token sessions (ARCH-005)',
        'Correlation ID request tracking (ARCH-014)',
        'Fail-closed environment configuration validation (ARCH-003)',
        'Strict CORS enforcement (ARCH-004)',
        'Standardized OpenAPI 3.0 contract generation (ARCH-001)',
      ],
      changes: {
        security: [
          'Server-revocable RefreshSession model with token hash and device tracking',
          'Token family theft and reuse detection with automatic family revocation',
          'Whitelisted CORS origin validator with production wildcard rejection',
        ],
        architecture: [
          'CorrelationIdMiddleware propagating x-correlation-id header across all routes',
          'HttpExceptionFilter standardizing error envelope: { success: false, error: { code, message, correlationId } }',
          'validateEnv with Zod schema and production fail-closed invariants',
        ],
      },
    },
    {
      version: '1.0.0',
      versionTag: 'v1.0.0',
      title: 'v1.0.0: Initial SabiNote Production MVP',
      date: '2026-05-10',
      type: 'initial',
      highlights: [
        'AI lesson plan and lesson note generator for Nigerian teachers',
        'Parats wallet balance and Paystack top-up engine',
        'PDF and DOCX document export engine',
      ],
      changes: {
        features: [
          'Two-phase lesson plan and note generation pipeline',
          'Paystack payment webhook integration and wallet credit',
          'Cloudinary resource storage for supplemental teacher materials',
          'Rich interactive lesson note canvas with editable sections',
        ],
      },
    },
  ],
};
