import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SeedCurriculumDto } from './dto/seed-curriculum.dto';

@Injectable()
export class CurriculumService {
  constructor(private prisma: PrismaService) {}

  async getStates() {
    const rows = await this.prisma.curriculumWeek.findMany({
      distinct: ['state'],
      select: { state: true },
      orderBy: { state: 'asc' },
    });
    return rows.map((r) => r.state);
  }

  async getSubjects(state: string, classLevel: string) {
    const rows = await this.prisma.curriculumWeek.findMany({
      where: { state, classLevel },
      distinct: ['subject'],
      select: { subject: true },
      orderBy: { subject: 'asc' },
    });
    return rows.map((r) => r.subject);
  }

  async getWeeks(state: string, subject: string, classLevel: string, term: number) {
    return this.prisma.curriculumWeek.findMany({
      where: { state, subject, classLevel, term },
      select: { curriculumWeekId: true, week: true, topic: true },
      orderBy: { week: 'asc' },
    });
  }

  async getWeek(state: string, subject: string, classLevel: string, term: number, week: number) {
    const row = await this.prisma.curriculumWeek.findUnique({
      where: { state_subject_classLevel_term_week: { state, subject, classLevel, term, week } },
    });
    if (!row) throw new NotFoundException('Curriculum week not found');
    return row;
  }

  async seed(dto: SeedCurriculumDto) {
    const results = await Promise.allSettled(
      dto.weeks.map((w) =>
        this.prisma.curriculumWeek.upsert({
          where: {
            state_subject_classLevel_term_week: {
              state: w.state, subject: w.subject,
              classLevel: w.classLevel, term: w.term, week: w.week,
            },
          },
          update: w,
          create: w,
        }),
      ),
    );
    const upserted = results.filter((r) => r.status === 'fulfilled').length;
    return { upserted, total: dto.weeks.length };
  }
}
