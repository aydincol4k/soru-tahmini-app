import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

export interface FontSet {
  regular: Buffer;
  bold: Buffer;
  italic: Buffer;
}

function candidateBases(): string[] {
  const bases: string[] = [];
  if (app.isPackaged) {
    bases.push(path.join(process.resourcesPath, "fonts"));
  }
  bases.push(path.join(app.getAppPath(), "node_modules", "pdfjs-dist", "standard_fonts"));
  bases.push(
    path.join(__dirname, "..", "..", "..", "node_modules", "pdfjs-dist", "standard_fonts"),
  );
  return bases;
}

function locate(fileName: string): string {
  for (const base of candidateBases()) {
    const p = path.join(base, fileName);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Font dosyası bulunamadı: ${fileName}`);
}

export function loadTurkishFonts(): FontSet {
  return {
    regular: fs.readFileSync(locate("LiberationSans-Regular.ttf")),
    bold: fs.readFileSync(locate("LiberationSans-Bold.ttf")),
    italic: fs.readFileSync(locate("LiberationSans-Italic.ttf")),
  };
}
