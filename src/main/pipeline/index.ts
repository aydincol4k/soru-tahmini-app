import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { analyzeCikmisSorular } from "./analyzeCikmisSorular";
import { mapSlaytlar } from "./mapSlaytlar";
import { mapElNotlari } from "./mapElNotlari";
import { sentezle } from "./sentez";
import { soruUret } from "./soruUret";
import { sorularToPdf } from "./mdToPdf";
import { slugify } from "../../shared/slug";
import type { JobProgress, JobRequest, JobResult, JobStage } from "../../shared/types";

const DEFAULT_CHUNK_SIZE = 20;
const DEFAULT_CONCURRENCY = 3;

// p-limit v5 saf ESM. Electron main CommonJS olduğu için require() çalışmaz.
// Function constructor TypeScript'in import()'u require'a çevirmesini engeller.
type PLimitFn = (n: number) => <T>(fn: () => Promise<T>) => Promise<T>;
const nativeImport = new Function("s", "return import(s)") as (
  s: string,
) => Promise<{ default: PLimitFn }>;
let pLimitPromise: Promise<PLimitFn> | null = null;
function loadPLimit(): Promise<PLimitFn> {
  if (!pLimitPromise) {
    pLimitPromise = nativeImport("p-limit").then((m) => m.default);
  }
  return pLimitPromise;
}

export interface PipelineDeps {
  /** `string` → API key modu, `null` → subscription (OAuth) modu. */
  apiKey: string | null;
  onProgress?: (p: JobProgress) => void;
}

export async function runPipeline(req: JobRequest, deps: PipelineDeps): Promise<JobResult> {
  const { apiKey, onProgress } = deps;
  const emit = (stage: JobStage, pct: number, message: string, activeFile?: string) =>
    onProgress?.({ stage, pct, message, activeFile, timestamp: Date.now() });

  emit("hazirlik", 0, "Çalışma alanı hazırlanıyor");
  const workspaceDir = await prepareWorkspace(req);

  const slaytlarInput = req.files.filter((f) => f.kind === "slaytlar").map((f) => f.path);
  const cikmisInput = req.files.filter((f) => f.kind === "cikmis-sorular").map((f) => f.path);
  const elNotlariInput = req.files.filter((f) => f.kind === "el-notlari").map((f) => f.path);

  if (cikmisInput.length === 0 && slaytlarInput.length === 0 && elNotlariInput.length === 0) {
    throw new Error("En az bir kaynak dosya (slayt, çıkmış soru veya el notu) gerekli.");
  }

  emit("pdf-to-image", 10, "Dosyalar görüntüye çevriliyor");

  const chunkSize = req.chunkSize > 0 ? req.chunkSize : DEFAULT_CHUNK_SIZE;
  const concurrency = req.concurrency > 0 ? req.concurrency : DEFAULT_CONCURRENCY;
  const pLimit = await loadPLimit();
  const limit = pLimit(concurrency);

  emit("cikmis-soru-analizi", 20, "Çıkmış sorular analiz ediliyor");
  const cikmisTask = cikmisInput.length
    ? limit(() =>
        analyzeCikmisSorular({
          apiKey,
          files: cikmisInput,
          workspaceDir,
          chunkSize,
          model: req.analysisModel,
          onProgress: (m) => emit("cikmis-soru-analizi", 30, m),
        }),
      )
    : Promise.resolve(null);

  emit("slayt-haritasi", 35, "Slayt konu haritaları çıkarılıyor");
  const slaytTask = slaytlarInput.length
    ? limit(() =>
        mapSlaytlar({
          apiKey,
          files: slaytlarInput,
          workspaceDir,
          chunkSize,
          model: req.analysisModel,
          onProgress: (m) => emit("slayt-haritasi", 50, m),
        }),
      )
    : Promise.resolve([]);

  emit("el-notu-haritasi", 55, "El notları haritalandırılıyor");
  const elNotuTask = elNotlariInput.length
    ? limit(() =>
        mapElNotlari({
          apiKey,
          files: elNotlariInput,
          workspaceDir,
          chunkSize,
          model: req.analysisModel,
          onProgress: (m) => emit("el-notu-haritasi", 65, m),
        }),
      )
    : Promise.resolve([]);

  const [cikmisRes, slaytRes, elNotuRes] = await Promise.all([cikmisTask, slaytTask, elNotuTask]);

  emit("sentez", 75, "Üç kaynak sentezleniyor");
  const sentezRes = await sentezle({
    apiKey,
    workspaceDir,
    cikmis: cikmisRes?.json ?? { topics: [], patterns: [], hotpoints: [] },
    slaytlar: slaytRes.map((r) => r.json),
    elNotlari: elNotuRes.map((r) => r.json),
    model: req.synthesisModel,
  });

  emit("soru-uretimi", 85, `${req.soruSayisi} tahmin sorusu üretiliyor`);
  const sorular = await soruUret({
    apiKey,
    workspaceDir,
    dersAdi: req.dersAdi,
    soruSayisi: req.soruSayisi,
    sentez: sentezRes.json,
    model: req.synthesisModel,
  });

  emit("pdf-export", 95, "PDF çıktısı oluşturuluyor");
  // Tek seferde hedef klasöre yazıyoruz — AppData'da çift kopya bırakmıyoruz.
  const targetDir =
    req.outputDir && req.outputDir.trim().length > 0
      ? req.outputDir.trim()
      : path.join(app.getPath("desktop"), "Soru Tahmini");
  await fs.mkdir(targetDir, { recursive: true });
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .slice(0, 19);
  const fileName = `${slugify(req.dersAdi)}-${stamp}.pdf`;
  const pdfPath = path.join(targetDir, fileName);
  await sorularToPdf(sorular.json, pdfPath, { includeAnswerKey: req.cevapAnahtariDahil });
  emit("pdf-export", 98, `PDF kaydedildi: ${pdfPath}`);

  emit("tamam", 100, "Hazır");

  return {
    workspaceDir,
    pdfPath,
    markdownPath: sorular.mdPath,
    sentezPath: sentezRes.jsonPath,
  };
}

async function prepareWorkspace(req: JobRequest): Promise<string> {
  const root = path.join(app.getPath("userData"), "workspaces", slugify(req.dersAdi));
  const inputs = path.join(root, "inputs");
  const dirs = [
    path.join(inputs, "slaytlar"),
    path.join(inputs, "cikmis-sorular"),
    path.join(inputs, "el-notlari"),
    path.join(root, "intermediate", "images"),
    path.join(root, "intermediate", "chunks"),
    path.join(root, "intermediate", "cache"),
    path.join(root, "outputs"),
  ];
  await Promise.all(dirs.map((d) => fs.mkdir(d, { recursive: true })));

  for (const f of req.files) {
    const dest = path.join(inputs, f.kind, path.basename(f.path));
    await fs.copyFile(f.path, dest);
    f.path = dest;
  }
  return root;
}
