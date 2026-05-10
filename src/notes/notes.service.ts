import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateNoteDto } from './dto/update-note.dto';

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
    return note;
  }

  async update(userId: string, noteId: string, dto: UpdateNoteDto) {
    await this.findOne(userId, noteId);
    return this.prisma.lessonNote.update({
      where: { noteId },
      data: { ...dto, updatedAt: new Date() },
      select: { noteId: true, updatedAt: true },
    });
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
