import fs from "node:fs/promises";
import path from "node:path";
import { runAgent, extractJson, retryWithBackoff } from "./sdkClient";
import { loadPrompt } from "./prompts";
import {
  SentezSchema,
  type CikmisSoruAnalizi,
  type ElNotuKonuHaritasi,
  type Sentez,
  type SlaytKonuHaritasi,
} from "../../shared/schemas";

interface Args {
  apiKey: string | null;
  workspaceDir: string;
  cikmis: CikmisSoruAnalizi;
  slaytlar: SlaytKonuHaritasi[];
  elNotlari: ElNotuKonuHaritasi[];
  model?: string;
}

export async function sentezle(args: Args): Promise<{ json: Sentez; jsonPath: string }> {
  const { apiKey, workspaceDir, cikmis, slaytlar, elNotlari, model } = args;
  const system = await loadPrompt("sentez.system.md");
  const userPrompt = `Aşağıda üç kaynak analiz verilmiştir. Hepsini birleştirip konu önceliklendirmesi (priorityScore) üret.

## 1) Çıkmış soru analizi (JSON)
${JSON.stringify(cikmis, null, 2)}

## 2) Slayt konu haritaları (JSON dizisi)
${JSON.stringify(slaytlar, null, 2)}

## 3) El notu konu haritaları (JSON dizisi)
${JSON.stringify(elNotlari, null, 2)}

Sistem talimatındaki şemaya uyan tek bir sentez JSON'u döndür.`;

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
  const json = SentezSchema.parse(extractJson(text));
  const outDir = path.join(workspaceDir, "outputs");
  await fs.mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "04-sentez.json");
  await fs.writeFile(jsonPath, JSON.stringify(json, null, 2), "utf8");
  return { json, jsonPath };
}
