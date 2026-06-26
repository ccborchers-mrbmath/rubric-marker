// Server-only: convert markdown-ish text to a Word document buffer.
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

function lineToParagraph(line: string): Paragraph {
  if (line.startsWith("# ")) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: line.slice(2), bold: true })],
    });
  }
  if (line.startsWith("## ")) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: line.slice(3), bold: true })],
    });
  }
  if (line.startsWith("### ")) {
    return new Paragraph({
      heading: HeadingLevel.HEADING_3,
      children: [new TextRun({ text: line.slice(4), bold: true })],
    });
  }
  if (line.startsWith("- ") || line.startsWith("* ")) {
    return new Paragraph({
      bullet: { level: 0 },
      children: parseInline(line.slice(2)),
    });
  }
  if (line.trim() === "") {
    return new Paragraph({ children: [new TextRun("")] });
  }
  return new Paragraph({ children: parseInline(line) });
}

function parseInline(text: string): TextRun[] {
  // Handle **bold** segments
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts
    .filter((p) => p.length > 0)
    .map((p) => {
      if (p.startsWith("**") && p.endsWith("**")) {
        return new TextRun({ text: p.slice(2, -2), bold: true });
      }
      return new TextRun(p);
    });
}

export async function markdownToDocxBuffer(markdown: string): Promise<Buffer> {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const paragraphs = lines.map(lineToParagraph);
  const doc = new Document({
    styles: {
      default: { document: { run: { font: "Calibri", size: 22 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: paragraphs,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
