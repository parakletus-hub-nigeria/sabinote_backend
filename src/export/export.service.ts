import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma/prisma.service';
import { LessonNote } from '../generation/schemas/lesson-note.schema';
import { LessonPlan } from '../generation/schemas/lesson-plan.schema';

type NoteRecord = Awaited<ReturnType<ExportService['getNote']>>;

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async exportPdf(userId: string, noteId: string): Promise<{ buffer: Buffer; filename: string }> {
    const note = await this.getNote(userId, noteId);

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (note.lessonNoteContent) {
        this.renderNotePdf(doc, note as NoteRecord & { lessonNoteContent: LessonNote }, note);
      } else if (note.lessonPlanContent) {
        this.renderPlanPdf(doc, note as NoteRecord & { lessonPlanContent: LessonPlan }, note);
      } else {
        doc.text('No content available.');
      }

      doc.end();
    });

    await this.markExported(noteId);
    return { buffer, filename: this.buildFilename(note.topic, 'pdf') };
  }

  async exportDocx(userId: string, noteId: string): Promise<{ buffer: Buffer; filename: string }> {
    const note = await this.getNote(userId, noteId);

    let children: (Paragraph | Table)[];

    if (note.lessonNoteContent) {
      children = this.renderNoteDocx(note as NoteRecord & { lessonNoteContent: LessonNote }, note);
    } else if (note.lessonPlanContent) {
      children = this.renderPlanDocx(note as NoteRecord & { lessonPlanContent: LessonPlan }, note);
    } else {
      children = [new Paragraph({ children: [new TextRun('No content available.')] })];
    }

    const doc = new Document({ sections: [{ properties: {}, children }] });
    const buffer = await Packer.toBuffer(doc);
    await this.markExported(noteId);
    return { buffer, filename: this.buildFilename(note.topic, 'docx') };
  }

  // ─── PDF Renderers ────────────────────────────────────────────────────────

  private renderPlanPdf(doc: PDFKit.PDFDocument, note: NoteRecord, meta: NoteRecord) {
    const plan = note.lessonPlanContent as unknown as LessonPlan;

    this.pdfHeader(doc, meta);

    this.pdfSection(doc, 'BEHAVIOURAL OBJECTIVES');
    plan.objectives.forEach((o, i) => doc.fontSize(10).font('Helvetica').text(`${i + 1}. ${o}`, { indent: 20 }));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'ENTRY BEHAVIOUR');
    doc.fontSize(10).font('Helvetica').text(plan.entryBehaviour, { indent: 20 });
    doc.moveDown(0.5);

    this.pdfSection(doc, 'INSTRUCTIONAL MATERIALS');
    plan.instructionalMaterials.forEach((m) => doc.fontSize(10).font('Helvetica').text(`• ${m}`, { indent: 20 }));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'REFERENCE MATERIALS');
    plan.referenceMaterials.forEach((r) => doc.fontSize(10).font('Helvetica').text(`• ${r}`, { indent: 20 }));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'INTRODUCTION / SET INDUCTION');
    doc.fontSize(10).font('Helvetica').text(plan.introduction.setInduction, { indent: 20 });
    doc.fontSize(9).fillColor('gray').text(`Duration: ${plan.introduction.duration}`, { indent: 20 });
    doc.fillColor('black').moveDown(0.5);

    this.pdfSection(doc, 'LESSON DEVELOPMENT');
    plan.development.forEach((step) => {
      doc.fontSize(10).font('Helvetica-Bold').text(`Step ${step.step}${step.duration ? '  (' + step.duration + ')' : ''}`, { indent: 10 });
      doc.fontSize(10).font('Helvetica').text(`Teacher: ${step.teacherActivity}`, { indent: 20 });
      doc.fontSize(10).font('Helvetica').text(`Students: ${step.studentActivity}`, { indent: 20 });
      doc.moveDown(0.3);
    });

    this.pdfSection(doc, 'EVALUATION');
    plan.evaluation.forEach((q, i) => doc.fontSize(10).font('Helvetica').text(`${i + 1}. ${q}`, { indent: 20 }));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'CONCLUSION');
    doc.fontSize(10).font('Helvetica').text(plan.conclusion, { indent: 20 });
    doc.moveDown(0.5);

    this.pdfSection(doc, 'ASSIGNMENT');
    doc.fontSize(10).font('Helvetica').text(plan.assignment, { indent: 20 });
  }

  private renderNotePdf(doc: PDFKit.PDFDocument, note: NoteRecord, meta: NoteRecord) {
    const ln = note.lessonNoteContent as unknown as LessonNote;

    this.pdfHeader(doc, meta);

    this.pdfSection(doc, 'INTRODUCTION');
    doc.fontSize(10).font('Helvetica').text(ln.introduction.narrative, { indent: 20 });
    doc.fontSize(10).font('Helvetica').text(`Prior Knowledge: ${ln.introduction.priorKnowledge}`, { indent: 20 });
    doc.fontSize(9).fillColor('gray').text(`Duration: ${ln.introduction.duration}`, { indent: 20 });
    doc.fillColor('black').moveDown(0.5);

    this.pdfSection(doc, 'LESSON BODY');
    ln.body.forEach((section, idx) => {
      doc.fontSize(11).font('Helvetica-Bold').text(`${idx + 1}. ${section.subTopic}`, { indent: 10 });
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica').text(section.explanation, { indent: 20 });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica-Oblique').text('Teacher Narrative:', { indent: 20 });
      doc.fontSize(10).font('Helvetica').text(section.teacherNarrative, { indent: 30 });

      if (section.workedExamples.length) {
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica-Bold').text('Worked Examples:', { indent: 20 });
        section.workedExamples.forEach((ex, ei) => {
          doc.fontSize(10).font('Helvetica').text(`Example ${ei + 1}: ${ex.problem}`, { indent: 30 });
          doc.fontSize(10).font('Helvetica').text(`Solution: ${ex.solution}`, { indent: 40 });
        });
      }

      if (section.boardSummary.length) {
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica-Bold').text('Board Summary:', { indent: 20 });
        section.boardSummary.forEach((pt) => doc.fontSize(10).font('Helvetica').text(`• ${pt}`, { indent: 30 }));
      }
      doc.moveDown(0.5);
    });

    this.pdfSection(doc, 'MISCONCEPTIONS & CORRECTIONS');
    ln.misconceptions.forEach((m) => {
      doc.fontSize(10).font('Helvetica-Bold').text(`Misconception: ${m.misconception}`, { indent: 20 });
      doc.fontSize(10).font('Helvetica').text(`Correction: ${m.correction}`, { indent: 20 });
      doc.moveDown(0.2);
    });

    this.pdfSection(doc, 'DIFFERENTIATION');
    doc.fontSize(10).font('Helvetica-Bold').text('Slower Learners:', { indent: 20 });
    doc.fontSize(10).font('Helvetica').text(ln.differentiation.slowerLearners, { indent: 30 });
    doc.fontSize(10).font('Helvetica-Bold').text('Faster Learners:', { indent: 20 });
    doc.fontSize(10).font('Helvetica').text(ln.differentiation.fasterLearners, { indent: 30 });
    doc.moveDown(0.5);

    this.pdfSection(doc, 'FORMATIVE ASSESSMENT');
    ln.formativeAssessment.forEach((fa, i) => {
      doc.fontSize(10).font('Helvetica').text(`Q${i + 1}: ${fa.question}`, { indent: 20 });
      doc.fontSize(10).font('Helvetica-Oblique').text(`Expected: ${fa.expectedAnswer}`, { indent: 30 });
      doc.moveDown(0.2);
    });

    this.pdfSection(doc, 'CONCLUSION');
    doc.fontSize(10).font('Helvetica').text(ln.conclusion, { indent: 20 });
    doc.moveDown(0.5);

    this.pdfSection(doc, 'ASSIGNMENT');
    ln.assignment.forEach((a, i) => doc.fontSize(10).font('Helvetica').text(`${i + 1}. ${a}`, { indent: 20 }));
  }

  private pdfHeader(doc: PDFKit.PDFDocument, note: NoteRecord) {
    doc.fontSize(16).font('Helvetica-Bold').text(note.name ?? note.topic, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica').text(
      `Subject: ${note.subjectName}  |  Class: ${note.classLevel}  |  Term ${note.term ?? ''}  Week ${note.week ?? ''}`,
      { align: 'center' },
    );
    if (note.state) doc.fontSize(10).fillColor('gray').text(`State: ${note.state}  |  Session: ${note.session ?? ''}`, { align: 'center' });
    doc.fillColor('black').moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);
  }

  private pdfSection(doc: PDFKit.PDFDocument, title: string) {
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a1a').text(title);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.strokeColor('black').lineWidth(1);
    doc.fillColor('black').moveDown(0.3);
  }

  // ─── DOCX Renderers ───────────────────────────────────────────────────────

  private renderPlanDocx(note: NoteRecord, meta: NoteRecord): (Paragraph | Table)[] {
    const plan = note.lessonPlanContent as unknown as LessonPlan;
    const out: (Paragraph | Table)[] = [...this.docxHeader(meta)];

    out.push(this.docxHeading('BEHAVIOURAL OBJECTIVES'));
    plan.objectives.forEach((o, i) => out.push(this.docxBody(`${i + 1}. ${o}`)));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('ENTRY BEHAVIOUR'));
    out.push(this.docxBody(plan.entryBehaviour));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('INSTRUCTIONAL MATERIALS'));
    plan.instructionalMaterials.forEach((m) => out.push(this.docxBullet(m)));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('REFERENCE MATERIALS'));
    plan.referenceMaterials.forEach((r) => out.push(this.docxBullet(r)));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('INTRODUCTION / SET INDUCTION'));
    out.push(this.docxBody(plan.introduction.setInduction));
    out.push(this.docxMeta(`Duration: ${plan.introduction.duration}`));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('LESSON DEVELOPMENT'));
    out.push(this.docxDevelopmentTable(plan.development));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('EVALUATION'));
    plan.evaluation.forEach((q, i) => out.push(this.docxBody(`${i + 1}. ${q}`)));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('CONCLUSION'));
    out.push(this.docxBody(plan.conclusion));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('ASSIGNMENT'));
    out.push(this.docxBody(plan.assignment));

    return out;
  }

  private renderNoteDocx(note: NoteRecord, meta: NoteRecord): (Paragraph | Table)[] {
    const ln = note.lessonNoteContent as unknown as LessonNote;
    const out: (Paragraph | Table)[] = [...this.docxHeader(meta)];

    out.push(this.docxHeading('INTRODUCTION'));
    out.push(this.docxBody(ln.introduction.narrative));
    out.push(this.docxBody(`Prior Knowledge: ${ln.introduction.priorKnowledge}`));
    out.push(this.docxMeta(`Duration: ${ln.introduction.duration}`));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('LESSON BODY'));
    ln.body.forEach((section, idx) => {
      out.push(this.docxSubHeading(`${idx + 1}. ${section.subTopic}`));
      out.push(this.docxBody(section.explanation));
      out.push(new Paragraph({ children: [new TextRun({ text: 'Teacher Narrative:', italics: true, bold: true })] }));
      out.push(this.docxBody(section.teacherNarrative));

      if (section.workedExamples.length) {
        out.push(this.docxSubHeading('Worked Examples'));
        section.workedExamples.forEach((ex, ei) => {
          out.push(this.docxBody(`Example ${ei + 1}: ${ex.problem}`));
          out.push(this.docxBody(`Solution: ${ex.solution}`));
        });
      }

      if (section.boardSummary.length) {
        out.push(this.docxSubHeading('Board Summary'));
        section.boardSummary.forEach((pt) => out.push(this.docxBullet(pt)));
      }
      out.push(this.docxSpacer());
    });

    out.push(this.docxHeading('MISCONCEPTIONS & CORRECTIONS'));
    ln.misconceptions.forEach((m) => {
      out.push(new Paragraph({ children: [new TextRun({ text: `Misconception: ${m.misconception}`, bold: true })] }));
      out.push(this.docxBody(`Correction: ${m.correction}`));
      out.push(this.docxSpacer());
    });

    out.push(this.docxHeading('DIFFERENTIATION'));
    out.push(new Paragraph({ children: [new TextRun({ text: 'Slower Learners:', bold: true })] }));
    out.push(this.docxBody(ln.differentiation.slowerLearners));
    out.push(new Paragraph({ children: [new TextRun({ text: 'Faster Learners:', bold: true })] }));
    out.push(this.docxBody(ln.differentiation.fasterLearners));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('FORMATIVE ASSESSMENT'));
    ln.formativeAssessment.forEach((fa, i) => {
      out.push(this.docxBody(`Q${i + 1}: ${fa.question}`));
      out.push(new Paragraph({ children: [new TextRun({ text: `Expected: ${fa.expectedAnswer}`, italics: true })] }));
      out.push(this.docxSpacer());
    });

    out.push(this.docxHeading('CONCLUSION'));
    out.push(this.docxBody(ln.conclusion));
    out.push(this.docxSpacer());

    out.push(this.docxHeading('ASSIGNMENT'));
    ln.assignment.forEach((a, i) => out.push(this.docxBody(`${i + 1}. ${a}`)));

    return out;
  }

  // ─── DOCX Helpers ────────────────────────────────────────────────────────

  private docxHeader(note: NoteRecord): Paragraph[] {
    return [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: note.name ?? note.topic, bold: true, size: 32 })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: `Subject: ${note.subjectName}  |  Class: ${note.classLevel}  |  Term ${note.term ?? ''}  Week ${note.week ?? ''}` }),
        ],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: `State: ${note.state ?? ''}  |  Session: ${note.session ?? ''}`, color: '666666', size: 20 })],
      }),
      new Paragraph({ children: [new TextRun('')] }),
    ];
  }

  private docxHeading(text: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text, bold: true, size: 24, color: '1a1a1a' })],
    });
  }

  private docxSubHeading(text: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text, bold: true, size: 22 })],
    });
  }

  private docxBody(text: string): Paragraph {
    return new Paragraph({ children: [new TextRun({ text, size: 22 })] });
  }

  private docxBullet(text: string): Paragraph {
    return new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text, size: 22 })] });
  }

  private docxMeta(text: string): Paragraph {
    return new Paragraph({ children: [new TextRun({ text, color: '666666', italics: true, size: 20 })] });
  }

  private docxSpacer(): Paragraph {
    return new Paragraph({ children: [new TextRun('')] });
  }

  private docxDevelopmentTable(
    steps: LessonPlan['development'],
  ): Table {
    const headerRow = new TableRow({
      children: [
        this.tableCell('Step', true),
        this.tableCell('Teacher Activity', true),
        this.tableCell('Student Activity', true),
        this.tableCell('Duration', true),
      ],
    });

    const bodyRows = steps.map(
      (step) =>
        new TableRow({
          children: [
            this.tableCell(`${step.step}`),
            this.tableCell(step.teacherActivity),
            this.tableCell(step.studentActivity),
            this.tableCell(step.duration ?? ''),
          ],
        }),
    );

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [headerRow, ...bodyRows],
    });
  }

  private tableCell(text: string, header = false): TableCell {
    return new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold: header, size: 20 })] })],
    });
  }

  // ─── DB Helpers ──────────────────────────────────────────────────────────

  private async getNote(userId: string, noteId: string) {
    const note = await this.prisma.lessonNote.findUnique({ where: { noteId } });
    if (!note) throw new NotFoundException('Note not found');
    if (note.userId !== userId) throw new ForbiddenException();
    return note;
  }

  private async markExported(noteId: string) {
    await this.prisma.lessonNote.update({
      where: { noteId },
      data: { isExported: true, exportCount: { increment: 1 } },
    });
  }

  private buildFilename(topic: string, ext: string) {
    const safe = topic.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${safe}_${date}.${ext}`;
  }
}
