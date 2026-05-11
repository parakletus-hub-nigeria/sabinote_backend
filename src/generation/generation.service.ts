import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CurriculumWeek,
  NotePhase,
  NoteStatus,
  PromptPhase,
  ResponseStatus,
  TransactionPurpose,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import axios from 'axios';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateNoteDto } from './dto/generate-note.dto';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { RegenerateDto } from './dto/regenerate.dto';
import { LessonPlan, LessonPlanSchema } from './schemas/lesson-plan.schema';
import { LessonNote, LessonNoteSchema } from './schemas/lesson-note.schema';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  private readonly apiKey: string;
  private readonly planCost: number;
  private readonly noteCost: number;
  private readonly regenCost: number;
  private readonly model: string;
  private readonly planMaxTokens: number;
  private readonly noteMaxTokens: number;
  private readonly baseUrl = 'https://openrouter.ai/api/v1';
  private readonly lessonNoteSystemPrompt: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.apiKey = config.getOrThrow('OPENROUTER_API_KEY');
    this.planCost = +config.get('PLAN_COST_PARATS', '8');
    this.noteCost = +config.get('NOTE_COST_PARATS', '12');
    this.regenCost = +config.get('REGENERATE_COST_PARATS', '5');
    this.model = config.get('OPENROUTER_MODEL', 'google/gemini-flash-1.5');
    this.planMaxTokens = +config.get('PLAN_MAX_TOKENS', '3000');
    this.noteMaxTokens = +config.get('NOTE_MAX_TOKENS', '5000');
    
    try {
      // Resolve spec file with multiple candidates so it works locally (cwd = project root)
      // and on Azure (compiled to dist/src/, spec copied into dist/)
      const candidates = [
        path.join(__dirname, '..', '..', 'sabinote_lesson_note_spec.md'), // Azure: dist/src -> dist/
        path.join(process.cwd(), 'sabinote_lesson_note_spec.md'),          // local dev
        path.join(__dirname, 'sabinote_lesson_note_spec.md'),              // same dir fallback
      ];
      let spec = '';
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          spec = fs.readFileSync(candidate, 'utf8');
          this.logger.log(`Spec loaded from: ${candidate}`);
          break;
        }
      }
      const match = spec.match(/## PART 1 — SYSTEM PROMPT[\s\S]*?```[\s\n]*([\s\S]*?)```/i);
      this.lessonNoteSystemPrompt = match ? match[1].trim() : 'You are an expert Nigerian secondary school curriculum specialist trained on NERDC standards.';
      if (!match) this.logger.warn('Spec file found but PART 1 block not matched — using fallback prompt.');
    } catch (e) {
      this.logger.warn('Could not load sabinote_lesson_note_spec.md — using fallback prompt.');
      this.lessonNoteSystemPrompt = 'You are an expert Nigerian secondary school curriculum specialist trained on NERDC standards.';
    }
  }

  // ─── Phase 1: Lesson Plan ────────────────────────────────────────────────

  async generatePlan(userId: string, dto: GeneratePlanDto) {
    const wallet = await this.ensureBalance(userId, this.planCost);

    const curriculum = await this.prisma.curriculumWeek.findUnique({
      where: { curriculumWeekId: dto.curriculumWeekId },
    });
    if (!curriculum) throw new NotFoundException('Curriculum week not found');

    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { settings: true },
    });

    const difficulty = user?.settings?.noteDifficultyLevel ?? 'standard';
    const session = this.academicSession();

    const prompt = this.buildPlanPrompt(curriculum, dto.durationMinutes, difficulty, session);
    const { data: plan, tokensUsed, status } = await this.callOpenRouter(prompt, LessonPlanSchema, this.planMaxTokens);

    if (!plan) throw new ServiceUnavailableException('AI generation failed. Your Parats were not deducted.');

    const noteName = `${curriculum.classLevel} ${curriculum.subject} Wk${curriculum.week} T${curriculum.term}`;

    const [, note] = await this.prisma.$transaction(async (tx) => {
      const newBalance = Number(wallet.balance) - this.planCost;

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.walletId,
          userId,
          type: TransactionType.debit,
          amountDeducted: this.planCost,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          purpose: TransactionPurpose.lesson_plan_generation,
          status: TransactionStatus.success,
          description: `Lesson plan: ${curriculum.topic}`,
        },
      });

      await tx.wallet.update({ where: { walletId: wallet.walletId }, data: { balance: newBalance } });

      const lessonNote = await tx.lessonNote.create({
        data: {
          userId,
          curriculumWeekId: dto.curriculumWeekId,
          transactionId: transaction.transactionId,
          resourceId: dto.resourceId,
          name: noteName,
          subjectName: curriculum.subject,
          topic: curriculum.topic,
          classLevel: curriculum.classLevel,
          term: curriculum.term,
          week: curriculum.week,
          state: curriculum.state,
          session,
          lessonPlanContent: plan as any,
          parratCostPlan: this.planCost,
          phase: NotePhase.plan_only,
          status: NoteStatus.draft,
        },
      });

      await tx.userPrompt.create({
        data: {
          userId,
          noteId: lessonNote.noteId,
          phase: PromptPhase.plan,
          promptText: prompt,
          modelUsed: this.model,
          tokensUsed,
          responseStatus: status,
        },
      });

      return [transaction, lessonNote];
    });

    return {
      noteId: note.noteId,
      lessonPlan: plan,
      walletBalance: Number(wallet.balance) - this.planCost,
      parratsCost: this.planCost,
    };
  }

  // ─── Phase 2: Lesson Note ────────────────────────────────────────────────

  async generateNote(userId: string, dto: GenerateNoteDto) {
    const note = await this.prisma.lessonNote.findUnique({
      where: { noteId: dto.noteId },
      include: { curriculumWeek: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.userId !== userId) throw new ForbiddenException();
    if (note.phase !== NotePhase.plan_only) throw new BadRequestException('Note is already complete');

    const wallet = await this.ensureBalance(userId, this.noteCost);

    const plan = dto.editedLessonPlan ?? (note.lessonPlanContent as unknown as LessonPlan);
    if (!plan) throw new BadRequestException('No lesson plan found to generate note from');

    const prompt = this.buildNotePrompt(plan, note.curriculumWeek!);
    const { data: lessonNote, tokensUsed, status } = await this.callOpenRouter(prompt, LessonNoteSchema, this.noteMaxTokens, this.lessonNoteSystemPrompt);

    if (!lessonNote) throw new ServiceUnavailableException('AI generation failed. Your Parats were not deducted.');

    await this.prisma.$transaction(async (tx) => {
      const newBalance = Number(wallet.balance) - this.noteCost;

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.walletId,
          userId,
          type: TransactionType.debit,
          amountDeducted: this.noteCost,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          purpose: TransactionPurpose.lesson_note_generation,
          status: TransactionStatus.success,
          description: `Lesson note: ${note.topic}`,
        },
      });

      await tx.wallet.update({ where: { walletId: wallet.walletId }, data: { balance: newBalance } });

      await tx.lessonNote.update({
        where: { noteId: dto.noteId },
        data: {
          lessonPlanContent: plan as any,
          lessonNoteContent: lessonNote as any,
          phase: NotePhase.complete,
          parratCostNote: this.noteCost,
          transactionId: transaction.transactionId,
        },
      });

      await tx.userPrompt.create({
        data: {
          userId,
          noteId: dto.noteId,
          phase: PromptPhase.note,
          promptText: prompt,
          modelUsed: this.model,
          tokensUsed,
          responseStatus: status,
        },
      });
    });

    return {
      noteId: dto.noteId,
      lessonNote,
      walletBalance: Number(wallet.balance) - this.noteCost,
      parratsCost: this.noteCost,
    };
  }

  // ─── Regenerate ──────────────────────────────────────────────────────────

  async regenerate(userId: string, dto: RegenerateDto) {
    const note = await this.prisma.lessonNote.findUnique({
      where: { noteId: dto.noteId },
      include: { curriculumWeek: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.userId !== userId) throw new ForbiddenException();

    const wallet = await this.ensureBalance(userId, this.regenCost);
    const isPlan = dto.phase === 'plan';

    const basePrompt = isPlan
      ? this.buildPlanPrompt(note.curriculumWeek!, 40, 'standard', note.session ?? this.academicSession())
      : this.buildNotePrompt(note.lessonPlanContent as unknown as LessonPlan, note.curriculumWeek!);

    const prompt = dto.additionalInstructions
      ? `${basePrompt}\n\nADDITIONAL TEACHER INSTRUCTIONS: ${dto.additionalInstructions}`
      : basePrompt;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema: z.ZodTypeAny = isPlan ? LessonPlanSchema : LessonNoteSchema;
    const { data: content, tokensUsed, status } = await this.callOpenRouter(prompt, schema, isPlan ? this.planMaxTokens : this.noteMaxTokens, isPlan ? undefined : this.lessonNoteSystemPrompt);

    if (!content) throw new ServiceUnavailableException('AI generation failed. Your Parats were not deducted.');

    await this.prisma.$transaction(async (tx) => {
      const newBalance = Number(wallet.balance) - this.regenCost;
      await tx.wallet.update({ where: { walletId: wallet.walletId }, data: { balance: newBalance } });
      await tx.transaction.create({
        data: {
          walletId: wallet.walletId,
          userId,
          type: TransactionType.debit,
          amountDeducted: this.regenCost,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          purpose: isPlan ? TransactionPurpose.lesson_plan_generation : TransactionPurpose.lesson_note_generation,
          status: TransactionStatus.success,
          description: `Regenerate ${dto.phase}: ${note.topic}`,
        },
      });
      await tx.lessonNote.update({
        where: { noteId: dto.noteId },
        data: isPlan ? { lessonPlanContent: content as any } : { lessonNoteContent: content as any },
      });
      await tx.userPrompt.create({
        data: {
          userId,
          noteId: dto.noteId,
          phase: isPlan ? PromptPhase.plan : PromptPhase.note,
          promptText: prompt,
          modelUsed: this.model,
          tokensUsed,
          responseStatus: status,
        },
      });
    });

    return {
      noteId: dto.noteId,
      content,
      walletBalance: Number(wallet.balance) - this.regenCost,
      parratsCost: this.regenCost,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async ensureBalance(userId: string, cost: number) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    if (Number(wallet.balance) < cost) {
      throw new HttpException(
        `Insufficient Parats. You need ${cost} Parats but have ${wallet.balance}.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return wallet;
  }

  private async callOpenRouter<T>(prompt: string, schema: z.ZodSchema<T> | z.ZodTypeAny, maxTokens = this.noteMaxTokens, systemPromptOverride?: string) {
    const SYSTEM = `${systemPromptOverride || 'You are an expert Nigerian secondary school curriculum specialist trained on NERDC standards.'}\n\nYou ONLY respond with valid JSON that matches the exact schema provided. No explanations, no markdown code fences, no preamble.`;

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: prompt },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://sabinote.app',
            'X-Title': 'SabiNote',
          },
        },
      );

      const raw: string = response.data.choices?.[0]?.message?.content ?? '';
      const usage = response.data.usage;
      const tokensUsed = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);

      let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/i, '').trim();
      
      const startIdx = cleaned.search(/[\{\[]/);
      if (startIdx !== -1) {
        const endIdx = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
        if (endIdx > startIdx) {
          cleaned = cleaned.substring(startIdx, endIdx + 1);
        }
      }
      
      const parsed = JSON.parse(cleaned);
      const validated = schema.parse(parsed);

      return { data: validated as T, tokensUsed, status: ResponseStatus.success };
    } catch (err: any) {
      if (err?.response?.status === 402 && maxTokens > 2000) {
        this.logger.warn(`Insufficient credits, retrying with reduced max_tokens: ${maxTokens - 1000}`);
        return this.callOpenRouter(prompt, schema, maxTokens - 1000, systemPromptOverride);
      }

      const detail = err?.response?.data ?? err?.message ?? err;
      this.logger.error('OpenRouter call failed', JSON.stringify(detail));
      return { data: null, tokensUsed: 0, status: ResponseStatus.failed };
    }
  }

  // ─── Prompt Builders ─────────────────────────────────────────────────────

  private buildPlanPrompt(
    c: CurriculumWeek,
    durationMinutes: number,
    difficulty: string,
    session: string,
  ): string {
    const refBook = c.referenceText ?? `${c.subject} textbook for ${c.classLevel}`;
    return `You are an expert Nigerian secondary school teacher with 20 years of experience writing NERDC-compliant lesson plans inspected and approved by the Ministry of Education.

Generate a complete, inspector-ready LESSON PLAN (not lesson note) for the following class.

═══════════════════════════════════════
CURRICULUM DATA (${c.state} State)
═══════════════════════════════════════
Subject        : ${c.subject}
Class          : ${c.classLevel}
Term           : ${c.term}  |  Week: ${c.week}
Topic          : ${c.topic}
Sub-topics     : ${c.subTopics.join(' | ')}
Duration       : ${durationMinutes} minutes
Difficulty     : ${difficulty}
Session        : ${session}
Curriculum Objectives : ${c.objectives.join('; ')}
Teaching Activities   : ${c.teachingActivities ?? 'Not specified'}
Teaching Aids         : ${c.teachingAids ?? 'Not specified'}
Reference Text        : ${refBook}

═══════════════════════════════════════
QUALITY STANDARDS — follow these exactly
═══════════════════════════════════════

OBJECTIVES — write in three domains:
• Cognitive (knowledge/thinking): use Bloom's verbs — identify, state, define, explain, calculate, solve, compare, classify, analyse, evaluate. Start each with "By the end of this lesson, students will be able to..."
• Affective (values/attitudes): use — appreciate, show interest in, cooperate, demonstrate willingness to, develop the habit of
• Psychomotor (physical skills): use — draw, construct, measure, demonstrate, perform, use instruments to

ENTRY BEHAVIOUR: ONE specific, observable prerequisite skill students MUST already have RIGHT NOW. Not what they will learn — what they must know BEFORE this lesson starts. Be precise (e.g. "Students can multiply two-digit numbers without a calculator").

PREVIOUS KNOWLEDGE: The specific lesson/topic taught BEFORE this one that logically links to today's content. Name the topic and explain the connection.

REFERENCE BOOKS: Include the specific Nigerian textbook(s) used in ${c.state} State schools for ${c.subject} ${c.classLevel}, plus the NERDC curriculum document.

INSTRUCTIONAL MATERIALS: Specific, practical teaching aids available in Nigerian secondary schools (charts, cardboard, rulers, number lines, local examples — not "projector" or "laptop").

PRESENTATION — use the standard Nigerian 3-step format:
• Step 1 — "Identification of Prior Ideas": Teacher reviews previous lesson with 2-3 targeted questions. Students answer from memory. Duration: ~5 min.
• Step 2 — "Exploration": Teacher introduces and demonstrates new concepts. Uses materials. Asks probing questions. Students engage actively. Duration: ~20 min.
• Step 3 — "Discussion & Application": Class discusses key concepts. Students solve examples together. Teacher checks understanding. Duration: ~10 min.

EVALUATION: 3-5 questions that directly test whether each stated cognitive objective was met. Mix recall, comprehension, and application.

SUMMARY: What the teacher says to close the lesson — recapping key points, praising participation, previewing next lesson.

ASSIGNMENT: Specific textbook exercise or task students complete at home.

═══════════════════════════════════════
OUTPUT — return ONLY this exact JSON, no markdown, no extra text:
═══════════════════════════════════════
{
  "metadata": {
    "subject": "${c.subject}",
    "classLevel": "${c.classLevel}",
    "topic": "${c.topic}",
    "subTopics": ${JSON.stringify(c.subTopics)},
    "term": ${c.term},
    "week": ${c.week},
    "duration": ${durationMinutes},
    "state": "${c.state}",
    "session": "${session}"
  },
  "referenceBooks": ["${refBook}", "NERDC ${c.subject} Curriculum for ${c.classLevel}"],
  "instructionalMaterials": ["Material 1", "Material 2", "Material 3"],
  "entryBehaviour": "One specific observable prerequisite skill students must already possess",
  "previousKnowledge": "Topic and content taught in the previous lesson that connects to this one",
  "objectives": {
    "cognitive": [
      "By the end of this lesson, students will be able to [Bloom's verb] ...",
      "By the end of this lesson, students will be able to [Bloom's verb] ..."
    ],
    "affective": ["Students will appreciate / show interest in ..."],
    "psychomotor": ["Students will demonstrate / use / construct ..."]
  },
  "presentation": [
    {
      "step": 1,
      "title": "Identification of Prior Ideas",
      "teacherActivity": "Teacher asks 2-3 targeted review questions from the previous lesson",
      "studentActivity": "Students answer questions from memory, recalling previous lesson",
      "duration": "5 minutes"
    },
    {
      "step": 2,
      "title": "Exploration",
      "teacherActivity": "Teacher introduces new concept with clear explanations and demonstrations using instructional materials",
      "studentActivity": "Students observe, take notes, ask questions, attempt guided examples",
      "duration": "20 minutes"
    },
    {
      "step": 3,
      "title": "Discussion & Application",
      "teacherActivity": "Teacher guides class discussion and supervises practice exercises",
      "studentActivity": "Students solve problems individually or in pairs, share answers",
      "duration": "10 minutes"
    }
  ],
  "commonMisconceptions": [
    {
      "description": "Error description",
      "reason": "Why students make it",
      "correction": "How teacher corrects it"
    }
  ],
  "differentiation": {
    "support": "Support strategy for struggling students",
    "extension": "Extension task for advanced students"
  },
  "evaluation": [
    "Evaluation question 1 testing cognitive objective 1?",
    "Evaluation question 2 testing cognitive objective 2?",
    "Evaluation question 3 testing application of the concept?"
  ],
  "summary": "Teacher recaps the 3 most important points, praises participation, states what the next lesson will cover",
  "assignment": "Specific task with textbook page reference for students to complete at home"
}`;
  }

  private buildNotePrompt(plan: LessonPlan, c: CurriculumWeek | null): string {
    const meta = plan?.metadata ?? {};
    const state = c?.state ?? meta.state ?? '';
    const subTopics = c?.subTopics ?? meta.subTopics ?? [];
    const curriculumObjectives = c?.objectives ?? [];

    return `You are a Master Teacher and curriculum author with expertise in Nigerian NERDC secondary school education. You write the most detailed, pedagogically sound lesson notes in Nigeria — the kind that pass Ministry of Education inspections and are used as model documents in teacher training.

Generate a COMPREHENSIVE LESSON NOTE from the approved lesson plan below. A lesson note is MORE detailed than a lesson plan — it is both the teacher's full delivery script AND the students' study reference.

═══════════════════════════════════════
APPROVED LESSON PLAN
═══════════════════════════════════════
${JSON.stringify(plan, null, 2)}

═══════════════════════════════════════
CURRICULUM CONTEXT (${state} State)
═══════════════════════════════════════
Sub-topics to cover  : ${subTopics.join(' | ')}
Curriculum objectives: ${curriculumObjectives.join('; ')}

═══════════════════════════════════════
WHAT MAKES A HIGH-QUALITY LESSON NOTE — follow every point
═══════════════════════════════════════

HEADER: Use the exact values from the lesson plan metadata.

REFERENCE BOOKS: Full titles of Nigerian textbooks used in ${state} State schools plus the NERDC curriculum document. Include author, edition if known.

INSTRUCTIONAL MATERIALS: Practical materials available in Nigerian secondary schools. Be specific (e.g. "Cardboard factor trees for prime factorisation", "Number line drawn on manila paper").

ENTRY BEHAVIOUR: ONE specific, observable skill students must already have to access this lesson. Write it as a testable statement (e.g. "Students can add and subtract integers without assistance").

PREVIOUS KNOWLEDGE: Specifically name the previous topic and explain HOW it connects to today's lesson. This is used for bridging in Step 1.

OBJECTIVES — three domains:
• Cognitive (min 3): Use Bloom's verbs (identify/state/define/explain/calculate/solve/compare/classify/analyse/evaluate). Format: "By the end of this lesson, students will be able to [verb] [specific outcome]."
• Affective (min 2): Attitudes, values, cooperation, appreciation of the subject
• Psychomotor (min 2): Practical/physical skills demonstrated in this lesson

PRESENTATION — The NERDC 3-step format. Each step needs:
  - title: exact step name
  - teacherActivity: third-person description of what the teacher does. No dialogue.
  - studentActivity: third-person description of what students do. No dialogue.
  - content: Complete academic content for this step — write definitions, explanations, facts, and examples in plain prose. NO DIALOGUE. Do not write a script.

  Step 1 — "Identification of Prior Ideas" (~5 min):
    Content must include: 2-3 specific review questions from last lesson, expected answers, how teacher bridges to today's topic

  Step 2 — "Exploration" (~20 min):
    Content must include: Full introduction of each new concept, precise definitions, detailed explanations, probing questions to check understanding mid-way, teacher demonstrations with the instructional materials, at least 1 worked example per sub-topic done by teacher

  Step 3 — "Discussion & Application" (~10 min):
    Content must include: Class practice problems, how teacher circulates and supports, common errors to watch for, how teacher confirms objectives have been met

SUBJECT CONTENT — per sub-topic:
  - explanation: Complete, self-contained academic content a student can read and understand independently. Include definitions, formulas, rules, worked-through examples with full workings. Write at the right level for ${meta.classLevel ?? ''}.
  - workedExamples: At least 2 per sub-topic. Each solution must show EVERY step — no jumping. Nigerian students need to see the complete working.
  - keyPoints: The exact sentences the teacher writes on the board. Short, memorable, correct.

BOARD SUMMARY: 4-6 key facts/rules/formulas for students to copy. These go on the board at the end of the lesson.

EVALUATION: 3-5 questions. Each question tests a specific stated objective. Include mix of: recall (1-2), comprehension (1), application/problem-solving (1-2). Write the complete expected answer.

SUMMARY: What the teacher says in the last 2-3 minutes — recap of the 3 most important things learned, connection to real life or next lesson, encouragement.

ASSIGNMENT: 2-4 specific tasks. Include textbook page numbers if referenced in the lesson plan. Mix of practice and extension.

═══════════════════════════════════════
OUTPUT — return ONLY this exact JSON, no markdown, no extra text:
═══════════════════════════════════════
{
  "header": {
    "subject": "${meta.subject ?? ''}",
    "classLevel": "${meta.classLevel ?? ''}",
    "topic": "${meta.topic ?? ''}",
    "subTopics": ${JSON.stringify(subTopics)},
    "term": ${meta.term ?? 1},
    "week": ${meta.week ?? 1},
    "duration": "${meta.duration ?? 40} minutes",
    "state": "${state}",
    "session": "${meta.session ?? ''}"
  },
  "referenceBooks": ["Full textbook title 1", "NERDC Curriculum document"],
  "instructionalMaterials": ["Specific material 1", "Specific material 2", "Specific material 3"],
  "entryBehaviour": "Single specific observable prerequisite skill",
  "previousKnowledge": "Name of previous topic and how it connects to today",
  "objectives": {
    "cognitive": [
      "By the end of this lesson, students will be able to [verb] ...",
      "By the end of this lesson, students will be able to [verb] ...",
      "By the end of this lesson, students will be able to [verb] ..."
    ],
    "affective": [
      "Students will appreciate / cooperate / show interest in ...",
      "Students will develop the habit of ..."
    ],
    "psychomotor": [
      "Students will demonstrate / draw / construct ...",
      "Students will use instruments to ..."
    ]
  },
  "presentation": [
    {
      "step": 1,
      "title": "Identification of Prior Ideas",
      "teacherActivity": "Teacher reviews the previous topic by writing three review questions on the board.",
      "studentActivity": "Students solve the review questions in their notebooks.",
      "content": "The previous lesson covered percentages. To connect this to money, the teacher reviews the concept of finding 10% of 500 Naira (50 Naira) and converting 50% to a decimal (0.5).",
      "duration": "5 minutes"
    },
    {
      "step": 2,
      "title": "Exploration",
      "teacherActivity": "Teacher introduces Cost Price and Selling Price, demonstrating the calculation of Profit and Loss.",
      "studentActivity": "Students copy definitions into their notes and observe the worked examples.",
      "content": "Cost Price (CP) is the price at which goods are bought. Selling Price (SP) is the price at which goods are sold. Profit occurs when SP is greater than CP (Profit = SP - CP). Loss occurs when CP is greater than SP (Loss = CP - SP).",
      "duration": "20 minutes"
    },
    {
      "step": 3,
      "title": "Discussion & Application",
      "teacherActivity": "Teacher writes three practice word problems on the board and circulates to correct mistakes.",
      "studentActivity": "Students calculate profit and loss for the given word problems.",
      "content": "Word problems involve calculating profit from a CP of 1000 Naira and SP of 1200 Naira, and calculating loss from a CP of 500 Naira and SP of 450 Naira.",
      "duration": "10 minutes"
    }
  ],
  "subjectContent": [
    {
      "subTopic": "Name of sub-topic",
      "explanation": "Complete academic explanation students can study from — definitions, rules, formulas, context",
      "workedExamples": [
        { "problem": "Problem statement", "solution": "Step 1: ...\\nStep 2: ...\\nStep 3: ...\\nAnswer: ..." },
        { "problem": "Second problem", "solution": "Full step-by-step working" }
      ],
      "keyPoints": [
        "Definition or rule written exactly as it appears on the board",
        "Formula or key fact 2",
        "Important reminder or exception"
      ]
    }
  ],
  "commonMisconceptions": [
    {
      "description": "Error description",
      "reason": "Why students make it",
      "correction": "How teacher corrects it"
    }
  ],
  "differentiation": {
    "support": "Support strategy for struggling students",
    "extension": "Extension task for advanced students"
  },
  "boardSummary": [
    "Key definition 1 (exact board text)",
    "Formula or rule 2",
    "Important fact 3",
    "Reminder or exception 4"
  ],
  "evaluation": [
    { "question": "Recall question testing objective 1?", "expectedAnswer": "Complete expected answer" },
    { "question": "Comprehension question testing objective 2?", "expectedAnswer": "Complete expected answer" },
    { "question": "Application problem testing objective 3?", "expectedAnswer": "Full worked answer" }
  ],
  "summary": "Teacher recaps the main definitions of profit and loss, summarises the formulas, and previews the next lesson on simple interest.",
  "assignment": [
    "Specific task 1 with textbook reference if applicable",
    "Specific task 2"
  ]
}`;
  }

  private academicSession(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }
}
