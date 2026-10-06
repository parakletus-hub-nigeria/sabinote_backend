import { CurriculumStage } from '@prisma/client';
import { NormalizedCurriculum } from '../../curriculum/curriculum.service';
import { LessonPlan } from '../schemas/lesson-plan.schema';

/**
 * Detects the Nigerian education stage from the classLevel string.
 */
export function detectCurriculumStage(classLevel: string): CurriculumStage {
  const normalized = (classLevel || '').trim().toLowerCase();

  // Early Years / ECCDE / Nursery / Pre-Nursery / Kindergarten
  if (
    /nursery|pre-nursery|creche|crèche|kindergarten|kg\b|early|reception|toddler|playgroup|infant/i.test(
      normalized,
    )
  ) {
    return CurriculumStage.early_years;
  }

  // Primary School (Primary 1-6, Basic 1-6, Pry 1-6)
  if (
    /primary|pry\b|basic\s*[1-6]\b|grade\s*[1-6]\b|class\s*[1-6]\b/i.test(normalized)
  ) {
    return CurriculumStage.primary;
  }

  // Junior Secondary (JSS 1-3, Basic 7-9, JS 1-3)
  if (
    /jss|j\.s\.s|basic\s*[7-9]\b|grade\s*[7-9]\b|junior/i.test(normalized)
  ) {
    return CurriculumStage.junior_secondary;
  }

  // Senior Secondary (SSS 1-3, SS 1-3, Senior Secondary)
  if (/sss|s\.s\.s|ss\s*[1-3]\b|senior/i.test(normalized)) {
    return CurriculumStage.senior_secondary;
  }

  // Default to junior_secondary
  return CurriculumStage.junior_secondary;
}

export interface StagePedagogy {
  stage: CurriculumStage;
  stageName: string;
  specialistRole: string;
  developmentalFocus: string;
  cognitiveVerbs: string[];
  affectiveVerbs: string[];
  psychomotorVerbs: string[];
  materialsGuidance: string;
  step1Title: string;
  step1Description: string;
  step2Title: string;
  step2Description: string;
  step3Title: string;
  step3Description: string;
  evaluationGuidance: string;
  summaryGuidance: string;
  assignmentGuidance: string;
  systemPrompt: string;
}

