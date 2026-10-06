import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NoteFeedbackDto } from './dto/note-feedback.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { trackContentDiff } from './telemetry/diff-tracker';

@Injectable()
export class NotesService {
  constructor(private prisma: PrismaService) {}

  async list(userId: string, page: number, limit: number, subject?: string, classLevel?: string) {
    const where: any = { userId };
    if (subject) where.subjectName = subject;
    if (classLevel) where.classLevel = classLevel;

    const [notes, total] = await Promise.all([
      this.prisma.lessonNote.findMany({
        where,
        select: {
          noteId: true, name: true, subjectName: true, topic: true,
          classLevel: true, term: true, week: true, phase: true,
          status: true, isExported: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.lessonNote.count({ where }),
    ]);

    return { notes, pagination: { page, limit, total } };
  }

  async findOne(userId: string, noteId: string) {
    const note = await this.prisma.lessonNote.findUnique({ where: { noteId } });
    if (!note) throw new NotFoundException('Note not found');
    if (note.userId !== userId) throw new ForbiddenException();

    const plan = note.lessonPlanContent as Record<string, any> | null;
    const noteContent = note.lessonNoteContent as Record<string, any> | null;
    const feedback = noteContent?._feedback ?? plan?._feedback ?? null;
    const telemetry = noteContent?._telemetry ?? plan?._telemetry ?? null;
    const grounding = plan?._grounding ?? noteContent?._grounding ?? null;

    return {
      ...note,
      feedback,
      telemetry,
      grounding,
    };
  }

  async update(userId: string, noteId: string, dto: UpdateNoteDto) {
    const existing = await this.findOne(userId, noteId);

    const safeParse = (val: any) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val);
        } catch {
          return val;
        }
      }
      return val;
    };

    const data: Record<string, any> = { updatedAt: new Date() };

    if (dto.lessonPlanContent !== undefined) {
      const parsedPlan = safeParse(dto.lessonPlanContent);
      const prevPlan = (existing.lessonPlanContent as Record<string, any>) || {};
      const existingTelemetry = prevPlan._telemetry;
      const telemetry = trackContentDiff(prevPlan, parsedPlan, existingTelemetry);
      data.lessonPlanContent = {
        ...parsedPlan,
        _telemetry: telemetry,
        ...(prevPlan._feedback ? { _feedback: prevPlan._feedback } : {}),
        ...(prevPlan._grounding ? { _grounding: prevPlan._grounding } : {}),
      };
    }

    if (dto.lessonNoteContent !== undefined) {
      const parsedNote = safeParse(dto.lessonNoteContent);
      const prevNote = (existing.lessonNoteContent as Record<string, any>) || {};
      const existingTelemetry = prevNote._telemetry;
      const telemetry = trackContentDiff(prevNote, parsedNote, existingTelemetry);
      data.lessonNoteContent = {
        ...parsedNote,
        _telemetry: telemetry,
        ...(prevNote._feedback ? { _feedback: prevNote._feedback } : {}),
        ...(prevNote._grounding ? { _grounding: prevNote._grounding } : {}),
      };
    }

    return this.prisma.lessonNote.update({
      where: { noteId },
      data,
      select: { noteId: true, updatedAt: true },
    });
  }

  async submitFeedback(userId: string, noteId: string, dto: NoteFeedbackDto) {
    const note = await this.findOne(userId, noteId);

    const feedbackData = {
      rating: dto.rating,
      sentiment: dto.sentiment,
      tags: dto.tags ?? [],
      comment: dto.comment,
      submittedAt: new Date().toISOString(),
    };

    const targetKey = note.lessonNoteContent ? 'lessonNoteContent' : 'lessonPlanContent';
    const currentContent = (note[targetKey] as Record<string, any>) || {};

    const updatedContent = {
      ...currentContent,
      _feedback: feedbackData,
    };

    await this.prisma.lessonNote.update({
      where: { noteId },
      data: {
        [targetKey]: updatedContent,
      },
    });

    return {
      noteId,
      feedback: feedbackData,
    };
  }

  async delete(userId: string, noteId: string) {
    await this.findOne(userId, noteId);
    await this.prisma.lessonNote.delete({ where: { noteId } });
  }

  async search(userId: string, query: string, subject?: string, classLevel?: string) {
    const where: any = {
      userId,
      OR: [
        { topic: { contains: query, mode: 'insensitive' } },
        { subjectName: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ],
    };
    if (subject) where.subjectName = subject;
    if (classLevel) where.classLevel = classLevel;

    return this.prisma.lessonNote.findMany({
      where,
      select: {
        noteId: true, name: true, subjectName: true, topic: true,
        classLevel: true, term: true, week: true, phase: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
