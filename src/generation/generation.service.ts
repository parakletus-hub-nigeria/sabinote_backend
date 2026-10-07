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
  CurriculumStage,
  CurriculumWeek,
  NotePhase,
  NoteStatus,
  PromptPhase,
  ResponseStatus,
  TransactionPurpose,
  TransactionStatus,
  TransactionType,
  Wallet,
} from '@prisma/client';
import axios from 'axios';
import type { Response } from 'express';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CurriculumService, NormalizedCurriculum } from '../curriculum/curriculum.service';
import { GenerateNoteDto } from './dto/generate-note.dto';
import { GeneratePlanDto } from './dto/generate-plan.dto';
import { RegenerateDto } from './dto/regenerate.dto';
import { LessonPlan, LessonPlanSchema } from './schemas/lesson-plan.schema';
import { LessonNote, LessonNoteSchema } from './schemas/lesson-note.schema';
import {
  detectCurriculumStage,
  buildGroundedPlanPrompt,
  buildGroundedNotePrompt,
  calculateGroundingFidelity,
  GroundedPlanOptions,
} from './prompts/stage-grounding.prompt';

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
    private curriculumService: CurriculumService,
    private cache: CacheService,
  ) {
    this.apiKey = config.getOrThrow('OPENROUTER_API_KEY');
    this.planCost = +config.get('PLAN_COST_PARATS', '8');
    this.noteCost = +config.get('NOTE_COST_PARATS', '12');
    this.regenCost = +config.get('REGENERATE_COST_PARATS', '5');
    const configuredModel = config.get('OPENROUTER_MODEL', 'google/gemini-2.5-flash');
    this.model =
      configuredModel === 'google/gemini-flash-1.5' || configuredModel === 'google/gemini-1.5-flash'
        ? 'google/gemini-2.5-flash'
        : configuredModel;
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
    if (!dto.curriculumUnitId && !dto.curriculumWeekId && !dto.generalCurriculumId) {
      throw new BadRequestException('Provide either curriculumUnitId, curriculumWeekId, or generalCurriculumId');
    }

    const session = this.academicSession();

    // Wallet + user always run in parallel (independent queries)
    const [wallet, user] = await Promise.all([
      this.ensureBalance(userId, this.planCost),
      this.cache.wrap(
        `user:settings:${userId}`,
        () => this.prisma.user.findUnique({ where: { userId }, include: { settings: true } }),
        120_000, // 2 min — short enough that settings changes feel responsive
      ),
    ]);

    const difficulty = user?.settings?.noteDifficultyLevel ?? 'standard';
    const teacherState = user?.state ?? user?.settings?.defaultState ?? 'Federal';

    const curriculum = await (dto.curriculumUnitId
      ? this.curriculumService.getUnitById(dto.curriculumUnitId, teacherState)
      : dto.curriculumWeekId
      ? this.curriculumService.getStateWeekById(dto.curriculumWeekId)
      : this.curriculumService.getGeneralWeekById(dto.generalCurriculumId!, teacherState));

    const { prompt, systemPrompt, stage } = this.buildPlanPrompt(
      curriculum,
      dto.durationMinutes,
      difficulty,
      session,
      {
        learningAids: dto.learningAids,
        pedagogicalEmphasis: dto.pedagogicalEmphasis,
      },
    );
    const { data: plan, tokensUsed, status, error: planError } = await this.callOpenRouter(prompt, LessonPlanSchema, this.planMaxTokens, systemPrompt);

    if (!plan) {
      const reason = planError ? (typeof planError === 'object' ? JSON.stringify(planError) : String(planError)) : 'Upstream provider failure';
      throw new ServiceUnavailableException(`AI generation failed: ${reason}. Your Parats were not deducted.`);
    }

    const canonicalObjectives = curriculum.objectives ?? [];
    const planCognitive = plan.objectives?.cognitive ?? [];
    const { score: groundingScore } = calculateGroundingFidelity(canonicalObjectives, planCognitive);
    this.logger.log(`Grounded plan generated for [${curriculum.topic}]. Stage: ${stage}, Fidelity score: ${groundingScore}%`);

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
          curriculumUnitId: curriculum.unitId ?? (curriculum.source === 'release' ? curriculum.id : undefined),
          curriculumReleaseId: curriculum.releaseId,
          curriculumWeekId: curriculum.source === 'state' ? curriculum.id : undefined,
          generalCurriculumId: curriculum.source === 'general' ? curriculum.id : undefined,
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
          lessonPlanContent: {
            ...plan,
            _grounding: {
              score: groundingScore,
              stage,
              curriculumReleaseId: curriculum.releaseId,
              curriculumUnitId: curriculum.unitId ?? (curriculum.source === 'release' ? curriculum.id : undefined),
            },
          } as any,
          parratCostPlan: this.planCost,
          phase: NotePhase.plan_only,
          status: NoteStatus.draft,
        },
      });

      return [transaction, lessonNote];
    });

    // Audit log — does not need to be in the financial transaction
    this.prisma.userPrompt.create({
      data: {
        userId,
        noteId: note.noteId,
        phase: PromptPhase.plan,
        promptText: `[STAGE: ${stage} | FIDELITY: ${groundingScore}%]\n${prompt}`,
        modelUsed: this.model,
        tokensUsed,
        responseStatus: status,
      },
    }).catch((e) => this.logger.warn('Failed to save plan prompt log', e));

    return {
      noteId: note.noteId,
      lessonPlan: plan,
      walletBalance: Number(wallet.balance) - this.planCost,
      parratsCost: this.planCost,
      grounding: {
        score: groundingScore,
        stage,
        curriculumReleaseId: curriculum.releaseId,
        curriculumUnitId: curriculum.unitId ?? (curriculum.source === 'release' ? curriculum.id : undefined),
      },
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

    // Wallet check + curriculum lookups run in parallel after ownership validation
    const [wallet, generalCurriculum, canonicalUnit] = await Promise.all([
      this.ensureBalance(userId, this.noteCost),
      note.generalCurriculumId
        ? this.prisma.generalCurriculum.findUnique({ where: { generalCurriculumId: note.generalCurriculumId } })
        : Promise.resolve(null),
      note.curriculumUnitId
        ? this.curriculumService.getUnitById(note.curriculumUnitId, note.state ?? 'Federal')
        : Promise.resolve(null),
    ]);

    const plan = dto.editedLessonPlan ?? (note.lessonPlanContent as unknown as LessonPlan);
    if (!plan) throw new BadRequestException('No lesson plan found to generate note from');

    // Build curriculum context: canonical unit takes top priority, then state week, then general fallback
    const curriculumContext = canonicalUnit
      ? canonicalUnit
      : note.curriculumWeek
        ? { ...note.curriculumWeek, classLevel: note.classLevel }
        : generalCurriculum
          ? { state: note.state ?? '', subTopics: generalCurriculum.subTopics, objectives: generalCurriculum.objectives, classLevel: note.classLevel }
          : { state: note.state ?? '', subTopics: [], objectives: [], classLevel: note.classLevel };

    const { prompt, systemPrompt, stage } = this.buildNotePrompt(plan, curriculumContext);
    const { data: lessonNote, tokensUsed, status } = await this.callOpenRouter(
      prompt,
      LessonNoteSchema,
      this.noteMaxTokens,
      systemPrompt || this.lessonNoteSystemPrompt,
    );

    if (!lessonNote) throw new ServiceUnavailableException('AI generation failed. Your Parats were not deducted.');

    const walletBalance = await this.chargeAndSaveNote({
      userId,
      noteId: dto.noteId,
      wallet,
      plan,
      lessonNote,
      prompt: `[STAGE: ${stage}]\n${prompt}`,
      tokensUsed,
      status,
      topic: note.topic,
      existingPlanContent: note.lessonPlanContent as Record<string, any>,
    });

    return {
      noteId: dto.noteId,
      lessonNote,
      walletBalance,
      parratsCost: this.noteCost,
      grounding: {
        stage,
        curriculumReleaseId: note.curriculumReleaseId,
        curriculumUnitId: note.curriculumUnitId,
      },
    };
  }

  /**
   * Charges the note cost and persists the generated note in one financial
   * transaction, then fire-and-forgets the audit log. Shared by the blocking
   * and streaming note-generation paths so the money logic can't drift.
   * Returns the new wallet balance.
   */
  private async chargeAndSaveNote(params: {
    userId: string;
    noteId: string;
    wallet: Wallet;
    plan: LessonPlan;
    lessonNote: LessonNote;
    prompt: string;
    tokensUsed: number;
    status: ResponseStatus;
    topic: string;
    existingPlanContent?: Record<string, any>;
  }): Promise<number> {
    const { userId, noteId, wallet, plan, lessonNote, prompt, tokensUsed, status, topic, existingPlanContent } = params;
    const newBalance = Number(wallet.balance) - this.noteCost;

    await this.prisma.$transaction(async (tx) => {
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
          description: `Lesson note: ${topic}`,
        },
      });

      await tx.wallet.update({ where: { walletId: wallet.walletId }, data: { balance: newBalance } });

      const existingPlan = existingPlanContent || {};
      const grounding = existingPlan._grounding;
      const preservedPlan = {
        ...plan,
        ...(grounding ? { _grounding: grounding } : {}),
        ...(existingPlan._telemetry ? { _telemetry: existingPlan._telemetry } : {}),
        ...(existingPlan._feedback ? { _feedback: existingPlan._feedback } : {}),
      };
      const preservedNote = {
        ...lessonNote,
        ...(grounding ? { _grounding: grounding } : {}),
      };

      await tx.lessonNote.update({
        where: { noteId },
        data: {
          lessonPlanContent: preservedPlan as any,
          lessonNoteContent: preservedNote as any,
          phase: NotePhase.complete,
          parratCostNote: this.noteCost,
          transactionId: transaction.transactionId,
        },
      });
    });

    // Audit log — does not need to be in the financial transaction
    this.prisma.userPrompt.create({
      data: {
        userId,
        noteId,
        phase: PromptPhase.note,
        promptText: prompt,
        modelUsed: this.model,
        tokensUsed,
        responseStatus: status,
      },
    }).catch((e) => this.logger.warn('Failed to save note prompt log', e));

    return newBalance;
  }

  // ─── Phase 2 (streaming): Lesson Note over SSE ───────────────────────────
  //
  // Streams the model's tokens to the client for live progress, then does the
  // authoritative parse/validate/charge/persist server-side once the full text
  // has arrived. The streamed tokens are UX only — the client trusts the final
  // `done` event, which carries the validated + persisted note.

  async streamNote(userId: string, dto: GenerateNoteDto, res: Response): Promise<void> {
    // ── Pre-checks run BEFORE we switch to SSE, so failures surface as normal
    //    HTTP errors handled by Nest's exception filter (no charge, clean JSON).
    const note = await this.prisma.lessonNote.findUnique({
      where: { noteId: dto.noteId },
      include: { curriculumWeek: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.userId !== userId) throw new ForbiddenException();
    if (note.phase !== NotePhase.plan_only) throw new BadRequestException('Note is already complete');

    const [wallet, generalCurriculum, canonicalUnit] = await Promise.all([
      this.ensureBalance(userId, this.noteCost),
      note.generalCurriculumId
        ? this.prisma.generalCurriculum.findUnique({ where: { generalCurriculumId: note.generalCurriculumId } })
        : Promise.resolve(null),
      note.curriculumUnitId
        ? this.curriculumService.getUnitById(note.curriculumUnitId, note.state ?? 'Federal')
        : Promise.resolve(null),
    ]);

    const plan = dto.editedLessonPlan ?? (note.lessonPlanContent as unknown as LessonPlan);
    if (!plan) throw new BadRequestException('No lesson plan found to generate note from');

    const curriculumContext = canonicalUnit
      ? canonicalUnit
      : note.curriculumWeek
        ? { ...note.curriculumWeek, classLevel: note.classLevel }
        : generalCurriculum
          ? { state: note.state ?? '', subTopics: generalCurriculum.subTopics, objectives: generalCurriculum.objectives, classLevel: note.classLevel }
          : { state: note.state ?? '', subTopics: [], objectives: [], classLevel: note.classLevel };

    const { prompt, systemPrompt, stage } = this.buildNotePrompt(plan, curriculumContext);

    // ── Switch to SSE mode. From here, errors are emitted as `error` events.
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // don't let any proxy buffer the stream
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Heartbeat keeps intermediaries from idling the connection out during
    // long model "thinking" gaps before the first token.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

    try {
      const { text, tokensUsed } = await this.streamOpenRouter(
        prompt,
        this.noteMaxTokens,
        systemPrompt || this.lessonNoteSystemPrompt,
        (delta) => send('token', { t: delta }),
      );

      const lessonNote = LessonNoteSchema.parse(JSON.parse(this.cleanRawJson(text)));

      const walletBalance = await this.chargeAndSaveNote({
        userId,
        noteId: dto.noteId,
        wallet,
        plan,
        lessonNote,
        prompt: `[STAGE: ${stage}]\n${prompt}`,
        tokensUsed,
        status: ResponseStatus.success,
        topic: note.topic,
        existingPlanContent: note.lessonPlanContent as Record<string, any>,
      });

      send('done', {
        noteId: dto.noteId,
        lessonNote,
        walletBalance,
        parratsCost: this.noteCost,
        grounding: {
          stage,
          curriculumReleaseId: note.curriculumReleaseId,
          curriculumUnitId: note.curriculumUnitId,
        },
      });
    } catch (err: any) {
      const detail = err?.response?.data ?? err?.message ?? 'Generation failed';
      this.logger.error('Streaming note generation failed', JSON.stringify(detail));
      // No charge occurred — the transaction only runs on the success path above.
      send('error', { message: 'AI generation failed. Your Parats were not deducted.' });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }

  // ─── Regenerate ──────────────────────────────────────────────────────────

  async regenerate(userId: string, dto: RegenerateDto) {
    const note = await this.prisma.lessonNote.findUnique({
      where: { noteId: dto.noteId },
      include: { curriculumWeek: true },
    });
    if (!note) throw new NotFoundException('Note not found');
    if (note.userId !== userId) throw new ForbiddenException();

    const isPlan = dto.phase === 'plan';

    // Wallet check + optional general curriculum + canonical unit + (for plan regen) user settings run in parallel
    const [wallet, generalCurriculum, canonicalUnit, user] = await Promise.all([
      this.ensureBalance(userId, this.regenCost),
      !note.curriculumWeek && note.generalCurriculumId
        ? this.prisma.generalCurriculum.findUnique({ where: { generalCurriculumId: note.generalCurriculumId } })
        : Promise.resolve(null),
      note.curriculumUnitId
        ? this.curriculumService.getUnitById(note.curriculumUnitId, note.state ?? 'Federal')
        : Promise.resolve(null),
      isPlan
        ? this.cache.wrap(
            `user:settings:${userId}`,
            () => this.prisma.user.findUnique({ where: { userId }, include: { settings: true } }),
            120_000,
          )
        : Promise.resolve(null),
    ]);

    const curriculumContext = canonicalUnit
      ? canonicalUnit
      : note.curriculumWeek
        ? { ...note.curriculumWeek, classLevel: note.classLevel }
        : generalCurriculum
          ? { state: note.state ?? '', subTopics: generalCurriculum.subTopics, objectives: generalCurriculum.objectives, classLevel: note.classLevel }
          : { state: note.state ?? '', subTopics: [], objectives: [], classLevel: note.classLevel };

    // Preserve the teacher's original duration (from the stored plan) and difficulty (from settings)
    // instead of silently resetting to defaults on regeneration.
    const storedPlan = note.lessonPlanContent as unknown as LessonPlan | null;
    const regenDuration = storedPlan?.metadata?.duration ?? 40;
    const regenDifficulty = user?.settings?.noteDifficultyLevel ?? 'standard';

    const { prompt: basePrompt, systemPrompt, stage } = isPlan
      ? this.buildPlanPrompt(
          curriculumContext as any,
          regenDuration,
          regenDifficulty,
          note.session ?? this.academicSession(),
        )
      : this.buildNotePrompt(note.lessonPlanContent as unknown as LessonPlan, curriculumContext);

    const prompt = dto.additionalInstructions
      ? `${basePrompt}\n\nADDITIONAL TEACHER INSTRUCTIONS: ${dto.additionalInstructions}`
      : basePrompt;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema: z.ZodTypeAny = isPlan ? LessonPlanSchema : LessonNoteSchema;
    const { data: content, tokensUsed, status } = await this.callOpenRouter(
      prompt,
      schema,
      isPlan ? this.planMaxTokens : this.noteMaxTokens,
      systemPrompt || (isPlan ? undefined : this.lessonNoteSystemPrompt),
    );

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
    });

    // Audit log — does not need to be in the financial transaction
    this.prisma.userPrompt.create({
      data: {
        userId,
        noteId: dto.noteId,
        phase: isPlan ? PromptPhase.plan : PromptPhase.note,
        promptText: prompt,
        modelUsed: this.model,
        tokensUsed,
        responseStatus: status,
      },
    }).catch((e) => this.logger.warn('Failed to save regen prompt log', e));

    return {
      noteId: dto.noteId,
      content,
      walletBalance: Number(wallet.balance) - this.regenCost,
      parratsCost: this.regenCost,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async ensureBalance(userId: string, cost: number): Promise<Wallet> {
    let wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      const user = await this.prisma.user.findUnique({ where: { userId } });
      if (!user) throw new NotFoundException('User not found');
      wallet = await this.prisma.wallet.create({
        data: {
          userId,
          balance: 24.0,
        },
      });
      this.logger.log(`Auto-provisioned initial wallet (24 Parats) for user ${userId}`);
    } else if (Number(wallet.balance) < cost) {
      // Check if user has zero transactions. If so, they are a newly registered teacher with 0 balance
      // Give them 24 starter Parats so they can generate their first lessons right away.
      const txCount = await this.prisma.transaction.count({ where: { userId } });
      if (txCount === 0) {
        wallet = await this.prisma.wallet.update({
          where: { walletId: wallet.walletId },
          data: { balance: 24.0 },
        });
        this.logger.log(`Granted starter welcome balance (24 Parats) to new user ${userId}`);
      }
    }
    if (Number(wallet.balance) < cost) {
      throw new HttpException(
        `Insufficient Parats. You need ${cost} Parats but have ${wallet.balance}.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return wallet;
  }

  /** Strips markdown code fences, reasoning tags, and trims to the outermost JSON object/array. */
  private cleanRawJson(raw: string): string {
    let cleaned = raw
      .replace(/<think[\s\S]*?<\/think>/gi, '')
      .replace(/<thought[\s\S]*?<\/thought>/gi, '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```[\s\S]*$/i, '')
      .trim();
    const start = cleaned.search(/[\{\[]/);
    if (start === -1) return cleaned;

    // Match the opening delimiter to its correct closer so trailing model
    // commentary (which may contain stray '}' or ']') can't corrupt the JSON.
    const open = cleaned[start];
    const close = open === '{' ? '}' : ']';
    const end = cleaned.lastIndexOf(close);
    if (end > start) cleaned = cleaned.substring(start, end + 1);

    // Remove any trailing commas before closing braces/brackets which invalidate JSON.parse
    cleaned = cleaned.replace(/,\s*([\}\]])/g, '$1');

    return cleaned;
  }

  private async callOpenRouter<T>(
    prompt: string,
    schema: z.ZodSchema<T> | z.ZodTypeAny,
    maxTokens = this.noteMaxTokens,
    systemPromptOverride?: string,
    _retryCount = 0,
    modelOverride?: string,
  ) {
    const SYSTEM = `${systemPromptOverride || 'You are an expert Nigerian secondary school curriculum specialist trained on NERDC standards.'}\n\nYou ONLY respond with valid JSON that matches the exact schema provided. No explanations, no markdown code fences, no preamble.`;
    const targetModel = modelOverride || this.model;

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: targetModel,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
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
          timeout: 75_000,
        },
      );

      const raw: string = response.data.choices?.[0]?.message?.content ?? '';
      const usage = response.data.usage;
      const tokensUsed = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);

      let validated: T;
      try {
        const cleaned = this.cleanRawJson(raw);
        const parsed = JSON.parse(cleaned);
        validated = schema.parse(parsed) as T;
      } catch (parseErr: any) {
        const parseMsg = parseErr?.errors?.[0]?.message || parseErr?.message || 'Invalid JSON/schema structure';
        this.logger.error(`AI output parsing failed [model: ${targetModel}]: ${parseMsg}`, raw.slice(0, 500));

        // If structured output parsing failed, retry with reliable fallback model
        if (_retryCount < 2) {
          const fallback = targetModel === 'google/gemini-2.5-flash' ? 'google/gemini-2.5-flash-lite' : 'google/gemini-2.5-flash';
          this.logger.warn(`Retrying generation with fallback model ${fallback} due to schema parsing failure on ${targetModel}`);
          return this.callOpenRouter(prompt, schema, maxTokens, systemPromptOverride, _retryCount + 1, fallback);
        }

        return {
          data: null,
          tokensUsed,
          status: ResponseStatus.failed,
          error: `Output structure mismatch: ${parseMsg}`,
        };
      }

      return { data: validated, tokensUsed, status: ResponseStatus.success };
    } catch (err: any) {
      const errStatus = err?.response?.status;
      const errMsg = err?.response?.data?.error?.message || err?.message || '';

      // Fallback on 402 (insufficient OpenRouter credits) to openrouter/free
      if (errStatus === 402 && targetModel !== 'openrouter/free' && _retryCount < 3) {
        this.logger.warn(`Insufficient OpenRouter credits on ${targetModel} (${errMsg}), seamlessly falling back to openrouter/free`);
        return this.callOpenRouter(prompt, schema, maxTokens, systemPromptOverride, _retryCount + 1, 'openrouter/free');
      }

      // If model not found or unsupported (404/400), try reliable fallback model
      if ((errStatus === 404 || errStatus === 400) && _retryCount < 2) {
        const fallback = targetModel === 'google/gemini-2.5-flash' ? 'google/gemini-2.5-flash-lite' : 'openrouter/free';
        this.logger.warn(`Model ${targetModel} unavailable or rejected response_format (${errMsg}), falling back to ${fallback}`);
        return this.callOpenRouter(prompt, schema, maxTokens, systemPromptOverride, _retryCount + 1, fallback);
      }

      // Retry on transient network/server errors (5xx, timeout, connection reset)
      const isTransient =
        err?.code === 'ECONNABORTED' ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNRESET' ||
        (errStatus >= 500 && errStatus !== 402);
      if (isTransient && _retryCount < 2) {
        const delay = (_retryCount + 1) * 1500;
        this.logger.warn(`Transient error (${err?.code ?? errStatus}), retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callOpenRouter(prompt, schema, maxTokens, systemPromptOverride, _retryCount + 1, targetModel);
      }

      const detail = err?.response?.data ?? err?.message ?? err;
      this.logger.error(`OpenRouter call failed [model: ${targetModel}]`, JSON.stringify(detail));
      const failReason = err?.response?.data?.error?.message || err?.message || 'OpenRouter service unavailable';
      return { data: null, tokensUsed: 0, status: ResponseStatus.failed, error: failReason };
    }
  }

  /**
   * Calls OpenRouter with `stream: true` and invokes `onDelta` for each content
   * chunk as it arrives. Resolves with the full accumulated text and token usage
   * once the stream ends. No retry — a mid-stream failure rejects and the caller
   * emits an error event (nothing is charged).
   */
  private async streamOpenRouter(
    prompt: string,
    maxTokens: number,
    systemPromptOverride: string,
    onDelta: (delta: string) => void,
    modelOverride?: string,
  ): Promise<{ text: string; tokensUsed: number }> {
    const SYSTEM = `${systemPromptOverride}\n\nYou ONLY respond with valid JSON that matches the exact schema provided. No explanations, no markdown code fences, no preamble.`;
    const targetModel = modelOverride || this.model;

    try {
      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: targetModel,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          stream: true,
          stream_options: { include_usage: true },
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
          responseType: 'stream',
          timeout: 120_000,
        },
      );

      return new Promise((resolve, reject) => {
        let full = '';
        let buffer = '';
        let tokensUsed = 0;

        const stream = response.data as NodeJS.ReadableStream;

        stream.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          // SSE frames are separated by newlines; keep the last (possibly partial) line buffered.
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === ': ping') continue;
            if (trimmed === 'data: [DONE]') continue;
            if (!trimmed.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const delta = parsed.choices?.[0]?.delta?.content ?? '';
              if (parsed.usage) {
                tokensUsed =
                  (parsed.usage.prompt_tokens ?? 0) +
                  (parsed.usage.completion_tokens ?? 0);
              }
              if (delta) {
                full += delta;
                onDelta(delta);
              }
            } catch {
              // Partial JSON spanning chunk boundaries — ignore; it'll complete next chunk.
            }
          }
        });

        stream.on('end', () => resolve({ text: full, tokensUsed }));
        stream.on('error', reject);
      });
    } catch (err: any) {
      const errStatus = err?.response?.status;
      if (errStatus === 402 && targetModel !== 'openrouter/free') {
        this.logger.warn(`OpenRouter credits depleted during stream (${targetModel}). Retrying stream with openrouter/free...`);
        return this.streamOpenRouter(prompt, maxTokens, systemPromptOverride, onDelta, 'openrouter/free');
      }
      throw err;
    }
  }

  // ─── Prompt Builders ─────────────────────────────────────────────────────

  private buildPlanPrompt(
    c: NormalizedCurriculum | CurriculumWeek,
    durationMinutes: number,
    difficulty: string,
    session: string,
    options?: GroundedPlanOptions,
  ): { prompt: string; systemPrompt: string; stage: CurriculumStage } {
    return buildGroundedPlanPrompt(c as NormalizedCurriculum, durationMinutes, difficulty, session, options);
  }

  private buildNotePrompt(
    plan: LessonPlan,
    c: { state?: string | null; subTopics: string[]; objectives: string[]; classLevel?: string } | null,
  ): { prompt: string; systemPrompt: string; stage: CurriculumStage } {
    return buildGroundedNotePrompt(plan, c);
  }

  private academicSession(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }
}