export function getStagePedagogy(stage: CurriculumStage): StagePedagogy {
  switch (stage) {
    case CurriculumStage.early_years:
      return {
        stage,
        stageName: 'Early Childhood Care and Development Education (ECCDE / Early Years)',
        specialistRole:
          'expert Nigerian Early Childhood Care and Development Education (ECCDE) specialist with deep mastery in NERDC Early Childhood standards, Montessori methods, and play-based learning',
        developmentalFocus:
          'Sensory exploration, phonics sounds, concrete counting with realia, fine motor skills, rhyming songs, social habits, storytelling',
        cognitiveVerbs: ['identify', 'name', 'point to', 'recognize', 'repeat', 'count up to 5/10', 'sort', 'match'],
        affectiveVerbs: ['show excitement', 'take turns with peers', 'participate eagerly in rhymes', 'handle toys gently', 'listen attentively'],
        psychomotorVerbs: ['trace with finger', 'color within lines', 'clap to rhythm', 'stack blocks', 'mould with playdough', 'imitate teacher movements'],
        materialsGuidance:
          'Real everyday objects (realia), colorful picture flashcards, counting beads/bottle tops, sand tray, tactile models, puppets, rhymes, picture storybooks (avoid abstract electronics or secondary school apparatus)',
        step1Title: 'Warm-Up & Circle Time (Rhyme / Song Introduction)',
        step1Description:
          'Teacher introduces the concept through a lively theme song or rhyme with gestures. Children sing along, perform movements, and activate auditory and sensory engagement.',
        step2Title: 'Sensory Exploration & Interactive Demonstration',
        step2Description:
          'Teacher presents real objects or large picture flashcards, models pronouncing words/sounds, and demonstrates physical actions while keeping children active.',
        step3Title: 'Guided Play & Pupil Activity',
        step3Description:
          'Children touch, sort, point, repeat words, trace, or match objects in small groups or pairs while the teacher guides and observes individual participation.',
        evaluationGuidance:
          '3-4 non-threatening oral and observational tasks (e.g. "Ask pupil to point to...", "Ask pupil to make the sound of...", "Have pupil count 3 items").',
        summaryGuidance:
          'Teacher recaps key concepts through a joyful cheer or rhyme, praises every child for good listening, and gives preview of tomorrow\'s fun theme.',
        assignmentGuidance:
          'Fun, zero-stress take-home sharing task (e.g. recite the rhyme to parents, bring one red item from home to show the class tomorrow).',
        systemPrompt:
          'You are an expert Nigerian Early Childhood specialist (ECCDE). Your lesson plans and notes are child-centered, play-based, sensory-rich, and strictly grounded in approved national ECCDE early years curriculum.',
      };

    case CurriculumStage.primary:
      return {
        stage,
        stageName: 'Primary Basic Education (Primary 1–6 / Basic 1–6)',
        specialistRole:
          'expert Nigerian Primary Education curriculum specialist with 18+ years of experience in the revised NERDC 9-Year Basic Education Curriculum',
        developmentalFocus:
          'Concrete operational understanding: step-by-step teacher scaffolding, reading aloud, guided board writing, arithmetic with concrete materials, active pupil participation',
        cognitiveVerbs: ['identify', 'state', 'list', 'describe', 'calculate', 'solve', 'compare', 'classify', 'spell', 'give examples of'],
        affectiveVerbs: ['appreciate the importance of', 'cooperate in group tasks', 'demonstrate willingness to ask questions', 'develop neat writing habits'],
        psychomotorVerbs: ['draw and label simple diagrams', 'measure using rulers/scales', 'construct simple cardboard models', 'demonstrate steps on the chalkboard'],
        materialsGuidance:
          'Concrete realia (leaves, empty containers, coins, stones), wall charts, counters, abacus, chalkboard illustrations, flashcards, approved Nigerian primary textbooks',
        step1Title: 'Review of Previous Knowledge (Entry Behavior Check)',
        step1Description:
          'Teacher reviews the previous week\'s foundational lesson with 2-3 targeted oral questions. Pupils recall answers from memory and bridge to today\'s lesson.',
        step2Title: 'Exploration & Concept Demonstration',
        step2Description:
          'Teacher introduces new concept with structured board notes, demonstrates with physical instructional materials, and works through 2 clear examples step by step.',
        step3Title: 'Classroom Practice & Guided Pupil Activities',
        step3Description:
          'Pupils solve exercises on the board or in their workbooks in pairs or small groups. Teacher moves around checking work, assisting struggling learners, and verifying understanding.',
        evaluationGuidance:
          '3-4 structured recall and application questions directly assessing whether stated cognitive objectives were met.',
        summaryGuidance:
          'Teacher summarizes the main points on the board, highlights correct spellings/definitions, and praises class effort.',
        assignmentGuidance:
          'Specific, achievable exercises from the approved Nigerian primary textbook with exact page and question numbers.',
        systemPrompt:
          'You are an expert Nigerian Primary Education specialist (Basic 1–6). Your plans and notes emphasize concrete operational teaching, clear board summaries, measurable Bloom\'s objectives, and practical pupil participation.',
      };

    case CurriculumStage.junior_secondary:
      return {
        stage,
        stageName: 'Junior Secondary Education (JSS 1–3 / Basic 7–9)',
        specialistRole:
          'master Nigerian Junior Secondary educator and NERDC curriculum author preparing students for the Basic Education Certificate Examination (BECE)',
        developmentalFocus:
          'Inquiry-based problem solving, transition to abstract logic, introductory scientific method, civic responsibility, vocational literacy',
        cognitiveVerbs: ['define', 'explain', 'differentiate', 'calculate', 'illustrate', 'analyze', 'examine', 'deduce', 'summarize'],
        affectiveVerbs: ['appreciate the role of', 'show concern for', 'work collaboratively in teams', 'demonstrate intellectual curiosity'],
        psychomotorVerbs: ['sketch and label diagrams', 'conduct simple experiments', 'use geometrical instruments', 'demonstrate procedures accurately'],
        materialsGuidance:
          'Scientific apparatus, wall charts, maps, specimen jars, graph sheets, math sets, local Nigerian case studies, NERDC curriculum documents',
        step1Title: 'Identification of Prior Ideas',
        step1Description:
          'Teacher probes entry behavior with diagnostic questions connecting the prior week\'s unit to today\'s topic. Students explain concepts from memory.',
        step2Title: 'Exploration & Conceptual Development',
        step2Description:
          'Teacher delivers structured lecture with board illustrations, demonstrates principles with instructional aids, and works through challenging examples.',
        step3Title: 'Discussion & Practical Problem Solving',
        step3Description:
          'Students analyze questions in pairs, present solutions to the class, discuss edge cases, and copy down comprehensive board notes.',
        evaluationGuidance:
          '3-5 diagnostic questions assessing knowledge, comprehension, and problem solving matching BECE question style.',
        summaryGuidance:
          'Teacher summarizes core principles, clears lingering misconceptions, and connects topic to real-world Nigerian applications.',
        assignmentGuidance:
          'Challenging practice questions or past BECE questions with textbook references.',
        systemPrompt:
          'You are a master Nigerian Junior Secondary educator. Your plans and notes prepare students for BECE success through structured inquiry, accurate terminology, and rigorous alignment with NERDC standards.',
      };

    case CurriculumStage.senior_secondary:
    default:
      return {
        stage: CurriculumStage.senior_secondary,
        stageName: 'Senior Secondary Education (SSS 1–3)',
        specialistRole:
          'Senior Secondary Master Teacher and West African Examinations Council (WAEC / NECO) curriculum specialist with 20+ years of examination preparation experience',
        developmentalFocus:
          'Rigorous academic theory, mathematical derivations, chemical equations, critical literary analysis, past WAEC/NECO examination criteria',
        cognitiveVerbs: ['define precisely', 'formulate', 'derive', 'calculate with standard units', 'analyze critically', 'synthesize', 'evaluate', 'prove', 'justify'],
        affectiveVerbs: ['demonstrate academic integrity', 'appreciate scientific/economic laws', 'exhibit self-directed inquiry', 'formulate independent viewpoints'],
        psychomotorVerbs: ['set up laboratory apparatus', 'perform precise titration/measurement', 'plot accurate graphs with scale and slope', 'construct technical drawings'],
        materialsGuidance:
          'Standard laboratory glassware, chemical reagents, technical drawing boards, past WAEC/NECO question papers, approved Senior Secondary textbooks',
        step1Title: 'Diagnostic Bridging & Conceptual Review',
        step1Description:
          'Teacher asks probing diagnostic questions linking previous topics. Students explain mechanisms, recall formulas, and state underlying laws.',
        step2Title: 'In-Depth Academic Delivery & Demonstration',
        step2Description:
          'Comprehensive theoretical exposition, derivations, equations, worked examples matching WAEC marking schemes, and board notes.',
        step3Title: 'Examination Problem Solving & Class Drill',
        step3Description:
          'Students solve rigorous multi-step exam questions, defend steps, and copy detailed board summary.',
        evaluationGuidance:
          '4-5 rigorous questions reflecting WAEC SSCE / NECO Section A & B examination standards (definitions, step-by-step workings, and critical explanations).',
        summaryGuidance:
          'Teacher highlights key points that frequently appear in SSCE exams, common pitfall areas, and previews the next syllabus unit.',
        assignmentGuidance:
          'Specific WAEC/NECO past questions or exercises from senior secondary textbooks.',
        systemPrompt:
          'You are a Master Teacher and Senior Secondary curriculum author in Nigeria. Your lesson notes provide complete conceptual depth, rigorous mathematical/scientific working, and direct alignment with WAEC SSCE and NECO standards.',
      };
  }
}

