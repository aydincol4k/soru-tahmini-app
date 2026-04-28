import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";

const cache = new Map<string, string>();

function candidatePaths(name: string): string[] {
  const paths: string[] = [];
  if (app.isPackaged) {
    paths.push(path.join(process.resourcesPath, "prompts", name));
  }
  // Derlenmiş dist/main/pipeline/prompts.js → ../../.. = repo kökü (dev modu)
  paths.push(path.join(__dirname, "..", "..", "..", "src", "main", "prompts", name));
  paths.push(path.join(app.getAppPath(), "src", "main", "prompts", name));
  paths.push(path.join(app.getAppPath(), "prompts", name));
  return paths;
}

export async function loadPrompt(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;
  for (const p of candidatePaths(name)) {
    try {
      const content = await fs.readFile(p, "utf8");
      cache.set(name, content);
      return content;
    } catch {
      /* sıradakini dene */
    }
  }
  throw new Error(`Prompt dosyası bulunamadı: ${name}`);
}
