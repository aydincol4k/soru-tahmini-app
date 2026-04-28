import React from "react";
import type { JobProgress } from "../../shared/types";

interface Props {
  progress: JobProgress | null;
  log: string[];
}

const STAGE_LABELS: Record<string, string> = {
  hazirlik: "Hazırlık",
  "pdf-to-image": "PDF → Görüntü",
  "cikmis-soru-analizi": "Çıkmış soru analizi",
  "slayt-haritasi": "Slayt konu haritası",
  "el-notu-haritasi": "El notu haritası",
  sentez: "Sentez",
  "soru-uretimi": "Soru üretimi",
  "pdf-export": "PDF çıktısı",
  tamam: "Tamamlandı",
  hata: "Hata",
};

export function ProgressPanel({ progress, log }: Props) {
  if (!progress && log.length === 0) return null;
  const pct = progress?.pct ?? 0;
  const stage = progress ? STAGE_LABELS[progress.stage] ?? progress.stage : "";
  return (
    <div className="progress">
      <div className="stage">
        {stage} — {pct}%
      </div>
      <div className="bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="log">
        {log.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
}
