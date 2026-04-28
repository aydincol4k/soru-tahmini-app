export type FileKind = "slaytlar" | "cikmis-sorular" | "el-notlari";

export interface InputFile {
  kind: FileKind;
  path: string;
  name: string;
}

export interface JobRequest {
  dersAdi: string;
  soruSayisi: number;
  cevapAnahtariDahil: boolean;
  analysisModel: string;
  synthesisModel: string;
  concurrency: number;
  chunkSize: number;
  files: InputFile[];
  /** Kullanıcının seçtiği çıktı klasörü; boşsa varsayılan workspace kullanılır. */
  outputDir?: string;
}

export interface ModelChoice {
  id: string;
  label: string;
  description: string;
}

export const MODEL_CHOICES: ModelChoice[] = [
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6 (önerilen)",
    description:
      "Kalite/hız dengesi iyi, tool kullanımı stabil. Bu uygulama için önerilen varsayılan.",
  },
  {
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5 (hızlı)",
    description: "En hızlı ve en ucuz. Büyük hacimli iş akışlarında ilk tarama için uygun.",
  },
  {
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7 (en yüksek kalite, yavaş + pahalı)",
    description:
      "En yüksek kalite — yavaş ve pahalı. Görüntüleri inline base64 ile veriyoruz, eski 'paralel Read concurrency' bug'ı artık tetiklenmiyor.",
  },
];

export const DEFAULT_ANALYSIS_MODEL = "claude-sonnet-4-6";
export const DEFAULT_SYNTHESIS_MODEL = "claude-sonnet-4-6";
export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_CHUNK_SIZE = 20;

export type JobStage =
  | "hazirlik"
  | "pdf-to-image"
  | "cikmis-soru-analizi"
  | "slayt-haritasi"
  | "el-notu-haritasi"
  | "sentez"
  | "soru-uretimi"
  | "pdf-export"
  | "tamam"
  | "hata";

export interface JobProgress {
  stage: JobStage;
  pct: number;
  message: string;
  activeFile?: string;
  timestamp: number;
}

export interface JobResult {
  workspaceDir: string;
  pdfPath: string;
  markdownPath: string;
  sentezPath: string;
}

export interface ApiKeyStatus {
  hasKey: boolean;
  hint: string | null;
  isValid?: boolean;
}

export type AuthMode = "api-key" | "subscription";

export interface AuthStatus {
  mode: AuthMode | null;
  apiKey: { hasKey: boolean; hint: string | null };
  subscription: { credentialsFileExists: boolean };
}
