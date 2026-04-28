import fs from "node:fs/promises";
import path from "node:path";
import { runAgent, extractJson, retryWithBackoff } from "./sdkClient";
import { loadPrompt } from "./prompts";
import {
  TahminSorulariSchema,
  type Sentez,
  type TahminSorular,
} from "../../shared/schemas";

interface Args {
  apiKey: string | null;
  workspaceDir: string;
  dersAdi: string;
  soruSayisi: number;
  sentez: Sentez;
  model?: string;
}

export async function soruUret(args: Args): Promise<{ json: TahminSorular; mdPath: string; jsonPath: string }> {
  const { apiKey, workspaceDir, dersAdi, soruSayisi, sentez, model } = args;
  const system = await loadPrompt("soruUret.system.md");
  const today = new Date().toISOString().slice(0, 10);
  const userPrompt = `Ders adı: ${dersAdi}
Üretim tarihi: ${today}
İstenen soru sayısı: ${soruSayisi}

Aşağıdaki sentezlenmiş konu önceliklendirmesine göre tam olarak ${soruSayisi} adet özgün tahmin sorusu üret. Zorluk dağılımı ~30% zor / 50% orta / 20% kolay olsun. priorityScore yüksek konulardan daha çok soru gelsin.

## Sentez (JSON)
${JSON.stringify(sentez, null, 2)}

Sistem talimatındaki şemaya uyan JSON döndür. "sorular" dizisinin uzunluğu ${soruSayisi} olmalı.`;

  const text = await retryWithBackoff(() =>
    runAgent({
      apiKey,
      systemPrompt: system,
      userPrompt,
      allowedTools: [],
      model,
      maxTurns: 3,
    }),
  );
  const json = TahminSorulariSchema.parse(extractJson(text));

  const outDir = path.join(workspaceDir, "outputs");
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "05-tahmin-sorulari.json");
  const mdPath = path.join(outDir, "05-tahmin-sorulari.md");
  await fs.writeFile(jsonPath, JSON.stringify(json, null, 2), "utf8");
  await fs.writeFile(mdPath, renderMd(json), "utf8");
  return { json, mdPath, jsonPath };
}

function renderMd(t: TahminSorular): string {
  const lines: string[] = [];
  lines.push(`# Tahmin Soruları — ${t.dersAdi}\n`);
  lines.push(`_Üretim tarihi: ${t.uretimTarihi}_\n`);
  for (const s of t.sorular) {
    lines.push(`## Soru ${s.no} [${s.zorluk}]`);
    lines.push(`\n${s.soru}\n`);
    lines.push(`- **Kaynak konu:** ${s.kaynakKonu}`);
    lines.push(`- **Tahmin gerekçesi:** ${s.tahminGerekcesi}`);
    lines.push("");
  }
  lines.push("\n---\n\n# Cevap Anahtarı\n");
  for (const s of t.sorular) {
    lines.push(`### Soru ${s.no}\n\n${s.cevapAnahtari ?? "-"}\n`);
  }
  return lines.join("\n");
}
