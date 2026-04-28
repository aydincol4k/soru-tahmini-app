import fs from "node:fs/promises";
import path from "node:path";

export interface PageImage {
  page: number;
  imagePath: string;
}

// pdf-to-img saf ESM; CommonJS main process'ten require() yerine native dinamik
// import gerekiyor. Function constructor TS'in import()'u require'a çevirmesini engeller.
const nativeImport = new Function("s", "return import(s)") as (s: string) => Promise<any>;

/**
 * Bir PDF'i sayfa sayfa PNG'ye çevirir.
 * `pdf-to-img` pure-JS olduğu için Mac ve Windows'ta ek sistem bağımlılığı (Poppler) gerektirmez.
 */
export async function pdfToImages(pdfPath: string, outDir: string): Promise<PageImage[]> {
  await fs.mkdir(outDir, { recursive: true });
  const mod: any = await nativeImport("pdf-to-img");
  const pdf = await mod.pdf(pdfPath, { scale: 2 });
  const pages: PageImage[] = [];
  let i = 0;
  for await (const imageBuf of pdf) {
    i++;
    const name = `page-${String(i).padStart(3, "0")}.png`;
    const fp = path.join(outDir, name);
    await fs.writeFile(fp, imageBuf);
    pages.push({ page: i, imagePath: fp });
  }
  return pages;
}

export function chunkPages<T>(pages: T[], size: number): T[][] {
  if (size <= 0) return [pages];
  const out: T[][] = [];
  for (let i = 0; i < pages.length; i += size) {
    out.push(pages.slice(i, i + size));
  }
  return out;
}
