import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { convert } from 'html-to-text';
import HTMLtoDOCX = require('html-to-docx');
import PDFDocument = require('pdfkit');
import { PrismaService } from '../prisma/prisma.service';
import { LessonNote } from '../generation/schemas/lesson-note.schema';
import { LessonPlan } from '../generation/schemas/lesson-plan.schema';
import { generateSvg, drawDiagramPdf, diagramPdfHeight } from './diagram.generator';

type NoteRecord = Awaited<ReturnType<ExportService['getNote']>>;

function plain(raw: string | undefined | null): string {
  if (!raw) return '';
  let text = raw;
  if (raw.includes('<')) {
    text = convert(raw, {
      wordwrap: false,
      selectors: [
        { selector: 'ul', format: 'block' },
        { selector: 'ol', format: 'block' },
        { selector: 'li', format: 'block', options: { leadingLineBreaks: 0, trailingLineBreaks: 1 } },
        { selector: 'b', format: 'inline' },
        { selector: 'strong', format: 'inline' },
        { selector: 'i', format: 'inline' },
        { selector: 'em', format: 'inline' },
        { selector: 'u', format: 'inline' },
        { selector: 'img', format: 'skip' },
        { selector: 'a', options: { ignoreHref: true } },
      ],
    }).trim();
  }
  // Strip dialogue double quotes and patch Naira symbol
  return text.replace(/"/g, '').replace(/¦/g, '₦').replace(/&#8358;/g, '₦');
}

function html(raw: string | undefined | null): string {
  if (!raw) return '';
  let text = raw;
  if (!text.includes('<')) {
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // Strip dialogue double quotes and patch Naira symbol
  text = text.replace(/"/g, '').replace(/¦/g, '₦').replace(/&#8358;/g, '₦');

  // Parse diagram placeholders
  text = text.replace(/\[DIAGRAM:\s*([\s\S]*?)\]/gi, (match, p1) => {
    return `<div style="border: 2px dashed #000; padding: 20px; text-align: center; margin: 15px 0; font-family: 'Times New Roman', Times, serif; font-size: 12pt;"><strong>[DIAGRAM Placeholder: ${p1.trim()}]</strong></div>`;
  });

  return text;
}

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async exportPdf(userId: string, noteId: string): Promise<{ buffer: Buffer; filename: string }> {
    const note = await this.getNote(userId, noteId);

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      if (note.lessonNoteContent) {
        this.renderNotePdf(doc, note.lessonNoteContent as unknown as LessonNote, note);
      } else if (note.lessonPlanContent) {
        this.renderPlanPdf(doc, note.lessonPlanContent as unknown as LessonPlan, note);
      } else {
        doc.text('No content available.');
      }

      const range = doc.bufferedPageRange();
      const pageCount = range.count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(range.start + i);
        doc.page.margins.bottom = 0;
        doc.fontSize(10).font('Times-Roman').fillColor('#000000')
          .text(`Page ${i + 1} of ${pageCount}`, 0, doc.page.height - 40, {
            align: 'center',
            width: doc.page.width,
            lineBreak: false,
          });
        doc.page.margins.bottom = 50;
      }

      doc.end();
    });

    await this.markExported(noteId);
    return { buffer, filename: this.buildFilename(note.topic, 'pdf') };
  }

  async exportDocx(userId: string, noteId: string): Promise<{ buffer: Buffer; filename: string }> {
    const note = await this.getNote(userId, noteId);

    const htmlContent = note.lessonNoteContent
      ? this.buildNoteHtml(note.lessonNoteContent as unknown as LessonNote, note)
      : note.lessonPlanContent
        ? this.buildPlanHtml(note.lessonPlanContent as unknown as LessonPlan, note)
        : '<p>No content available.</p>';

    const buffer = await HTMLtoDOCX(htmlContent, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
      margins: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
      font: 'Times New Roman',
      fontSize: 24, // 12pt
    }) as Buffer;

    await this.markExported(noteId);
    return { buffer, filename: this.buildFilename(note.topic, 'docx') };
  }

  // HTML BUILDERS...
  private buildPlanHtml(plan: LessonPlan, note: NoteRecord): string {
    const meta = plan.metadata;
    return `
      ${this.htmlDocHeader(note)}

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-family:'Times New Roman',Times,serif;font-size:12pt;">
        <tr><td style="${this.metaLabelStyle()}">Subject</td><td style="${this.metaValueStyle()}">${html(meta.subject)}</td>
            <td style="${this.metaLabelStyle()}">Class</td><td style="${this.metaValueStyle()}">${html(meta.classLevel)}</td></tr>
        <tr><td style="${this.metaLabelStyle()}">Term</td><td style="${this.metaValueStyle()}">${meta.term}</td>
            <td style="${this.metaLabelStyle()}">Week</td><td style="${this.metaValueStyle()}">${meta.week}</td></tr>
        <tr><td style="${this.metaLabelStyle()}">Duration</td><td style="${this.metaValueStyle()}">${meta.duration} minutes</td>
            <td style="${this.metaLabelStyle()}">Session</td><td style="${this.metaValueStyle()}">${html(meta.session ?? '')}</td></tr>
        <tr><td style="${this.metaLabelStyle()}">State</td><td style="${this.metaValueStyle()}" colspan="3">${html(meta.state)}</td></tr>
      </table>

      ${this.htmlSection('OBJECTIVES')}
      <p><strong>Cognitive:</strong></p>
      <ul>${plan.objectives.cognitive.map((o) => `<li>${html(o)}</li>`).join('')}</ul>
      <p><strong>Affective:</strong></p>
      <ul>${plan.objectives.affective.map((o) => `<li>${html(o)}</li>`).join('')}</ul>
      <p><strong>Psychomotor:</strong></p>
      <ul>${plan.objectives.psychomotor.map((o) => `<li>${html(o)}</li>`).join('')}</ul>

      ${this.htmlSection('ENTRY BEHAVIOUR')}
      <p>${html(plan.entryBehaviour)}</p>

      ${this.htmlSection('PREVIOUS KNOWLEDGE')}
      <p>${html(plan.previousKnowledge)}</p>

      ${this.htmlSection('INSTRUCTIONAL MATERIALS')}
      <ul>${plan.instructionalMaterials.map((m) => `<li>${html(m)}</li>`).join('')}</ul>

      ${this.htmlSection('REFERENCE BOOKS')}
      <ul>${plan.referenceBooks.map((r) => `<li>${html(r)}</li>`).join('')}</ul>

      ${this.htmlSection('PRESENTATION')}
      <table style="width:100%;border-collapse:collapse;font-family:'Times New Roman',Times,serif;font-size:12pt;">
        <thead>
          <tr>
            <th style="${this.thStyle('8%')}">Step</th>
            <th style="${this.thStyle('20%')}">Title</th>
            <th style="${this.thStyle('30%')}">Teacher Activity</th>
            <th style="${this.thStyle('30%')}">Student Activity</th>
            <th style="${this.thStyle('12%')}">Duration</th>
          </tr>
        </thead>
        <tbody>
          ${plan.presentation.map((s) => `
            <tr>
              <td style="${this.tdStyle('center')}">${s.step}</td>
              <td style="${this.tdStyle()}">${html(s.title)}</td>
              <td style="${this.tdStyle()}">${html(s.teacherActivity)}</td>
              <td style="${this.tdStyle()}">${html(s.studentActivity)}</td>
              <td style="${this.tdStyle('center')}">${html(s.duration ?? '')}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      ${this.htmlSection('EVALUATION')}
      <ol>${plan.evaluation.map((q) => `<li>${html(q)}</li>`).join('')}</ol>

      ${this.htmlSection('SUMMARY')}
      <p>${html(plan.summary)}</p>

      ${this.htmlSection('ASSIGNMENT')}
      <p>${html(plan.assignment)}</p>
    `;
  }

  private buildNoteHtml(ln: LessonNote, note: NoteRecord): string {
    const meta = ln.header;
    return `
      ${this.htmlDocHeader(note)}

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-family:'Times New Roman',Times,serif;font-size:12pt;">
        <tr><td style="${this.metaLabelStyle()}">Subject</td><td style="${this.metaValueStyle()}">${html(meta.subject)}</td>
            <td style="${this.metaLabelStyle()}">Class</td><td style="${this.metaValueStyle()}">${html(meta.classLevel)}</td></tr>
        <tr><td style="${this.metaLabelStyle()}">Term</td><td style="${this.metaValueStyle()}">${meta.term}</td>
            <td style="${this.metaLabelStyle()}">Week</td><td style="${this.metaValueStyle()}">${meta.week}</td></tr>
        <tr><td style="${this.metaLabelStyle()}">Duration</td><td style="${this.metaValueStyle()}">${meta.duration}</td>
            <td style="${this.metaLabelStyle()}">Session</td><td style="${this.metaValueStyle()}">${html(meta.session ?? '')}</td></tr>
        <tr><td style="${this.metaLabelStyle()}">State</td><td style="${this.metaValueStyle()}" colspan="3">${html(meta.state)}</td></tr>
      </table>

      ${this.htmlSection('OBJECTIVES')}
      <p><strong>Cognitive:</strong></p>
      <ul>${ln.objectives.cognitive.map((o) => `<li>${html(o)}</li>`).join('')}</ul>
      <p><strong>Affective:</strong></p>
      <ul>${ln.objectives.affective.map((o) => `<li>${html(o)}</li>`).join('')}</ul>
      <p><strong>Psychomotor:</strong></p>
      <ul>${ln.objectives.psychomotor.map((o) => `<li>${html(o)}</li>`).join('')}</ul>

      ${this.htmlSection('ENTRY BEHAVIOUR')}
      <p>${html(ln.entryBehaviour)}</p>

      ${this.htmlSection('PREVIOUS KNOWLEDGE')}
      <p>${html(ln.previousKnowledge)}</p>

      ${this.htmlSection('INSTRUCTIONAL MATERIALS')}
      <ul>${ln.instructionalMaterials.map((m) => `<li>${html(m)}</li>`).join('')}</ul>

      ${this.htmlSection('REFERENCE BOOKS')}
      <ul>${ln.referenceBooks.map((r) => `<li>${html(r)}</li>`).join('')}</ul>

      ${this.htmlSection('PRESENTATION')}
      ${ln.presentation.map((s) => `
        <div style="border: 1px solid #000; padding: 10px; margin-bottom: 12px; font-family:'Times New Roman',Times,serif;font-size:12pt;">
          <h3 style="margin-top:0;"><strong>Step ${s.step}: ${html(s.title)} (${html(s.duration ?? '')})</strong></h3>
          <p><em>Teacher Activity:</em><br/>${html(s.teacherActivity)}</p>
          <p><em>Student Activity:</em><br/>${html(s.studentActivity)}</p>
          <p><em>Content:</em><br/>${html(s.content).replace(/\\n/g, '<br/>')}</p>
        </div>
      `).join('')}

      ${this.htmlSection('SUBJECT CONTENT')}
      ${ln.subjectContent.map((sc, idx) => `
        <h3 style="margin-top:12px;font-family:'Times New Roman',Times,serif;font-size:14pt;">${idx + 1}. ${html(sc.subTopic)}</h3>
        <p style="font-family:'Times New Roman',Times,serif;font-size:12pt;">${html(sc.explanation).replace(/\\n/g, '<br/>')}</p>
        ${sc.workedExamples.length ? `
          <div style="background-color: #f0f0f0; padding: 10px; margin-bottom: 10px; font-family:'Times New Roman',Times,serif;font-size:12pt;">
            <p><strong>Worked Examples:</strong></p>
            ${sc.workedExamples.map((ex, ei) => `
              <div style="margin-bottom: 8px;">
                <p><strong>Example ${ei + 1}:</strong> ${html(ex.problem)}</p>
                <p><em>Solution:</em><br/>${html(ex.solution).replace(/\\n/g, '<br/>')}</p>
              </div>
            `).join('')}
          </div>` : ''}
        ${sc.keyPoints.length ? `
          <p style="font-family:'Times New Roman',Times,serif;font-size:12pt;"><strong>Key Points:</strong></p>
          <ul style="font-family:'Times New Roman',Times,serif;font-size:12pt;">${sc.keyPoints.map((kp) => `<li>${html(kp)}</li>`).join('')}</ul>` : ''}
        ${sc.diagram ? (() => {
          const svg = generateSvg(sc.diagram);
          const b64 = Buffer.from(svg).toString('base64');
          return `<div style="text-align:center;margin:14px 0;">
            <img src="data:image/svg+xml;base64,${b64}" style="max-width:500px;display:block;margin:0 auto;" alt="${html(sc.diagram.title ?? sc.diagram.type)}"/>
            ${sc.diagram.title ? `<p style="font-family:'Times New Roman',Times,serif;font-size:10pt;font-style:italic;margin:4px 0;">${html(sc.diagram.title)}</p>` : ''}
          </div>`;
        })() : ''}
      `).join('')}

      ${ln.commonMisconceptions && ln.commonMisconceptions.length > 0 ? `
      ${this.htmlSection('COMMON MISCONCEPTIONS')}
      <div style="border-left: 4px solid #555; padding-left: 10px; margin-bottom: 12px; font-family:'Times New Roman',Times,serif;font-size:12pt;">
        ${ln.commonMisconceptions.map((mc, i) => `
          <div style="margin-bottom: 8px;">
            <p style="margin: 0;"><strong>Misconception ${i + 1}: ${html(mc.description)}</strong></p>
            <p style="margin: 0;">This typically occurs because ${html(mc.reason)}</p>
            <p style="margin: 0;"><em>${html(mc.correction)}</em></p>
          </div>
        `).join('')}
      </div>` : ''}

      ${ln.differentiation ? `
      ${this.htmlSection('DIFFERENTIATION')}
      <div style="font-family:'Times New Roman',Times,serif;font-size:12pt;margin-bottom:12px;">
        <p><em>For students who need support:</em><br/>${html(ln.differentiation.support)}</p>
        <p><em>For advanced students:</em><br/>${html(ln.differentiation.extension)}</p>
      </div>` : ''}

      ${this.htmlSection('BOARD SUMMARY')}
      <div style="border: 2px solid #000; padding: 10px; margin-bottom: 12px; font-family:'Times New Roman',Times,serif;font-size:12pt;">
        <ul style="margin:0;">${ln.boardSummary.map((bs) => `<li>${html(bs)}</li>`).join('')}</ul>
      </div>

      ${this.htmlSection('EVALUATION')}
      ${ln.evaluation.map((ev, i) => {
        let questionText = html(ev.question);
        let tag = '';
        const match = questionText.match(/^(\[[a-zA-Z]+\])/);
        if (match) {
          tag = match[1] + ' ';
          questionText = questionText.replace(match[1], '').trim();
        }
        return `
        <div style="margin-bottom: 12px; font-family:'Times New Roman',Times,serif;font-size:12pt;">
          <p style="margin-bottom:4px;"><strong>Q${i + 1} ${tag}</strong></p>
          <p style="margin-top:0; margin-bottom:4px; padding-left:24px;">${questionText}</p>
          <p style="margin-top:0; margin-bottom:4px; padding-left:24px;"><em>Answer:</em></p>
          <p style="margin-top:0; margin-bottom:8px; padding-left:24px;">${html(ev.expectedAnswer)}</p>
          <hr style="border: 0; border-bottom: 1px solid #ccc;" />
        </div>`;
      }).join('')}

      ${this.htmlSection('SUMMARY')}
      <p style="font-family:'Times New Roman',Times,serif;font-size:12pt;">${html(ln.summary)}</p>

      ${this.htmlSection('ASSIGNMENT')}
      <ol style="font-family:'Times New Roman',Times,serif;font-size:12pt;">${ln.assignment.map((a) => `<li>${html(a)}</li>`).join('')}</ol>
    `;
  }

  private htmlDocHeader(note: NoteRecord): string {
    return `
      <h1 style="text-align:center;font-family:'Times New Roman',Times,serif;font-size:18pt;border-bottom:1px solid #000;padding-bottom:8px;">
        ${html(note.name ?? note.topic)}
      </h1>
      <p style="text-align:center;color:#555;margin-top:4px;font-family:'Times New Roman',Times,serif;font-size:12pt;">
        ${html(note.subjectName)} &bull; ${html(note.classLevel)} &bull; Term ${note.term ?? ''} Week ${note.week ?? ''} &bull; ${html(note.state ?? '')}
      </p>
    `;
  }

  private htmlSection(title: string): string {
    return `<h2 style="border-bottom: 1px solid #000; padding-bottom: 4px; margin-top:20px; margin-bottom:8px; font-size:14pt; font-family:'Times New Roman',Times,serif; text-transform: uppercase;">${title}</h2>`;
  }

  private metaLabelStyle = () =>
    'font-weight:bold;padding:5px 8px;border:1px solid #000;';
  private metaValueStyle = () =>
    'padding:5px 8px;border:1px solid #000;';
  private thStyle = (width = 'auto') =>
    `font-weight:bold;padding:6px 8px;border:1px solid #000;text-align:left;width:${width};`;
  private tdStyle = (align = 'left') =>
    `padding:5px 8px;border:1px solid #000;vertical-align:top;text-align:${align};`;

  // PDF BUILDERS...
  private readonly LEFT = 50;
  private readonly WIDTH = 495;

  private renderPlanPdf(doc: PDFKit.PDFDocument, plan: LessonPlan, note: NoteRecord) {
    this.pdfCoverHeader(doc, note);
    this.pdfMetaTable(doc, plan.metadata, note);

    this.pdfSection(doc, 'OBJECTIVES');
    doc.fontSize(12).font('Times-Bold').text('Cognitive:', this.LEFT + 10, doc.y);
    plan.objectives.cognitive.forEach((o) => this.pdfText(doc, `•  ${plain(o)}`, 20));
    doc.fontSize(12).font('Times-Bold').text('Affective:', this.LEFT + 10, doc.y);
    plan.objectives.affective.forEach((o) => this.pdfText(doc, `•  ${plain(o)}`, 20));
    doc.fontSize(12).font('Times-Bold').text('Psychomotor:', this.LEFT + 10, doc.y);
    plan.objectives.psychomotor.forEach((o) => this.pdfText(doc, `•  ${plain(o)}`, 20));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'ENTRY BEHAVIOUR');
    this.pdfText(doc, plain(plan.entryBehaviour));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'PREVIOUS KNOWLEDGE');
    this.pdfText(doc, plain(plan.previousKnowledge));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'INSTRUCTIONAL MATERIALS');
    plan.instructionalMaterials.forEach((m) => this.pdfText(doc, `•  ${plain(m)}`));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'REFERENCE BOOKS');
    plan.referenceBooks.forEach((r) => this.pdfText(doc, `•  ${plain(r)}`));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'PRESENTATION');
    this.pdfPresentationTablePlan(doc, plan.presentation);
    doc.moveDown(0.5);

    this.pdfSection(doc, 'EVALUATION');
    plan.evaluation.forEach((q, i) => this.pdfText(doc, `${i + 1}.  ${plain(q)}`));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'SUMMARY');
    this.pdfText(doc, plain(plan.summary));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'ASSIGNMENT');
    this.pdfText(doc, plain(plan.assignment));
  }

  private renderNotePdf(doc: PDFKit.PDFDocument, ln: LessonNote, note: NoteRecord) {
    this.pdfCoverHeader(doc, note);
    this.pdfMetaTable(doc, ln.header, note);

    this.pdfSection(doc, 'OBJECTIVES');
    doc.fontSize(12).font('Times-Bold').text('Cognitive:', this.LEFT + 10, doc.y);
    ln.objectives.cognitive.forEach((o) => this.pdfText(doc, `•  ${plain(o)}`, 20));
    doc.fontSize(12).font('Times-Bold').text('Affective:', this.LEFT + 10, doc.y);
    ln.objectives.affective.forEach((o) => this.pdfText(doc, `•  ${plain(o)}`, 20));
    doc.fontSize(12).font('Times-Bold').text('Psychomotor:', this.LEFT + 10, doc.y);
    ln.objectives.psychomotor.forEach((o) => this.pdfText(doc, `•  ${plain(o)}`, 20));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'ENTRY BEHAVIOUR');
    this.pdfText(doc, plain(ln.entryBehaviour));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'PREVIOUS KNOWLEDGE');
    this.pdfText(doc, plain(ln.previousKnowledge));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'INSTRUCTIONAL MATERIALS');
    ln.instructionalMaterials.forEach((m) => this.pdfText(doc, `•  ${plain(m)}`));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'REFERENCE BOOKS');
    ln.referenceBooks.forEach((r) => this.pdfText(doc, `•  ${plain(r)}`));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'PRESENTATION');
    ln.presentation.forEach((s) => {
      doc.moveDown(0.5);
      
      const stepHeader = `Step ${s.step}: ${plain(s.title)} (${plain(s.duration ?? '')})`;
      const teacherActivityText = plain(s.teacherActivity);
      const studentActivityText = plain(s.studentActivity);
      const contentText = plain(s.content);
      
      const pad = 8;
      let h = pad * 2;
      doc.fontSize(12).font('Times-Bold');
      h += doc.heightOfString(stepHeader, { width: this.WIDTH - pad*2 });
      doc.font('Times-Roman');
      h += 6 + doc.heightOfString(`Teacher Activity: ${teacherActivityText}`, { width: this.WIDTH - pad*2 });
      h += 6 + doc.heightOfString(`Student Activity: ${studentActivityText}`, { width: this.WIDTH - pad*2 });
      h += 6 + doc.heightOfString(`Content: ${contentText}`, { width: this.WIDTH - pad*2 });
      
      if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
      
      const startY = doc.y;
      doc.rect(this.LEFT, startY, this.WIDTH, h).strokeColor('#000000').lineWidth(1).stroke();
      
      doc.y += pad;
      doc.fontSize(12).font('Times-Bold').text(stepHeader, this.LEFT + pad, doc.y);
      
      doc.y += 6;
      doc.font('Times-Italic').text('Teacher Activity:', this.LEFT + pad, doc.y, { continued: true, width: this.WIDTH - pad*2 });
      doc.font('Times-Roman').text(` ${teacherActivityText || ' '}`);
      
      doc.y += 6;
      doc.font('Times-Italic').text('Student Activity:', this.LEFT + pad, doc.y, { continued: true, width: this.WIDTH - pad*2 });
      doc.font('Times-Roman').text(` ${studentActivityText || ' '}`);
      
      doc.y += 6;
      doc.font('Times-Italic').text('Content:', this.LEFT + pad, doc.y, { continued: true, width: this.WIDTH - pad*2 });
      doc.font('Times-Roman').text(` ${contentText || ' '}`);
      
      doc.y += pad + 10;
    });

    this.pdfSection(doc, 'SUBJECT CONTENT');
    ln.subjectContent.forEach((sc, idx) => {
      doc.fontSize(14).font('Times-Bold').text(`${idx + 1}.  ${plain(sc.subTopic)}`, this.LEFT + 10, doc.y);
      this.pdfText(doc, plain(sc.explanation));

      if (sc.workedExamples.length) {
        doc.moveDown(0.3);
        sc.workedExamples.forEach((ex, ei) => {
          const problemText = `Example ${ei + 1}: ${plain(ex.problem)}`;
          const solutionText = `Solution:\n${plain(ex.solution)}`;
          
          const pad = 10;
          let h = pad * 2;
          doc.fontSize(12).font('Times-Bold');
          h += doc.heightOfString(problemText, { width: this.WIDTH - 20 - pad*2 });
          doc.font('Times-Italic');
          h += 5 + doc.heightOfString(solutionText, { width: this.WIDTH - 20 - pad*2 });
          
          if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
          
          const startY = doc.y;
          doc.rect(this.LEFT + 10, startY, this.WIDTH - 20, h).fillAndStroke('#f0f0f0', '#cccccc');
          doc.fillColor('#000000');
          
          doc.y += pad;
          doc.fontSize(12).font('Times-Bold').text(problemText, this.LEFT + 10 + pad, doc.y, { width: this.WIDTH - 20 - pad*2 });
          doc.y += 5;
          doc.font('Times-Italic').text(solutionText, this.LEFT + 10 + pad, doc.y, { width: this.WIDTH - 20 - pad*2 });
          
          doc.y += pad + 10;
        });
      }

      if (sc.keyPoints.length) {
        doc.moveDown(0.3);
        doc.fontSize(12).font('Times-Bold').text('Key Points:', this.LEFT + 10, doc.y);
        sc.keyPoints.forEach((kp) => this.pdfText(doc, `•  ${plain(kp)}`, 24));
      }

      if (sc.diagram) {
        const dh = diagramPdfHeight(sc.diagram);
        if (doc.y + dh > doc.page.height - doc.page.margins.bottom) doc.addPage();
        doc.moveDown(0.3);
        drawDiagramPdf(doc, sc.diagram, this.LEFT + 10, this.WIDTH - 20);
      }

      doc.moveDown(0.5);
    });

    if (ln.commonMisconceptions && ln.commonMisconceptions.length > 0) {
      this.pdfSection(doc, 'COMMON MISCONCEPTIONS');
      ln.commonMisconceptions.forEach((mc, i) => {
        const textStr = `Misconception ${i + 1}: ${plain(mc.description)} This typically occurs because ${plain(mc.reason)} ${plain(mc.correction)}`;
        doc.fontSize(12).font('Times-Bold');
        let h = doc.heightOfString(textStr, { width: this.WIDTH - 15 });
        
        if (doc.y + h > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
        }
        
        const startY = doc.y;
        doc.rect(this.LEFT, startY, 4, h).fill('#555555');
        doc.fillColor('#000000');
        
        doc.fontSize(12).font('Times-Bold').text(`Misconception ${i + 1}: `, this.LEFT + 15, doc.y, { continued: true, width: this.WIDTH - 15 });
        doc.font('Times-Roman').text(`${plain(mc.description)} This typically occurs because ${plain(mc.reason)} ${plain(mc.correction)}` || ' ');
        
        doc.y += 6;
      });
    }

    if (ln.differentiation) {
      this.pdfSection(doc, 'DIFFERENTIATION');
      doc.fontSize(12).font('Times-Italic').text('For students who need support: ', this.LEFT, doc.y, { continued: true, width: this.WIDTH });
      doc.font('Times-Roman').text(plain(ln.differentiation.support) || 'None');
      doc.y += 6;
      doc.font('Times-Italic').text('For advanced students: ', this.LEFT, doc.y, { continued: true, width: this.WIDTH });
      doc.font('Times-Roman').text(plain(ln.differentiation.extension) || 'None');
      doc.y += 6;
    }

    this.pdfSection(doc, 'BOARD SUMMARY');
    const summaryList = ln.boardSummary.map(bs => `•  ${plain(bs)}`).join('\n');
    const pad = 8;
    doc.fontSize(12).font('Times-Roman');
    let sumH = pad * 2 + doc.heightOfString(summaryList, { width: this.WIDTH - pad*2 });
    if (doc.y + sumH > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const sumStartY = doc.y;
    doc.rect(this.LEFT, sumStartY, this.WIDTH, sumH).strokeColor('#000000').lineWidth(2).stroke();
    doc.lineWidth(1);
    doc.y += pad;
    doc.font('Times-Roman').fontSize(12).text(summaryList, this.LEFT + pad, doc.y, { width: this.WIDTH - pad*2 });
    doc.y += pad + 15;

    this.pdfSection(doc, 'EVALUATION');
    ln.evaluation.forEach((ev, i) => {
      // Assuming questions might now have [Recall] tags if the AI follows the spec strictly
      let questionText = plain(ev.question);
      let tag = '';
      const match = questionText.match(/^(\[[a-zA-Z]+\])/);
      if (match) {
        tag = match[1] + ' ';
        questionText = questionText.replace(match[1], '').trim();
      }

      doc.fontSize(12).font('Times-Bold').text(`Q${i + 1} ${tag}`, this.LEFT, doc.y);
      doc.font('Times-Roman').text(questionText, this.LEFT + 25, doc.y - doc.currentLineHeight(), { width: this.WIDTH - 25 });
      
      doc.moveDown(0.3);
      doc.font('Times-Italic').text('Answer:', this.LEFT + 25, doc.y);
      doc.font('Times-Roman').text(plain(ev.expectedAnswer), this.LEFT + 25, doc.y, { width: this.WIDTH - 25 });
      
      doc.moveDown(0.5);
      doc.moveTo(this.LEFT + 25, doc.y).lineTo(this.LEFT + this.WIDTH, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
      doc.moveDown(0.5);
    });
    doc.fillColor('#000000').lineWidth(1);
    doc.moveDown(0.3);

    this.pdfSection(doc, 'SUMMARY');
    this.pdfText(doc, plain(ln.summary));
    doc.moveDown(0.5);

    this.pdfSection(doc, 'ASSIGNMENT');
    ln.assignment.forEach((a, i) => this.pdfText(doc, `${i + 1}.  ${plain(a)}`));
  }

  private pdfCoverHeader(doc: PDFKit.PDFDocument, note: NoteRecord) {
    doc.fontSize(18).font('Times-Bold').fillColor('#000000')
      .text(note.name ?? note.topic, this.LEFT, doc.y, { width: this.WIDTH, align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).font('Times-Roman').fillColor('#555555')
      .text(
        `${note.subjectName}  •  ${note.classLevel}  •  Term ${note.term ?? ''}  Week ${note.week ?? ''}  •  ${note.state ?? ''}`,
        this.LEFT, doc.y, { width: this.WIDTH, align: 'center' },
      );
    doc.fillColor('#000000').moveDown(0.8);
  }

  private pdfMetaTable(doc: PDFKit.PDFDocument, meta: any, note: NoteRecord) {
    const rows = [
      ['Subject', meta.subject ?? note.subjectName, 'Class', meta.classLevel ?? note.classLevel],
      ['Term', `${meta.term ?? note.term ?? ''}`, 'Week', `${meta.week ?? note.week ?? ''}`],
      ['Duration', `${meta.duration ?? ''}`, 'Session', meta.session ?? note.session ?? ''],
    ];

    const colW = [70, 160, 70, 160];
    const rowH = 22;

    rows.forEach((row) => {
      // Snapshot y before drawing so all cells in the row share the same baseline
      const rowY = doc.y;
      let x = this.LEFT;
      row.forEach((cell, ci) => {
        const isLabel = ci % 2 === 0;
        doc.rect(x, rowY, colW[ci], rowH).fill('#ffffff').stroke('#000000');
        doc.fontSize(12).font(isLabel ? 'Times-Bold' : 'Times-Roman').fillColor('#000000')
          .text(cell, x + 4, rowY + 6, { width: colW[ci] - 8, height: rowH - 4, lineBreak: false });
        x += colW[ci];
      });
      // Advance cursor to exactly the bottom of this row
      doc.y = rowY + rowH;
    });
    doc.moveDown(0.6);
  }

  private pdfSection(doc: PDFKit.PDFDocument, title: string) {
    if (doc.y + 30 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    } else {
      doc.y += 10;
    }
    doc.fontSize(14).font('Times-Bold').fillColor('#000000').text(title.toUpperCase(), this.LEFT, doc.y);
    doc.moveTo(this.LEFT, doc.y).lineTo(this.LEFT + this.WIDTH, doc.y).strokeColor('#000000').lineWidth(1).stroke();
    doc.y += 4;
  }

  private pdfText(doc: PDFKit.PDFDocument, text: string, indent = 10) {
    const diagramMatch = text.match(/\[DIAGRAM:\s*([\s\S]*?)\]/i);
    if (diagramMatch) {
      const parts = text.split(diagramMatch[0]);
      if (parts[0].trim()) {
        doc.fontSize(12).font('Times-Roman').fillColor('#000000')
          .text(parts[0].trim(), this.LEFT + indent, doc.y, { width: this.WIDTH - indent - 5 });
        doc.moveDown(0.2);
      }
      
      const diagramText = diagramMatch[1].trim();
      const boxPad = 15;
      const boxWidth = this.WIDTH - indent - 5;
      doc.fontSize(12).font('Times-Italic');
      const textHeight = doc.heightOfString(`[DIAGRAM Placeholder: ${diagramText}]`, { width: boxWidth - boxPad*2 });
      const h = textHeight + boxPad * 2;
      
      if (doc.y + h > doc.page.height - doc.page.margins.bottom) doc.addPage();
      const startY = doc.y;
      
      doc.rect(this.LEFT + indent, startY, boxWidth, h).strokeColor('#000000').dash(5, { space: 5 }).stroke();
      doc.undash();
      doc.fillColor('#000000').text(`[DIAGRAM Placeholder: ${diagramText}]`, this.LEFT + indent + boxPad, startY + boxPad, { width: boxWidth - boxPad*2 });
      
      doc.y += boxPad + 10;

      if (parts[1] && parts[1].trim()) {
        doc.fontSize(12).font('Times-Roman').fillColor('#000000')
          .text(parts[1].trim(), this.LEFT + indent, doc.y, { width: this.WIDTH - indent - 5 });
        doc.moveDown(0.2);
      }
      return;
    }

    doc.fontSize(12).font('Times-Roman').fillColor('#000000')
      .text(text, this.LEFT + indent, doc.y, { width: this.WIDTH - indent - 5 });
    doc.y += 4;
  }

  private pdfPresentationTablePlan(doc: PDFKit.PDFDocument, steps: LessonPlan['presentation']) {
    const cols = [30, 80, 160, 160, 65];
    const headers = ['Step', 'Title', 'Teacher Activity', 'Student Activity', 'Duration'];
    const rowPad = 6;

    let x = this.LEFT;
    headers.forEach((h, i) => {
      doc.rect(x, doc.y, cols[i], 24).fill('#ffffff').stroke('#000000');
      doc.fontSize(12).font('Times-Bold').fillColor('#000000')
        .text(h, x + 3, doc.y - 24 + 6, { width: cols[i] - 6 });
      x += cols[i];
    });
    doc.moveDown(24 / doc.currentLineHeight());

    steps.forEach((step, si) => {
      const cells = [
        `${step.step}`,
        plain(step.title),
        plain(step.teacherActivity),
        plain(step.studentActivity),
        plain(step.duration ?? ''),
      ];

      const heights = cells.map((text, i) =>
        doc.heightOfString(text, { width: cols[i] - 6 }) + rowPad * 2,
      );
      const rowH = Math.max(...heights, 24);

      x = this.LEFT;
      const rowY = doc.y;

      cells.forEach((text, i) => {
        doc.rect(x, rowY, cols[i], rowH).fill('#ffffff').stroke('#000000');
        doc.fontSize(12).font('Times-Roman').fillColor('#000000')
          .text(text, x + 3, rowY + rowPad, { width: cols[i] - 6 });
        x += cols[i];
      });
      doc.moveDown(rowH / doc.currentLineHeight());
    });
  }

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
