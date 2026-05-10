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
    const { data: lessonNote, tokensUsed, status } = await this.callOpenRouter(prompt, LessonNoteSchema, this.noteMaxTokens);

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
    const { data: content, tokensUsed, status } = await this.callOpenRouter(prompt, schema, isPlan ? this.planMaxTokens : this.noteMaxTokens);

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

  private async callOpenRouter<T>(prompt: string, schema: z.ZodSchema<T> | z.ZodTypeAny, maxTokens = this.noteMaxTokens) {
    const SYSTEM = `You are an expert Nigerian secondary school curriculum specialist trained on NERDC standards.
You ONLY respond with valid JSON that matches the exact schema provided. No explanations, no markdown code fences, no preamble.`;

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

      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleaned);
      const validated = schema.parse(parsed);

      return { data: validated as T, tokensUsed, status: ResponseStatus.success };
    } catch (err: any) {
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
    return `Generate a NERDC-compliant Lesson Plan for a Nigerian secondary school teacher.

CURRICULUM CONTEXT (from ${c.state} State official curriculum):
- Subject: ${c.subject}
- Class Level: ${c.classLevel}
- Term: ${c.term}, Week: ${c.week}
- Topic: ${c.topic}
- Sub-topics: ${c.subTopics.join('; ')}
- Learning Objectives from curriculum: ${c.objectives.join('; ')}
- Teaching Activities: ${c.teachingActivities ?? 'Not specified'}
- Teaching Aids: ${c.teachingAids ?? 'Not specified'}
- Reference Text: ${c.referenceText ?? 'Not specified'}
- Lesson Duration: ${durationMinutes} minutes
- Difficulty Level: ${difficulty}
- Academic Session: ${session}

Return ONLY this JSON structure (no markdown, no extra text):
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
  "objectives": ["Behavioural objective 1", "Behavioural objective 2", "..."],
  "entryBehaviour": "What students already know that connects to this lesson",
  "instructionalMaterials": ["Material 1", "Material 2"],
  "referenceMaterials": ["${c.referenceText ?? c.subject + ' textbook'}"],
  "introduction": {
    "setInduction": "Detailed teacher set induction activity that engages students",
    "duration": "5 minutes"
  },
  "development": [
    {
      "step": 1,
      "teacherActivity": "What the teacher does and says in step 1",
      "studentActivity": "What students do in step 1",
      "duration": "10 minutes"
    },
    {
      "step": 2,
      "teacherActivity": "What the teacher does and says in step 2",
      "studentActivity": "What students do in step 2",
      "duration": "10 minutes"
    },
    {
      "step": 3,
      "teacherActivity": "What the teacher does and says in step 3",
      "studentActivity": "What students do in step 3",
      "duration": "10 minutes"
    }
  ],
  "evaluation": ["Evaluation question 1?", "Evaluation question 2?", "Evaluation question 3?"],
  "conclusion": "How teacher wraps up the lesson",
  "assignment": "Specific homework or assignment for students"
}`;
  }

  private buildNotePrompt(plan: LessonPlan, c: CurriculumWeek | null): string {
    const meta = plan?.metadata ?? {};
    return `Generate a comprehensive Lesson Note (detailed teacher narrative) from this approved Lesson Plan.

APPROVED LESSON PLAN:
${JSON.stringify(plan, null, 2)}

CURRICULUM CONTEXT:
- State: ${c?.state ?? meta.state}
- Sub-topics to cover: ${c?.subTopics?.join('; ') ?? meta.subTopics?.join('; ')}
- Original curriculum objectives: ${c?.objectives?.join('; ') ?? 'As per lesson plan'}

The lesson note is the teacher's full narrative script and teaching guide. It must be thorough enough for a substitute teacher to deliver the lesson.

Return ONLY this JSON structure (no markdown, no extra text):
{
  "metadata": ${JSON.stringify(meta)},
  "introduction": {
    "narrative": "Full text of what teacher says to open the lesson and hook students",
    "priorKnowledge": "What prior knowledge teacher checks and how",
    "duration": "5 minutes"
  },
  "body": [
    {
      "subTopic": "Name of sub-topic 1",
      "explanation": "Complete conceptual explanation of this sub-topic",
      "teacherNarrative": "Word-for-word what the teacher says while teaching this sub-topic",
      "workedExamples": [
        { "problem": "Example problem statement", "solution": "Full step-by-step solution" }
      ],
      "boardSummary": ["Key point 1 to write on the board", "Key point 2"]
    }
  ],
  "misconceptions": [
    { "misconception": "Common wrong idea students have", "correction": "How to correct it" }
  ],
  "differentiation": {
    "slowerLearners": "Specific strategies and simplified approaches for struggling students",
    "fasterLearners": "Extension activities and deeper questions for advanced students"
  },
  "formativeAssessment": [
    { "question": "Question to check understanding during lesson", "expectedAnswer": "Expected response" }
  ],
  "conclusion": "How teacher summarises and closes the lesson",
  "assignment": ["Assignment question 1", "Assignment question 2", "Assignment question 3"]
}`;
  }

  private academicSession(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }
}
