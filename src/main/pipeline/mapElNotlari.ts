import fs from "node:fs/promises";
import path from "node:path";
import { runAgent, extractJson, retryWithBackoff } from "./sdkClient";
import { pdfToImages, chunkPages, type PageImage } from "./pdfToImages";
import { loadPrompt } from "./prompts";
import { ElNotuKonuHaritasiSchema, type ElNotuKonuHaritasi } from "../../shared/schemas";
import { slugify } from "../../shared/slug";

interface Args {
  apiKey: string | null;
  files: string[];
  workspaceDir: string;
  chunkSize: number;
  model?: string;
  onProgress?: (msg: string) => void;
}

export async function mapElNotlari(args: Args): Promise<
  Array<{ source: string; json: ElNotuKonuHaritasi; jsonPath: string; mdPath: string }>
> {
  const { apiKey, files, workspaceDir, chunkSize, model, onProgress } = args;
  const system = await loadPrompt("elNotuHarita.system.md");
  const outRoot = path.join(workspaceDir, "outputs", "03-el-notu-konu-haritasi");
  await fs.mkdir(outRoot, { recursive: true });

  const results = await Promise.all(
    files.map(async (pdf) => {
      const base = path.basename(pdf, path.extname(pdf));
      const slug = slugify(base);
      const imgDir = path.join(workspaceDir, "intermediate", "images", "el-notlari", slug);
      onProgress?.(`El notu → görüntü: ${path.basename(pdf)}`);
      const pages = await pdfToImages(pdf, imgDir);
      const chunks = chunkPages(pages, chunkSize);
      const chunkResults: ElNotuKonuHaritasi[] = [];
      for (let ci = 0; ci < chunks.length; ci++) {
        onProgress?.(`El notu haritası: ${base} — chunk ${ci + 1}/${chunks.length}`);
        const text = await retryWithBackoff(() =>
          runAgent({
            apiKey,
            systemPrompt: system,
            userPrompt: buildPrompt(base, chunks[ci]),
            images: chunks[ci].map((p) => ({
              imagePath: p.imagePath,
              label: `Sayfa ${p.page}:`,
            })),
            cwd: workspaceDir,
            model,
            maxTurns: 3,
          }),
        );
        try {
          chunkResults.push(ElNotuKonuHaritasiSchema.parse(extractJson(text)));
        } catch (err) {
          onProgress?.(`El notu chunk parse başarısız: ${(err as Error).message}`);
        }
      }
      const merged = mergeElNotu(base, chunkResults);
      const jsonPath = path.join(outRoot, `${slug}.json`);
      const mdPath = path.join(outRoot, `${slug}.md`);
      await fs.writeFile(jsonPath, JSON.stringify(merged, null, 2), "utf8");
      await fs.writeFile(mdPath, renderMd(merged), "utf8");
      return { source: base, json: merged, jsonPath, mdPath };
    }),
  );

  return results;
}

function buildPrompt(base: string, pages: PageImage[]): string {
  return `El notu dosyası: ${base}
Bu mesaja ${pages.length} sayfa görüntüsü inline gömülü. Vurguları (altı çizili, kutu, yıldız, "çıkar" ibaresi vs.) tespit et ve sistem talimatındaki şemaya uyan JSON döndür.`;
}

function mergeElNotu(base: string, chunks: ElNotuKonuHaritasi[]): ElNotuKonuHaritasi {
  if (chunks.length === 0) return { source: base, emphasized: [], topics: [] };
  const emphasized = chunks.flatMap((c) => c.emphasized);
  const topicMap = new Map<string, ElNotuKonuHaritasi["topics"][number]>();
  for (const c of chunks) {
    for (const t of c.topics) {
      const ex = topicMap.get(t.topic);
      if (!ex) topicMap.set(t.topic, { ...t });
      else {
        ex.emphasisScore = Math.max(ex.emphasisScore, t.emphasisScore);
        if (t.notes) ex.notes = (ex.notes ? ex.notes + " | " : "") + t.notes;
      }
    }
  }
  return {
    source: base,
    emphasized: emphasized.sort((a, b) => a.page - b.page),
    topics: Array.from(topicMap.values()),
  };
}

function renderMd(m: ElNotuKonuHaritasi): string {
  const lines: string[] = [];
  lines.push(`# El Notu Konu Haritası — ${m.source}\n`);
  lines.push("## Vurgulanmış Alanlar\n");
  for (const e of m.emphasized) {
    lines.push(
      `- **Sayfa ${e.page}** [${e.emphasisType}] (güven ${e.confidence.toFixed(2)}): ${e.text}`,
    );
  }
  lines.push("\n## Konular\n");
  const sorted = [...m.topics].sort((a, b) => b.emphasisScore - a.emphasisScore);
  for (const t of sorted) {
    lines.push(`- **${t.topic}** (vurgu ${t.emphasisScore.toFixed(2)})${t.notes ? " — " + t.notes : ""}`);
  }
  return lines.join("\n");
}