/**
 * Calculates step durations proportionally based on the total lesson duration.
 */
export function calculatePacing(totalMinutes: number) {
  const duration = totalMinutes > 0 ? totalMinutes : 40;
  const step1 = Math.max(3, Math.round(duration * 0.12));
  const step3 = Math.max(5, Math.round(duration * 0.25));
  const step2 = duration - step1 - step3;

  return {
    step1Duration: `${step1} minutes`,
    step2Duration: `${step2} minutes`,
    step3Duration: `${step3} minutes`,
    step1Minutes: step1,
    step2Minutes: step2,
    step3Minutes: step3,
    totalMinutes: duration,
  };
}

/**
 * Builds an authentic, stage-grounded lesson plan prompt.
 */
export function buildGroundedPlanPrompt(
  c: NormalizedCurriculum,
  durationMinutes: number,
  difficulty: string,
  session: string,
): { prompt: string; systemPrompt: string; stage: CurriculumStage } {
  const stage = detectCurriculumStage(c.classLevel);
  const pedagogy = getStagePedagogy(stage);
  const pacing = calculatePacing(durationMinutes);
  const refBook = c.referenceText ?? `${c.subject} textbook for ${c.classLevel}`;

  // Build canonical curriculum context injection
  const canonicalContextLines: string[] = [
    `Subject                  : ${c.subject}`,
    `Class / Stage            : ${c.classLevel} (${pedagogy.stageName})`,
    `Term                     : Term ${c.term}  |  Week: Week ${c.week}`,
    `Topic                    : ${c.topic}`,
    `Sub-topics               : ${c.subTopics.length > 0 ? c.subTopics.join(' | ') : c.topic}`,
    `Duration                 : ${pacing.totalMinutes} minutes`,
    `Difficulty Level         : ${difficulty}`,
    `Academic Session         : ${session}`,
    `Curriculum Objectives    : ${c.objectives.length > 0 ? c.objectives.join('; ') : 'Align strictly with 2025 NERDC scheme'}`,
  ];

  if (c.teachingActivities) {
    canonicalContextLines.push(`Official Teaching Act.   : ${c.teachingActivities}`);
  }
  if (c.teachingAids) {
    canonicalContextLines.push(`Suggested Teaching Aids  : ${c.teachingAids}`);
  }
  if (c.competencies && c.competencies.length > 0) {
    canonicalContextLines.push(`National Core Competency : ${c.competencies.join(', ')}`);
  }
  if (c.evaluation) {
    canonicalContextLines.push(`Official Evaluation Guide: ${c.evaluation}`);
  }
  if (c.releaseId) {
    canonicalContextLines.push(`Scheme Provenance        : Release [${c.releaseId}] Unit [${c.unitId ?? c.id}]`);
  }

  const prompt = `You are a ${pedagogy.specialistRole}.

Generate a complete, inspection-ready LESSON PLAN (not lesson note) for this class.

═══════════════════════════════════════════════════════════════════
CANONICAL 2025 CURRICULUM DATA (${c.state} State / National Scheme)
═══════════════════════════════════════════════════════════════════
${canonicalContextLines.join('\n')}
Reference Text           : ${refBook}

═══════════════════════════════════════════════════════════════════
STAGE-SPECIFIC PEDAGOGICAL REQUIREMENTS (${pedagogy.stageName})
═══════════════════════════════════════════════════════════════════
• Developmental Focus: ${pedagogy.developmentalFocus}
• Bloom's Cognitive Verbs: Use verbs appropriate for this level: ${pedagogy.cognitiveVerbs.join(', ')}.
  Start each with "By the end of this lesson, students will be able to..."
• Bloom's Affective Verbs: ${pedagogy.affectiveVerbs.join(', ')}
• Bloom's Psychomotor Verbs: ${pedagogy.psychomotorVerbs.join(', ')}
• Instructional Materials: ${pedagogy.materialsGuidance}
• Pacing Guidance (Total ${pacing.totalMinutes} min):
  - Step 1 (${pacing.step1Duration}): "${pedagogy.step1Title}" — ${pedagogy.step1Description}
  - Step 2 (${pacing.step2Duration}): "${pedagogy.step2Title}" — ${pedagogy.step2Description}
  - Step 3 (${pacing.step3Duration}): "${pedagogy.step3Title}" — ${pedagogy.step3Description}
• Evaluation Guidance: ${pedagogy.evaluationGuidance}
• Summary & Wrap-up: ${pedagogy.summaryGuidance}
• Home Assignment: ${pedagogy.assignmentGuidance}

GROUNDING GUARANTEE:
All lesson objectives, steps, and teacher/pupil activities MUST directly align with the canonical topic: "${c.topic}" and sub-topics: ${JSON.stringify(c.subTopics)}.
Do not introduce unrelated concepts.

═══════════════════════════════════════════════════════════════════
OUTPUT SCHEMA — return ONLY this exact JSON, no markdown, no comments:
═══════════════════════════════════════════════════════════════════
{
  "metadata": {
    "subject": "${c.subject}",
    "classLevel": "${c.classLevel}",
    "topic": "${c.topic}",
    "subTopics": ${JSON.stringify(c.subTopics.length > 0 ? c.subTopics : [c.topic])},
    "term": ${c.term},
    "week": ${c.week},
    "duration": ${pacing.totalMinutes},
    "state": "${c.state}",
    "session": "${session}"
  },
  "referenceBooks": ["${refBook}", "NERDC ${c.subject} Curriculum for ${c.classLevel}"],
  "instructionalMaterials": ["Material 1", "Material 2", "Material 3"],
  "entryBehaviour": "Specific observable prerequisite skill students already possess before this lesson starts",
  "previousKnowledge": "Related topic and concept taught in previous lesson that connects to this one",
  "objectives": {
    "cognitive": [
      "By the end of this lesson, students will be able to [Level-appropriate verb] ...",
      "By the end of this lesson, students will be able to [Level-appropriate verb] ..."
    ],
    "affective": ["Students will ${pedagogy.affectiveVerbs[0]} ..."],
    "psychomotor": ["Students will ${pedagogy.psychomotorVerbs[0]} ..."]
  },
  "presentation": [
    {
      "step": 1,
      "title": "${pedagogy.step1Title}",
      "teacherActivity": "Teacher activity for Step 1",
      "studentActivity": "Student activity for Step 1",
      "duration": "${pacing.step1Duration}"
    },
    {
      "step": 2,
      "title": "${pedagogy.step2Title}",
      "teacherActivity": "Teacher activity for Step 2",
      "studentActivity": "Student activity for Step 2",
      "duration": "${pacing.step2Duration}"
    },
    {
      "step": 3,
      "title": "${pedagogy.step3Title}",
      "teacherActivity": "Teacher activity for Step 3",
      "studentActivity": "Student activity for Step 3",
      "duration": "${pacing.step3Duration}"
    }
  ],
  "commonMisconceptions": [
    {
      "description": "Specific misconception students make in ${c.topic}",
      "reason": "Why students hold this misconception",
      "correction": "How the teacher guides students to the correct understanding"
    }
  ],
  "differentiation": {
    "support": "Clear scaffolding strategy for struggling learners",
    "extension": "Stimulating extension challenge for fast learners"
  },
  "evaluation": [
    "Evaluation question 1 directly testing cognitive objective 1",
    "Evaluation question 2 directly testing cognitive objective 2",
    "Evaluation question 3 testing practical understanding"
  ],
  "summary": "${pedagogy.summaryGuidance}",
  "assignment": "Specific practice exercise with clear instructions for completion at home"
}`;

  return { prompt, systemPrompt: pedagogy.systemPrompt, stage };
}

