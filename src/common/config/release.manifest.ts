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
    version: '2.0.2',
    versionTag: 'v2.0.2',
    codename: 'Pedagogical Grounding & Classroom Pacing Engine',
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
      "Live 2025 Scheme Preview: Selecting any week instantly previews the official NERDC topic, subtopics, and Bloom's learning objectives with live verification.",
      "Interactive Period Pacing: Automatically proportions your 30, 40, 45, 60, or 80-minute lessons into Introduction, Core Demonstration, and Pupil Practice phases.",
      "Custom Classroom Learning Aids: Pick from suggested local materials or type in your own school resources (e.g. realia, charts, models) to be woven into the lesson.",
      "Pedagogical Focus & Tone: Tailor each lesson for Hands-On Activity, WAEC/BECE Exam Prep, Remedial Scaffolding, or Standard Comprehensive mastery.",
      "Inspector-Approved Differentiated Instruction: Every lesson plan now displays explicit differentiation strategies for struggling vs advanced learners, plus common pupil misconceptions.",
    ],
    teacherGuide: [
      {
        step: "1. Choose Your Class, Subject & Term",
        description: "Select your class level and subject. SabiNote auto-detects whether you're teaching Early Years, Primary, JSS, or SSS.",
      },
      {
        step: "2. Verify Canonical Week & Preview Scheme",
        description: "Tap your teaching week to inspect verified NERDC sub-topics and expected learning outcomes in the new live preview card.",
      },
      {
        step: "3. Choose Your Classroom Materials & Teaching Tone",
        description: "Select the teaching aids you have on hand and pick your pedagogical emphasis (Standard, Hands-On, Exam Focus, or Remedial).",
      },
      {
        step: "4. Paced Classroom Instruction",
        description: "Follow the visual 3-step pacing bar during your period (Intro Review -> Teacher Demonstration -> Active Pupil Activity).",
      },
      {
        step: "5. Inspector & Supervisor Presentation",
        description: "Present notes with distinct Teacher/Pupil role indicators, Chalkboard Layouts, Bloom's Domain badges, and Differentiation sections.",
      },
    ],
  },
  history: [
    {
      version: '2.0.2',
      versionTag: 'v2.0.2',
      title: 'v2.0.2: Pedagogical Grounding, Live Scheme Preview & Period Pacing Engine',
      date: '2026-10-06',
      type: 'minor',
      highlights: [
        'Live 2025 NERDC Scheme Preview card with verified objectives checklist and teaching guidelines',
        "Stage-grounded pedagogical engine with Bloom's Taxonomy domain classification (Cognitive, Affective, Psychomotor)",
        'Proportional period pacing visualizer for 30, 40, 45, 60, and 80-minute classroom sessions',
        'Classroom learning aids selector with custom school resources integration',
        'Pedagogical emphasis toggle (Standard, Hands-On, Exam Focus, Remedial)',
        'Differentiated instruction blocks and common student misconceptions for full inspection readiness',
        'Authentic chalkboard/whiteboard layout preview in lesson notes',
      ],
      changes: {
        pedagogy: [
          'Stage detection engine classifying Early Years (ECCDE), Primary (1-6), Junior Secondary (7-9), and Senior Secondary (SS 1-3)',
          "Domain-specific Bloom's taxonomy action verbs and assessment criteria",
          'Differentiated instruction strategies tailored for struggling learners and extension learners',
        ],
        generator_ui: [
          'Live 2025 scheme preview card with pulsing verified badge',
          'Interactive period duration visualizer with 3-segment color-coded timeline',
          'Learning aids selection chips with instant custom resource input',
          'Pedagogical focus selector (Standard, Hands-On, Exam Focus, Remedial)',
        ],
        viewer_and_export: [
          'Chalkboard layout container in lesson notes for authentic board copy presentation',
          'Teacher vs Pupil role presentation blocks with duration badges',
          'PDF and Word export enhanced with common misconceptions and differentiation sections',
        ],
      },
    },
    {
      version: '2.0.1',
      versionTag: 'v2.0.1',
      title: 'v2.0.1: 2025 National Scheme of Work & Curriculum Engine',
      date: '2026-10-06',
      type: 'minor',
      highlights: [
        '6,182 Verified 2025 Curriculum Units loaded from official NERDC and NAPPS national scheme archives',
        'Automatic topic and objective matching for Early Childhood, Primary 1–6, JSS 1–3, and SSS 1–3',
        "Classroom-ready lesson notes with structured steps and Bloom's taxonomy objectives",
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
