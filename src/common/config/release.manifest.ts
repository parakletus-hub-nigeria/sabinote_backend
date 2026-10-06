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

export interface EducationalComparisonItem {
  feature: string;
  whatChanged: string;
  whyItMattersToTeachers: string;
  classroomTip: string;
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
  educationalComparison?: EducationalComparisonItem[];
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
      "1-Click Teacher Feedback & Pacing Calibration: Directly rate notes (1-5 stars or 👍/👎) and suggest classroom adjustments so the curriculum AI stays tuned to Nigerian schools.",
    ],
    educationalComparison: [
      {
        feature: "Live 2025 Scheme Preview",
        whatChanged: "Instant preview of official national scheme of work topics, subtopics, and expected objectives before clicking generate.",
        whyItMattersToTeachers: "Never guess whether your note matches your state Ministry of Education syllabus; ensures you are on the right week and topic before spending Parats.",
        classroomTip: "Tap the week number to check subtopics and ensure you cover all curriculum requirements for continuous assessment tests.",
      },
      {
        feature: "Period Pacing Visualizer",
        whatChanged: "Calculates precise timings for 30, 40, 45, 60, or 80-minute periods broken into Introduction Review, Teacher Demonstration, and Pupil Activity.",
        whyItMattersToTeachers: "Prevents rushing through lessons or running overtime, and fulfills Ministry inspectors' strict demand for realistic classroom time allocation.",
        classroomTip: "Select 80 minutes for science laboratory practicals or double-period essay writing to get appropriate hands-on pacing.",
      },
      {
        feature: "Stage-Grounded Bloom's Verbs",
        whatChanged: "Objectives automatically calibrate for Early Years (sensory & play), Primary (concrete), JSS (logical), or SSS (analytical WAEC level).",
        whyItMattersToTeachers: "Supervisors won't reject your notes for vague words like 'know' or 'understand'—every objective uses observable action verbs.",
        classroomTip: "Check the Cognitive, Affective, and Psychomotor tabs in your note to ensure all three learning domains are evaluated.",
      },
      {
        feature: "Classroom Learning Aids Selector",
        whatChanged: "Choose realia, bottle tops, charts, or type your school's actual lab apparatus directly into the generation screen.",
        whyItMattersToTeachers: "The lesson note weaves your real materials directly into teaching steps instead of demanding expensive equipment your school lacks.",
        classroomTip: "Type specific local items like 'school farm cassava leaves' or 'cardboard clocks' so your activities match your physical classroom.",
      },
      {
        feature: "Teacher Quality Feedback & 1-Click Rating",
        whatChanged: "1-click star rating, classroom sentiment (👍/👎), and quick observations at the bottom of each lesson canvas.",
        whyItMattersToTeachers: "Gives Nigerian teachers a direct voice to train the AI on real classroom pacing, language simplicity, and local context.",
        classroomTip: "Tap 'Perfect timing' or 'Needs simpler language' so subsequent notes automatically match your learners' comprehension level.",
      },
      {
        feature: "Misconceptions & Differentiation",
        whatChanged: "Dedicated sections detailing where pupils get confused, how to guide them, and separate support vs extension tasks.",
        whyItMattersToTeachers: "Impresses Ministry quality assurance teams by demonstrating planned interventions for both struggling and fast learners.",
        classroomTip: "Read the Common Misconceptions box during your morning preparation so you can address errors before pupils make them.",
      },
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
        'Teacher star rating & thumbs feedback loop for continuous quality calibration',
      ],
      changes: {
        teaching_and_pedagogy: [
          'Automatic stage calibration for Early Years (ECCDE), Primary (1-6), Junior Secondary (7-9), and Senior Secondary (SS 1-3)',
          "Bloom's taxonomy measurable action verbs and multi-domain assessment criteria",
          'Tailored differentiated instruction for support learners and high-achiever extensions',
        ],
        lesson_planning_experience: [
          'Live 2025 scheme preview card with instant verified curriculum check',
          'Period pacing bar with color-coded 3-segment classroom timeline',
          'Classroom materials selector with custom school resource entry',
          'Pedagogical focus toggle (Standard, Hands-On, Exam Focus, Remedial)',
        ],
        inspection_and_export: [
          'Chalkboard summary layout for clean blackboard presentation',
          'Distinct Teacher vs Pupil classroom activities with time badges',
          'Full PDF and Word download enriched with misconceptions and differentiation',
          'Classroom quality feedback widget enabling teachers to rate and suggest refinements',
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
