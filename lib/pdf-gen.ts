// Markdown -> PDF, server side. Backs the generate_pdf chat tool.
//
// Deliberately small: one pass over the lines, recognising the block shapes a
// chat answer actually produces — headings, paragraphs, bullet and numbered
// lists, fenced code, rules, quotes — with **bold**/*italic* inline. Anything
// it does not recognise is written as plain text, so an odd document comes out
// plain instead of failing. Standard PDF fonts only (Helvetica + Courier), so
// there is no font asset to ship with the server.

import PDFDocument from 'pdfkit';

const MARGIN = 56;
const WIDTH = 595.28 - MARGIN * 2; // A4 minus the margins
const BODY = 11;

const FONT = {
  body: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
  boldItalic: 'Helvetica-BoldOblique',
  mono: 'Courier',
};
const TEXT = '#111111';
const MUTED = '#555555';
const RULE = '#cccccc';
const CODE_BG = '#f2f2f0';

type Doc = PDFKit.PDFDocument;
type Run = { text: string; bold: boolean; italic: boolean };

/** Split a line into bold/italic runs. Unmatched markers stay as typed. */
function runsOf(text: string): Run[] {
  const runs: Run[] = [];
  for (const part of text.split(/(\*\*[\s\S]+?\*\*|\*[\s\S]+?\*)/g)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      runs.push({ text: part.slice(2, -2), bold: true, italic: false });
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      runs.push({ text: part.slice(1, -1), bold: false, italic: true });
    } else {
      runs.push({ text: part, bold: false, italic: false });
    }
  }
  return runs.length > 0 ? runs : [{ text: '', bold: false, italic: false }];
}

function fontOf(run: Run, italicBase: boolean): string {
  const italic = run.italic || italicBase;
  if (run.bold && italic) return FONT.boldItalic;
  if (run.bold) return FONT.bold;
  if (italic) return FONT.italic;
  return FONT.body;
}

const pageBottom = (doc: Doc) => doc.page.height - doc.page.margins.bottom;

/** Start a new page rather than begin a block in the last few lines of one. */
function room(doc: Doc, height: number) {
  if (doc.y + height > pageBottom(doc)) doc.addPage();
}

/** One wrapped block of inline text, laid out from the current y. */
function write(doc: Doc, text: string, o: {
  size: number;
  x: number;
  width: number;
  color?: string;
  /** Whole block in bold, whatever the inline markers say (headings). */
  bold?: boolean;
  italic?: boolean;
  gap?: number;
}) {
  const runs = runsOf(text);
  doc.fontSize(o.size).fillColor(o.color ?? TEXT);
  runs.forEach((run, i) => {
    doc.font(o.bold ? FONT.bold : fontOf(run, !!o.italic));
    const opts = { width: o.width, continued: i < runs.length - 1 };
    if (i === 0) doc.text(run.text, o.x, doc.y, opts);
    else doc.text(run.text, opts);
  });
  doc.x = MARGIN;
  if (o.gap) doc.y += o.gap;
}

function heading(doc: Doc, level: number, text: string) {
  const size = level === 1 ? 18 : level === 2 ? 14.5 : 12.5;
  room(doc, size * 3);
  doc.y += level === 1 ? 12 : 9;
  write(doc, text, { size, x: MARGIN, width: WIDTH, bold: true, gap: 5 });
}

function paragraph(doc: Doc, text: string) {
  write(doc, text, { size: BODY, x: MARGIN, width: WIDTH, gap: 8 });
}

/** Marker in the left gutter, body text hanging beside it. */
function listItem(doc: Doc, marker: string, text: string) {
  room(doc, BODY * 2.5);
  const top = doc.y;
  doc.font(FONT.body).fontSize(BODY).fillColor(MUTED).text(marker, MARGIN + 6, top, { width: 20 });
  doc.y = top;
  write(doc, text, { size: BODY, x: MARGIN + 30, width: WIDTH - 30, gap: 3 });
}

function quote(doc: Doc, text: string) {
  room(doc, BODY * 3);
  const top = doc.y;
  write(doc, text, { size: BODY, x: MARGIN + 16, width: WIDTH - 16, color: MUTED, italic: true, gap: 8 });
  doc.rect(MARGIN, top, 2.5, Math.max(doc.y - 8 - top, 0)).fill(RULE);
  doc.fillColor(TEXT);
}

/** Monospace on a shaded slab. Sized up front so the slab fits the text. */
function codeBlock(doc: Doc, source: string) {
  doc.font(FONT.mono).fontSize(9.5);
  const height = doc.heightOfString(source, { width: WIDTH - 20 });
  room(doc, height + 16);
  const top = doc.y;
  doc.rect(MARGIN, top, WIDTH, height + 16).fill(CODE_BG);
  doc.fillColor(TEXT).font(FONT.mono).fontSize(9.5).text(source, MARGIN + 10, top + 8, { width: WIDTH - 20 });
  doc.x = MARGIN;
  doc.y = top + height + 26;
}

function rule(doc: Doc) {
  room(doc, 18);
  doc.moveTo(MARGIN, doc.y + 4).lineTo(MARGIN + WIDTH, doc.y + 4).lineWidth(0.75).strokeColor(RULE).stroke();
  doc.x = MARGIN;
  doc.y += 16;
}

function renderBody(doc: Doc, markdown: string) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  // Consecutive lines of the same kind are one block: a paragraph reflows, a
  // quote keeps its bar unbroken.
  let para: string[] = [];
  let quoted: string[] = [];
  let code: string[] | null = null;

  const flushPara = () => { if (para.length > 0) { paragraph(doc, para.join(' ')); para = []; } };
  const flushQuote = () => { if (quoted.length > 0) { quote(doc, quoted.join(' ')); quoted = []; } };
  const flush = () => { flushPara(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (/^\s*```/.test(line)) {
      if (code) { codeBlock(doc, code.join('\n')); code = null; } else { flush(); code = []; }
      continue;
    }
    if (code) { code.push(raw); continue; }

    if (!line.trim()) { flush(); continue; }

    const head = /^ {0,3}(#{1,3})\s+(.*)$/.exec(line);
    if (head) { flush(); heading(doc, head[1].length, head[2].replace(/\s+#+\s*$/, '')); continue; }

    // before the bullet check: `---` is a rule, `- x` is an item
    if (/^ {0,3}([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) { flush(); rule(doc); continue; }

    if (/^\s*>\s?/.test(line)) { flushPara(); quoted.push(line.replace(/^\s*>\s?/, '')); continue; }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) { flush(); listItem(doc, '•', bullet[1]); continue; }

    const numbered = /^\s*(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (numbered) { flush(); listItem(doc, `${numbered[1]}.`, numbered[2]); continue; }

    flushQuote();
    para.push(line.trim());
  }

  if (code) codeBlock(doc, code.join('\n'));
  flush();
}

/** A safe download name derived from the document title. */
export function pdfFileName(title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'document'}.pdf`;
}

/** Render a markdown document to PDF bytes. Never touches disk. */
export function renderMarkdownPdf(title: string, markdown: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: title || 'Document' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      if (title) {
        write(doc, title, { size: 22, x: MARGIN, width: WIDTH, bold: true, gap: 4 });
        rule(doc);
      }
      renderBody(doc, markdown);
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