/**
 * Builds an authentic, stage-grounded lesson note prompt.
 */
export function buildGroundedNotePrompt(
  plan: LessonPlan,
  c: { state?: string | null; subTopics: string[]; objectives: string[]; classLevel?: string } | null,
): { prompt: string; systemPrompt: string; stage: CurriculumStage } {
  const meta = plan?.metadata ?? ({} as any);
  const classLevel = c?.classLevel ?? meta.classLevel ?? '';
  const stage = detectCurriculumStage(classLevel);
  const pedagogy = getStagePedagogy(stage);

  const state = c?.state ?? meta.state ?? 'Federal';
  const subTopics = (c?.subTopics && c.subTopics.length > 0) ? c.subTopics : meta.subTopics ?? [];
  const curriculumObjectives = c?.objectives ?? [];

  const prompt = `You are a ${pedagogy.specialistRole}.
You write the most detailed, pedagogically sound lesson notes in Nigeria — inspected and praised by the Ministry of Education and NAPPS.

═══════════════════════════════════════════════════════════════════
APPROVED LESSON PLAN BASIS
═══════════════════════════════════════════════════════════════════
Subject                  : ${meta.subject}
Class / Stage            : ${meta.classLevel} (${pedagogy.stageName})
Topic                    : ${meta.topic}
Sub-Topics               : ${subTopics.join(' | ')}
Term                     : Term ${meta.term}  |  Week: Week ${meta.week}
Duration                 : ${meta.duration} minutes
State                    : ${state}
Session                  : ${meta.session ?? 'Current Academic Session'}

Cognitive Objectives     : ${plan?.objectives?.cognitive?.join('; ') ?? 'N/A'}
Instructional Materials  : ${plan?.instructionalMaterials?.join(', ') ?? 'N/A'}
Curriculum Objectives    : ${curriculumObjectives.join('; ')}

═══════════════════════════════════════════════════════════════════
STAGE-SPECIFIC QUALITY BENCHMARKS (${pedagogy.stageName})
═══════════════════════════════════════════════════════════════════
1. TEACHING CONTENT DEPTH:
   - For ${pedagogy.stageName}, write content perfectly calibrated for this age and cognitive level.
   - Developmental Focus: ${pedagogy.developmentalFocus}.
   - Do NOT talk down to students, but do NOT overwhelm with college-level abstraction if they are in basic education.

2. PRESENTATION (Complete Teaching Script):
   - Step 1: "${pedagogy.step1Title}" (${plan?.presentation?.[0]?.duration ?? '5 minutes'}). Detailed narrative of what the teacher says, questions asked, and student responses.
   - Step 2: "${pedagogy.step2Title}" (${plan?.presentation?.[1]?.duration ?? '20 minutes'}). In-depth conceptual exposition, teaching aids demonstration, and worked illustrations.
   - Step 3: "${pedagogy.step3Title}" (${plan?.presentation?.[2]?.duration ?? '10 minutes'}). Guided class practice, student problem solving, and checking for understanding.

3. SUBJECT CONTENT & WORKED EXAMPLES:
   - Provide comprehensive conceptual explanations for each sub-topic.
   - Include realistic worked examples with full step-by-step solutions.
   - Provide at least 3 crisp key points per sub-topic suitable for writing on the chalkboard.

4. BOARD SUMMARY:
   - Concise, organized notes designed for students to copy into their exercise notebooks.

5. EVALUATION:
   - ${pedagogy.evaluationGuidance}
   - Include both question and expected answers.

6. CONCLUSION & ASSIGNMENT:
   - Summary: ${pedagogy.summaryGuidance}
   - Assignment: ${pedagogy.assignmentGuidance}

═══════════════════════════════════════════════════════════════════
OUTPUT SCHEMA — return ONLY this exact JSON, no markdown, no extra commentary:
═══════════════════════════════════════════════════════════════════
{
  "header": {
    "subject": "${meta.subject}",
    "classLevel": "${meta.classLevel}",
    "topic": "${meta.topic}",
    "subTopics": ${JSON.stringify(subTopics.length > 0 ? subTopics : [meta.topic])},
    "term": ${meta.term},
    "week": ${meta.week},
    "duration": "${meta.duration} minutes",
    "state": "${state}",
    "session": "${meta.session ?? ''}"
  },
  "referenceBooks": ${JSON.stringify(plan?.referenceBooks ?? [`${meta.subject} Textbook for ${meta.classLevel}`])},
  "instructionalMaterials": ${JSON.stringify(plan?.instructionalMaterials ?? ['Relevant Charts', 'Realia'])},
  "entryBehaviour": "${plan?.entryBehaviour ?? 'Prerequisite foundational knowledge'}",
  "previousKnowledge": "${plan?.previousKnowledge ?? 'Previous week topic'}",
  "objectives": ${JSON.stringify(plan?.objectives ?? { cognitive: ['Understand topic'], affective: ['Show interest'], psychomotor: ['Participate'] })},
  "presentation": [
    {
      "step": 1,
      "title": "${pedagogy.step1Title}",
      "teacherActivity": "Detailed teacher action",
      "studentActivity": "Active student response",
      "content": "Full teaching script and initial review questions",
      "duration": "${plan?.presentation?.[0]?.duration ?? '5 minutes'}"
    },
    {
      "step": 2,
      "title": "${pedagogy.step2Title}",
      "teacherActivity": "Detailed demonstration using teaching aids",
      "studentActivity": "Active observation and question answering",
      "content": "Comprehensive step-by-step instruction and worked illustrations",
      "duration": "${plan?.presentation?.[1]?.duration ?? '20 minutes'}"
    },
    {
      "step": 3,
      "title": "${pedagogy.step3Title}",
      "teacherActivity": "Class supervision and guided practice",
      "studentActivity": "Solving exercises and discussing in pairs",
      "content": "Supervised classroom exercises and debriefing",
      "duration": "${plan?.presentation?.[2]?.duration ?? '10 minutes'}"
    }
  ],
  "subjectContent": [
    {
      "subTopic": "${subTopics[0] ?? meta.topic}",
      "explanation": "Clear, detailed conceptual explanation calibrated for ${meta.classLevel}",
      "workedExamples": [
        {
          "problem": "Example problem or scenario",
          "solution": "Step-by-step working and solution"
        }
      ],
      "keyPoints": [
        "Key point 1 for blackboard summary",
        "Key point 2 for blackboard summary",
        "Key point 3 for blackboard summary"
      ]
    }
  ],
  "boardSummary": [
    "Core definition or concept",
    "Key classification or formula",
    "Major classroom takeaway"
  ],
  "commonMisconceptions": ${JSON.stringify(plan?.commonMisconceptions ?? [{ description: 'Common error', reason: 'Misunderstanding', correction: 'Guidance' }])},
  "differentiation": ${JSON.stringify(plan?.differentiation ?? { support: 'Scaffolded help', extension: 'Challenging task' })},
  "evaluation": [
    {
      "question": "Evaluation Question 1?",
      "expectedAnswer": "Complete expected answer"
    },
    {
      "question": "Evaluation Question 2?",
      "expectedAnswer": "Complete expected answer"
    },
    {
      "question": "Evaluation Question 3?",
      "expectedAnswer": "Complete expected answer"
    }
  ],
  "summary": "Clear teacher closing recap connecting learning points",
  "assignment": [
    "Homework task 1 with specific instructions",
    "Homework task 2 for home reinforcement"
  ]
}`;

  return { prompt, systemPrompt: pedagogy.systemPrompt, stage };
}

/**
 * Calculates grounding fidelity score (0 - 100%) between curriculum objectives
 * and generated plan objectives.
 */
export function calculateGroundingFidelity(
  canonicalObjectives: string[],
  planObjectives: string[],
): { score: number; matchedCount: number; totalCount: number } {
  if (!canonicalObjectives || canonicalObjectives.length === 0) {
    return { score: 100, matchedCount: planObjectives.length, totalCount: planObjectives.length };
  }

  const normalizedPlanText = planObjectives.join(' ').toLowerCase();
  let matchedCount = 0;

  for (const obj of canonicalObjectives) {
    const words = obj
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3);

    if (words.length === 0) {
      matchedCount++;
      continue;
    }

    const matches = words.filter((w) => normalizedPlanText.includes(w));
    if (matches.length >= Math.min(2, words.length)) {
      matchedCount++;
    }
  }

  const score = Math.round((matchedCount / canonicalObjectives.length) * 100);
  return { score: Math.min(100, Math.max(0, score)), matchedCount, totalCount: canonicalObjectives.length };
}
