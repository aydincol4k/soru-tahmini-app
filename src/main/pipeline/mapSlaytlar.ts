import fs from "node:fs/promises";
import path from "node:path";
import { runAgent, extractJson, retryWithBackoff } from "./sdkClient";
import { pdfToImages, chunkPages, type PageImage } from "./pdfToImages";
import { loadPrompt } from "./prompts";
import { SlaytKonuHaritasiSchema, type SlaytKonuHaritasi } from "../../shared/schemas";
import { slugify } from "../../shared/slug";

interface Args {
  apiKey: string | null;
  files: string[];
  workspaceDir: string;
  chunkSize: number;
  model?: string;
  onProgress?: (msg: string) => void;
}

export async function mapSlaytlar(args: Args): Promise<
  Array<{ source: string; json: SlaytKonuHaritasi; jsonPath: string; mdPath: string }>
> {
  const { apiKey, files, workspaceDir, chunkSize, model, onProgress } = args;
  const system = await loadPrompt("slaytHarita.system.md");
  const outRoot = path.join(workspaceDir, "outputs", "02-slayt-konu-haritasi");
  await fs.mkdir(outRoot, { recursive: true });

  const results = await Promise.all(
    files.map(async (pdf) => {
      const base = path.basename(pdf, path.extname(pdf));
      const slug = slugify(base);
      const imgDir = path.join(workspaceDir, "intermediate", "images", "slaytlar", slug);
      onProgress?.(`Slayt → görüntü: ${path.basename(pdf)}`);
      const pages = await pdfToImages(pdf, imgDir);
      const chunks = chunkPages(pages, chunkSize);
      const chunkResults: SlaytKonuHaritasi[] = [];
      for (let ci = 0; ci < chunks.length; ci++) {
        onProgress?.(`Slayt haritası: ${base} — chunk ${ci + 1}/${chunks.length}`);
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
          chunkResults.push(SlaytKonuHaritasiSchema.parse(extractJson(text)));
        } catch (err) {
          onProgress?.(`Slayt chunk parse başarısız: ${(err as Error).message}`);
        }
      }
      const merged = mergeSlayt(base, chunkResults);
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
  return `Slayt dosyası: ${base}
Bu mesaja ${pages.length} sayfa görüntüsü inline gömülü. Tümünü incele ve sistem talimatındaki şemaya uyan JSON döndür.`;
}

function mergeSlayt(base: string, chunks: SlaytKonuHaritasi[]): SlaytKonuHaritasi {
  if (chunks.length === 0) return { source: base, slides: [], topicGraph: [] };
  const slides = chunks.flatMap((c) => c.slides);
  const graphMap = new Map<string, { topic: string; related: Set<string>; weight: number }>();
  for (const c of chunks) {
    for (const g of c.topicGraph) {
      const ex = graphMap.get(g.topic);
      if (ex) {
        g.related.forEach((r) => ex.related.add(r));
        ex.weight = Math.max(ex.weight, g.weight);
      } else {
        graphMap.set(g.topic, { topic: g.topic, related: new Set(g.related), weight: g.weight });
      }
    }
  }
  return {
    source: base,
    slides: slides.sort((a, b) => a.page - b.page),
    topicGraph: Array.from(graphMap.values()).map((g) => ({
      topic: g.topic,
      related: Array.from(g.related),
      weight: g.weight,
    })),
  };
}

function renderMd(m: SlaytKonuHaritasi): string {
  const lines: string[] = [];
  lines.push(`# Slayt Konu Haritası — ${m.source}\n`);
  lines.push("## Slaytlar\n");
  for (const s of m.slides) {
    lines.push(`### Sayfa ${s.page}: ${s.title}`);
    if (s.concepts.length) lines.push(`- Kavramlar: ${s.concepts.join(", ")}`);
    if (s.formulas.length) lines.push(`- Formüller: ${s.formulas.join("; ")}`);
    if (s.examples.length) lines.push(`- Örnekler: ${s.examples.join("; ")}`);
    lines.push("");
  }
  lines.push("## Konu Grafı\n");
  for (const g of m.topicGraph) {
    lines.push(`- **${g.topic}** (ağırlık ${g.weight.toFixed(2)}) → ${g.related.join(", ")}`);
  }
  return lines.join("\n");
}
