import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { TahminSorular } from "../../shared/schemas";
import { loadTurkishFonts } from "./fonts";

export interface PdfOptions {
  includeAnswerKey: boolean;
}

const FONT_REG = "TR-Regular";
const FONT_BOLD = "TR-Bold";
const FONT_ITALIC = "TR-Italic";

export async function sorularToPdf(
  data: TahminSorular,
  outPath: string,
  opts: PdfOptions,
): Promise<string> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  const fonts = loadTurkishFonts();
  const doc = new PDFDocument({
    size: "A4",
    margin: 60,
    info: {
      Title: `Tahmin Soruları — ${data.dersAdi}`,
      Author: "Soru Tahmini",
      CreationDate: new Date(),
    },
  });

  doc.registerFont(FONT_REG, fonts.regular);
  doc.registerFont(FONT_BOLD, fonts.bold);
  doc.registerFont(FONT_ITALIC, fonts.italic);
  doc.font(FONT_REG);

  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.font(FONT_BOLD).fontSize(22).text("Tahmin Soruları", { align: "center" });
  doc.moveDown(0.2);
  doc.font(FONT_REG).fontSize(14).text(data.dersAdi, { align: "center" });
  doc.fontSize(10).fillColor("#666").text(`Üretim tarihi: ${data.uretimTarihi}`, {
    align: "center",
  });
  doc.fillColor("#000");
  doc.moveDown(1.5);

  for (const s of data.sorular) {
    if (doc.y > 680) doc.addPage();
    doc.font(FONT_BOLD).fontSize(13).fillColor("#000").text(`Soru ${s.no}`, { continued: true });
    doc.font(FONT_ITALIC).fontSize(10).fillColor("#666").text(`   [${s.zorluk}]`);
    doc.fillColor("#000");
    doc.moveDown(0.3);
    doc.font(FONT_REG).fontSize(11).text(s.soru, { align: "justify" });
    doc.moveDown(0.3);
    doc.font(FONT_ITALIC).fontSize(9).fillColor("#555");
    doc.text(`Kaynak konu: ${s.kaynakKonu}`);
    doc.text(`Gerekçe: ${s.tahminGerekcesi}`);
    doc.fillColor("#000");
    doc.moveDown(0.8);
  }

  if (opts.includeAnswerKey) {
    doc.addPage();
    doc.font(FONT_BOLD).fontSize(20).text("Cevap Anahtarı", { align: "center" });
    doc.moveDown();
    for (const s of data.sorular) {
      if (doc.y > 700) doc.addPage();
      doc.font(FONT_BOLD).fontSize(12).fillColor("#000").text(`Soru ${s.no}`, { underline: true });
      doc.moveDown(0.2);
      doc.font(FONT_REG).fontSize(10).text(s.cevapAnahtari ?? "-", { align: "justify" });
      doc.moveDown(0.6);
    }
  }

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
  return outPath;
}
