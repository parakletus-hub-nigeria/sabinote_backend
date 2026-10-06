export interface CurriculumBaselineInfo {
  tag: string;
  authorities: string[];
  totalUnits: number;
  stages: string[];
  lastUpdated: string;
}

export interface TeacherGuideItem {
  step: string;
  description: string;
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
  teacherGuide?: TeacherGuideItem[];
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
    environment: process.env.NODE_ENV || 'production',
    curriculumBaseline: {
      tag: 'NERDC-2025.1',
      authorities: ['NERDC', 'NAPPS'],
      totalUnits: 6182,
      stages: ['early_years', 'primary', 'junior_secondary', 'senior_secondary'],
      lastUpdated: '2026-10-06',
    },
    highlights: [
      "Official 2025 Scheme of Work: 6,182 national curriculum topics across Early Years, Primary, JSS, and SSS now match official NERDC & NAPPS standards.",
      "Automatic Scheme Alignment: Select your subject, term, and week to automatically pull the exact approved topic, subtopics, and learning objectives.",
      "Inspector-Ready Lesson Notes: Notes now feature Bloom's taxonomy objectives, teacher-pupil step presentations, and diagnostic evaluation questions.",
      "Suggested Classroom Materials: Every generated note suggests locally available, low-cost teaching aids to enhance practical understanding.",
      "Complete Safety & Continuity: All previously created lesson notes are safely preserved and linked to your archive with zero loss.",
    ],
    teacherGuide: [
      {
        step: '1. Choose Your Exact Class & Term',
        description: 'Select your specific class level and current term. SabiNote instantly accesses the verified 2025 national scheme for your subject.',
      },
      {
        step: '2. Confirm Your Week & Topic',
        description: 'Pick the week of the term. SabiNote auto-fills the approved topic, subtopics, and performance objectives required for that week.',
      },
      {
        step: '3. Leverage Recommended Learning Aids',
        description: 'Review the suggested teaching aids (realia, charts, models) in the note to prepare interactive classroom demonstrations.',
      },
      {
        step: '4. Use Diagnostic Evaluation in Class',
        description: 'Assess pupil mastery using the built-in evaluation questions before transitioning to conclusion and homework assignments.',
      },
      {
        step: '5. Export Clean, Inspector-Approved PDFs',
        description: 'Export or print formatted lesson notes ready for submission to school principals, headteachers, and Ministry inspectors.',
      },
    ],
  },
  history: [
    {
      version: '2.0.1',
      versionTag: 'v2.0.1',
      title: 'v2.0.1: 2025 National Scheme of Work & Curriculum Engine',
      date: '2026-10-06',
      type: 'minor',
      highlights: [
        '6,182 Verified 2025 Curriculum Units loaded from official NERDC and NAPPS national scheme archives',
        'Automatic topic and objective matching for Early Childhood, Primary 1–6, JSS 1–3, and SSS 1–3',
        'Classroom-ready lesson notes with structured steps and Bloom\'s taxonomy objectives',
        'Seamless compatibility protecting all previously created teacher lesson notes',
      ],
      changes: {
        curriculum: [
          'Senior Secondary (SSS 1-3): 2,219 units across 26 verified subjects',
          'Primary (Primary 1-6): 2,103 units across core national subjects',
          'Junior Secondary (JSS 1-3): 1,107 units across all national subjects',
          'Early Childhood Education: 753 units across Pre-Nursery and Nursery 1-3',
        ],
        benefits: [
          'Eliminates manual typing of weekly schemes and performance objectives',
          'Guarantees compliance with Nigerian school inspection guidelines',
          'Instant retrieval of approved learning materials and classroom activities',
        ],
      },
    },
    {
      version: '2.0.0',
      versionTag: 'v2.0.0',
      title: 'v2.0.0: Platform Reliability & Security Baseline',
      date: '2026-09-28',
      type: 'major',
      highlights: [
        'Enhanced account security and instant session protection across your devices',
        'High-performance system infrastructure ensuring fast lesson note generation during peak school hours',
        'Reliable request tracking to ensure uninterrupted service',
      ],
    },
    {
      version: '1.0.0',
      versionTag: 'v1.0.0',
      title: 'v1.0.0: Initial SabiNote Launch',
      date: '2026-05-10',
      type: 'initial',
      highlights: [
        'AI-powered lesson note generation for Nigerian educators',
        'Personal teacher library and interactive note editing',
        'Paystack wallet top-up and PDF export capabilities',
      ],
    },
  ],
};
