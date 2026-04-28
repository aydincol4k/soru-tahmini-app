import fs from "node:fs/promises";
import path from "node:path";
import { runAgent, extractJson, retryWithBackoff } from "./sdkClient";
import { pdfToImages, chunkPages, type PageImage } from "./pdfToImages";
import { loadPrompt } from "./prompts";
import { CikmisSoruAnaliziSchema, type CikmisSoruAnalizi } from "../../shared/schemas";
import { slugify } from "../../shared/slug";

interface Args {
  apiKey: string | null;
  files: string[];
  workspaceDir: string;
  chunkSize: number;
  model?: string;
  onProgress?: (msg: string) => void;
}

export async function analyzeCikmisSorular(args: Args): Promise<{
  json: CikmisSoruAnalizi;
  jsonPath: string;
  mdPath: string;
}> {
  const { apiKey, files, workspaceDir, chunkSize, model, onProgress } = args;
  const system = await loadPrompt("cikmisSorular.system.md");
  const imagesRoot = path.join(workspaceDir, "intermediate", "images", "cikmis-sorular");

  const allChunkResults: CikmisSoruAnalizi[] = [];

  for (const pdf of files) {
    const slug = slugify(path.basename(pdf, path.extname(pdf)));
    const outDir = path.join(imagesRoot, slug);
    onProgress?.(`Çıkmış sorular görüntüye çevriliyor: ${path.basename(pdf)}`);
    const pages = await pdfToImages(pdf, outDir);
    const chunks = chunkPages(pages, chunkSize);

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      onProgress?.(
        `Çıkmış soru analizi: ${path.basename(pdf)} — chunk ${ci + 1}/${chunks.length}`,
      );
      const userPrompt = buildChunkPrompt(pdf, chunk, ci, chunks.length);
      const text = await retryWithBackoff(() =>
        runAgent({
          apiKey,
          systemPrompt: system,
          userPrompt,
          images: chunk.map((p) => ({ imagePath: p.imagePath, label: `Sayfa ${p.page}:` })),
          cwd: workspaceDir,
          model,
          maxTurns: 3,
        }),
      );
      try {
        const parsed = CikmisSoruAnaliziSchema.parse(extractJson(text));
        allChunkResults.push(parsed);
      } catch (err) {
        onProgress?.(
          `Chunk ${ci + 1} parse başarısız, atlanıyor: ${(err as Error).message}`,
        );
      }
    }
  }

  const merged = await reduceChunks(allChunkResults, apiKey, model, system);

  const outDir = path.join(workspaceDir, "outputs");
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "01-cikmis-soru-analizi.json");
  const mdPath = path.join(outDir, "01-cikmis-soru-analizi.md");
  await fs.writeFile(jsonPath, JSON.stringify(merged, null, 2), "utf8");
  await fs.writeFile(mdPath, renderMd(merged), "utf8");

  return { json: merged, jsonPath, mdPath };
}

function buildChunkPrompt(
  pdfPath: string,
  pages: PageImage[],
  chunkIdx: number,
  totalChunks: number,
): string {
  return `Kaynak PDF: ${path.basename(pdfPath)}
Parça: ${chunkIdx + 1}/${totalChunks} (${pages.length} sayfa, mesaja inline gömülü)

Aşağıda gönderilen görüntüler çıkmış sınav sorularıdır. Tümünü dikkatlice inceleyip analiz et.

Sistem talimatındaki JSON şemasına tam uyan analiz döndür.`;
}

async function reduceChunks(
  chunks: CikmisSoruAnalizi[],
  apiKey: string | null,
  model: string | undefined,
  systemPrompt: string,
): Promise<CikmisSoruAnalizi> {
  if (chunks.length === 0) {
    return { topics: [], patterns: [], hotpoints: [] };
  }
  if (chunks.length === 1) return chunks[0];
  const userPrompt = `Birden fazla parça analiz sonucunu birleştir. Aynı konuların frekanslarını topla, hotpoint'leri tekilleştir ve konsolide et.

Parça sonuçları (JSON dizisi):
${JSON.stringify(chunks, null, 2)}

Tek bir konsolide JSON döndür (aynı şema).`;
  const text = await retryWithBackoff(() =>
    runAgent({
      apiKey,
      systemPrompt,
      userPrompt,
      allowedTools: [],
      model,
      maxTurns: 3,
    }),
  );
  try {
    return CikmisSoruAnaliziSchema.parse(extractJson(text));
  } catch {
    return mergeFallback(chunks);
  }
}

function mergeFallback(chunks: CikmisSoruAnalizi[]): CikmisSoruAnalizi {
  const topicMap = new Map<string, CikmisSoruAnalizi["topics"][number]>();
  const patterns = new Set<string>();
  const hotpointMap = new Map<string, CikmisSoruAnalizi["hotpoints"][number]>();
  for (const c of chunks) {
    for (const t of c.topics) {
      const ex = topicMap.get(t.name);
      if (ex) {
        ex.frequency += t.frequency;
        ex.sampleQuestions = [...ex.sampleQuestions, ...t.sampleQuestions].slice(0, 5);
        ex.keywords = Array.from(new Set([...ex.keywords, ...t.keywords]));
      } else {
        topicMap.set(t.name, { ...t });
      }
    }
    c.patterns.forEach((p) => patterns.add(p));
    for (const h of c.hotpoints) {
      const ex = hotpointMap.get(h.topic);
      if (!ex || ex.score < h.score) hotpointMap.set(h.topic, h);
    }
  }
  return {
    topics: Array.from(topicMap.values()),
    patterns: Array.from(patterns),
    hotpoints: Array.from(hotpointMap.values()),
  };
}

function renderMd(a: CikmisSoruAnalizi): string {
  const lines: string[] = [];
  lines.push("# Çıkmış Soru Analizi\n");
  lines.push("## Konular (frekansa göre)\n");
  const sorted = [...a.topics].sort((x, y) => y.frequency - x.frequency);
  for (const t of sorted) {
    lines.push(`### ${t.name}`);
    lines.push(`- Frekans: **${t.frequency}**`);
    if (t.difficulty) lines.push(`- Zorluk: ${t.difficulty}`);
    if (t.keywords.length) lines.push(`- Anahtar kelimeler: ${t.keywords.join(", ")}`);
    if (t.sampleQuestions.length) {
      lines.push(`- Örnek sorular:`);
      t.sampleQuestions.forEach((q) => lines.push(`  - ${q}`));
    }
    lines.push("");
  }
  lines.push("## Kalıplar\n");
  a.patterns.forEach((p) => lines.push(`- ${p}`));
  lines.push("\n## Hotpoint'ler\n");
  const sortedH = [...a.hotpoints].sort((x, y) => y.score - x.score);
  sortedH.forEach((h) =>
    lines.push(`- **${h.topic}** (skor ${h.score.toFixed(2)}): ${h.reason}`),
  );
  if (a.notes) lines.push(`\n## Notlar\n\n${a.notes}`);
  return lines.join("\n");
}
