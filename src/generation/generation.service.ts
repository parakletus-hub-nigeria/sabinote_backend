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
    if (!dto.curriculumWeekId && !dto.generalCurriculumId) {
      throw new BadRequestException('Provide either curriculumWeekId or generalCurriculumId');
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

    const curriculum = await (dto.curriculumWeekId
      ? this.curriculumService.getStateWeekById(dto.curriculumWeekId)
      : this.curriculumService.getGeneralWeekById(dto.generalCurriculumId!, teacherState));

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
          lessonPlanContent: plan as any,
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
        promptText: prompt,
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

    // Wallet check + general curriculum lookup run in parallel after ownership validation
    const [wallet, generalCurriculum] = await Promise.all([
      this.ensureBalance(userId, this.noteCost),
      note.generalCurriculumId
        ? this.prisma.generalCurriculum.findUnique({ where: { generalCurriculumId: note.generalCurriculumId } })
        : Promise.resolve(null),
    ]);

    const plan = dto.editedLessonPlan ?? (note.lessonPlanContent as unknown as LessonPlan);
    if (!plan) throw new BadRequestException('No lesson plan found to generate note from');

    // Build curriculum context: state curriculum week takes priority, then general fallback
    const curriculumContext = note.curriculumWeek
      ? note.curriculumWeek
      : generalCurriculum
        ? { state: note.state ?? '', subTopics: generalCurriculum.subTopics, objectives: generalCurriculum.objectives }
        : null;

    const prompt = this.buildNotePrompt(plan, curriculumContext);
    const { data: lessonNote, tokensUsed, status } = await this.callOpenRouter(prompt, LessonNoteSchema, this.noteMaxTokens, this.lessonNoteSystemPrompt);

    if (!lessonNote) throw new ServiceUnavailableException('AI generation failed. Your Parats were not deducted.');

    const walletBalance = await this.chargeAndSaveNote({
      userId,
      noteId: dto.noteId,
      wallet,
      plan,
      lessonNote,
      prompt,
      tokensUsed,
      status,
      topic: note.topic,
    });

    return {
      noteId: dto.noteId,
      lessonNote,
      walletBalance,
      parratsCost: this.noteCost,
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
  }): Promise<number> {
    const { userId, noteId, wallet, plan, lessonNote, prompt, tokensUsed, status, topic } = params;
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

      await tx.lessonNote.update({
        where: { noteId },
        data: {
          lessonPlanContent: plan as any,
          lessonNoteContent: lessonNote as any,
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

    const [wallet, generalCurriculum] = await Promise.all([
      this.ensureBalance(userId, this.noteCost),
      note.generalCurriculumId
        ? this.prisma.generalCurriculum.findUnique({ where: { generalCurriculumId: note.generalCurriculumId } })
        : Promise.resolve(null),
    ]);

    const plan = dto.editedLessonPlan ?? (note.lessonPlanContent as unknown as LessonPlan);
    if (!plan) throw new BadRequestException('No lesson plan found to generate note from');

    const curriculumContext = note.curriculumWeek
      ? note.curriculumWeek
      : generalCurriculum
        ? { state: note.state ?? '', subTopics: generalCurriculum.subTopics, objectives: generalCurriculum.objectives }
        : null;

    const prompt = this.buildNotePrompt(plan, curriculumContext);

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
        this.lessonNoteSystemPrompt,
        (delta) => send('token', { t: delta }),
      );

      const lessonNote = LessonNoteSchema.parse(JSON.parse(this.cleanRawJson(text)));

      const walletBalance = await this.chargeAndSaveNote({
        userId,
        noteId: dto.noteId,
        wallet,
        plan,
        lessonNote,
        prompt,
        tokensUsed,
        status: ResponseStatus.success,
        topic: note.topic,
      });

      send('done', { noteId: dto.noteId, lessonNote, walletBalance, parratsCost: this.noteCost });
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

    // Wallet check + optional general curriculum + (for plan regen) user settings run in parallel
    const [wallet, generalCurriculum, user] = await Promise.all([
      this.ensureBalance(userId, this.regenCost),
      !note.curriculumWeek && note.generalCurriculumId
        ? this.prisma.generalCurriculum.findUnique({ where: { generalCurriculumId: note.generalCurriculumId } })
        : Promise.resolve(null),
      isPlan
        ? this.cache.wrap(
            `user:settings:${userId}`,
            () => this.prisma.user.findUnique({ where: { userId }, include: { settings: true } }),
            120_000,
          )
        : Promise.resolve(null),
    ]);

    const curriculumContext = note.curriculumWeek
      ? note.curriculumWeek
      : generalCurriculum
        ? { state: note.state ?? '', subTopics: generalCurriculum.subTopics, objectives: generalCurriculum.objectives }
        : null;

    // Preserve the teacher's original duration (from the stored plan) and difficulty (from settings)
    // instead of silently resetting to defaults on regeneration.
    const storedPlan = note.lessonPlanContent as unknown as LessonPlan | null;
    const regenDuration = storedPlan?.metadata?.duration ?? 40;
    const regenDifficulty = user?.settings?.noteDifficultyLevel ?? 'standard';

    const basePrompt = isPlan
      ? this.buildPlanPrompt(note.curriculumWeek ?? { state: note.state ?? '', subTopics: [], objectives: [], subject: note.subjectName, classLevel: note.classLevel, term: note.term ?? 1, week: note.week ?? 1, topic: note.topic } as any, regenDuration, regenDifficulty, note.session ?? this.academicSession())
      : this.buildNotePrompt(note.lessonPlanContent as unknown as LessonPlan, curriculumContext);

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

  /** Strips markdown code fences and trims to the outermost JSON object/array. */
  private cleanRawJson(raw: string): string {
    let cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```[\s\S]*$/i, '').trim();
    const start = cleaned.search(/[\{\[]/);
    if (start === -1) return cleaned;

    // Match the opening delimiter to its correct closer so trailing model
    // commentary (which may contain stray '}' or ']') can't corrupt the JSON.
    const open = cleaned[start];
    const close = open === '{' ? '}' : ']';
    const end = cleaned.lastIndexOf(close);
    if (end > start) cleaned = cleaned.substring(start, end + 1);
    return cleaned;
  }

  private async callOpenRouter<T>(
    prompt: string,
    schema: z.ZodSchema<T> | z.ZodTypeAny,
    maxTokens = this.noteMaxTokens,
    systemPromptOverride?: string,
    _retryCount = 0,
  ) {
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
          timeout: 60_000,
        },
      );

      const raw: string = response.data.choices?.[0]?.message?.content ?? '';
      const usage = response.data.usage;
      const tokensUsed = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);

      const cleaned = this.cleanRawJson(raw);
      const parsed = JSON.parse(cleaned);
      const validated = schema.parse(parsed);

      return { data: validated as T, tokensUsed, status: ResponseStatus.success };
    } catch (err: any) {
      // Reduce tokens on 402 (insufficient model credits), max 3 reductions
      if (err?.response?.status === 402 && maxTokens > 2000 && _retryCount < 3) {
        this.logger.warn(`Insufficient credits, retrying with reduced max_tokens: ${maxTokens - 1000}`);
        return this.callOpenRouter(prompt, schema, maxTokens - 1000, systemPromptOverride, _retryCount + 1);
      }

      // Retry on transient network/server errors (5xx, timeout, connection reset)
      const isTransient =
        err?.code === 'ECONNABORTED' ||
        err?.code === 'ETIMEDOUT' ||
        err?.code === 'ECONNRESET' ||
        (err?.response?.status >= 500 && err?.response?.status !== 402);
      if (isTransient && _retryCount < 2) {
        const delay = (_retryCount + 1) * 1500;
        this.logger.warn(`Transient error (${err?.code ?? err?.response?.status}), retrying in ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.callOpenRouter(prompt, schema, maxTokens, systemPromptOverride, _retryCount + 1);
      }

      const detail = err?.response?.data ?? err?.message ?? err;
      this.logger.error('OpenRouter call failed', JSON.stringify(detail));
      return { data: null, tokensUsed: 0, status: ResponseStatus.failed };
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
  ): Promise<{ text: string; tokensUsed: number }> {
    const SYSTEM = `${systemPromptOverride}\n\nYou ONLY respond with valid JSON that matches the exact schema provided. No explanations, no markdown code fences, no preamble.`;

    const response = await axios.post(
      `${this.baseUrl}/chat/completions`,
      {
        model: this.model,
        max_tokens: maxTokens,
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
          if (!trimmed.startsWith('data:')) continue; // skip `:` keepalive comments
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            if (json.error) {
              reject(new Error(json.error?.message ?? 'OpenRouter stream error'));
              return;
            }
            if (json.usage) {
              tokensUsed = (json.usage.prompt_tokens ?? 0) + (json.usage.completion_tokens ?? 0);
            }
            const delta: string | undefined = json.choices?.[0]?.delta?.content;
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
  }

  // ─── Prompt Builders ─────────────────────────────────────────────────────

  private buildPlanPrompt(
    c: NormalizedCurriculum | CurriculumWeek,
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

  private buildNotePrompt(plan: LessonPlan, c: { state?: string | null; subTopics: string[]; objectives: string[] } | null): string {
    const meta = plan?.metadata ?? {};
    const state = c?.state ?? meta.state ?? '';
    const subTopics = c?.subTopics ?? meta.subTopics ?? [];
    const curriculumObjectives = c?.objectives ?? [];

    return `You are a Master Teacher and curriculum author with expertise in Nigerian NERDC secondary school education. You write the most detailed, pedagogically sound lesson notes in Nigeria — the kind that pass Ministry of Education inspections and are used as model documents in teacher training.

Generate a COMPREHENSIVE LESSON NOTE from the approved lesson plan below. A lesson note is MORE detailed than a lesson plan — it is both the teacher's full delivery script AND the students' study reference.

═══════════════════════════════════════
APPROVED LESSON PLAN
═══════════════════════════════════════
${JSON.stringify(plan)}

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
  - diagram (OPTIONAL): Only include when a visual genuinely aids understanding. Omit entirely for non-visual topics.
    Supported types (choose the most appropriate):
    • "number_line"     → integers/fractions on a line. Fields: range:[min,max], markedPoints:[{value,label?}]
    • "cartesian_plane" → coordinates/graphs. Fields: xRange:[min,max], yRange:[min,max], points:[{x,y,label?}], lines:[{from:{x,y},to:{x,y}}]
    • "bar_chart"       → statistics/data display. Fields: bars:[{label,value}], yAxisLabel?
    • "table_of_values" → function input/output table. Fields: columns:[{header,values:[...strings]}]

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
    { "step": 1, "title": "Identification of Prior Ideas", "teacherActivity": "<third-person, no dialogue>", "studentActivity": "<third-person, no dialogue>", "content": "<full academic content per the Step 1 rules above>", "duration": "5 minutes" },
    { "step": 2, "title": "Exploration", "teacherActivity": "<...>", "studentActivity": "<...>", "content": "<full academic content per the Step 2 rules above>", "duration": "20 minutes" },
    { "step": 3, "title": "Discussion & Application", "teacherActivity": "<...>", "studentActivity": "<...>", "content": "<full academic content per the Step 3 rules above>", "duration": "10 minutes" }
  ],
  "subjectContent": [
    {
      "subTopic": "<sub-topic name>",
      "explanation": "<complete, self-contained academic content — definitions, rules, formulas, context>",
      "workedExamples": [
        { "problem": "<problem statement>", "solution": "Step 1: ...\\nStep 2: ...\\nAnswer: ..." }
      ],
      "keyPoints": ["<exact board text 1>", "<key fact 2>"],
      "diagram": {
        "type": "number_line | cartesian_plane | bar_chart | table_of_values",
        "title": "<optional — OMIT the entire diagram field for non-visual topics>",
        "range": [-5, 5],
        "markedPoints": [{ "value": 3, "label": "A" }]
      }
    }
  ],
  "commonMisconceptions": [
    { "description": "<error>", "reason": "<why students make it>", "correction": "<how teacher corrects it>" }
  ],
  "differentiation": { "support": "<strategy for struggling students>", "extension": "<task for advanced students>" },
  "boardSummary": ["<key fact/formula 1>", "<2>", "<3>", "<4 — 4-6 items total>"],
  "evaluation": [
    { "question": "<question testing a stated objective>", "expectedAnswer": "<complete expected answer>" }
  ],
  "summary": "<teacher's closing recap — key points, real-life link, encouragement>",
  "assignment": ["<task 1 with textbook reference if applicable>", "<task 2 — 2-4 tasks total>"]
}

Follow the array minimums stated in the rules above (objectives, worked examples, board summary, evaluation). The placeholders show structure only — replace every one with rich, complete content.`;
  }

  private academicSession(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    return month >= 9 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }
}
