import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export type AuthMode = "api-key" | "subscription";

function modeFilePath(): string {
  return path.join(app.getPath("userData"), "secrets", "auth-mode.json");
}

export async function getMode(): Promise<AuthMode | null> {
  try {
    const buf = await fs.readFile(modeFilePath(), "utf8");
    const parsed = JSON.parse(buf) as { mode?: AuthMode };
    if (parsed.mode === "api-key" || parsed.mode === "subscription") {
      return parsed.mode;
    }
    return null;
  } catch {
    return null;
  }
}

export async function setMode(mode: AuthMode): Promise<void> {
  const file = modeFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ mode }), "utf8");
}

export async function clearMode(): Promise<void> {
  try {
    await fs.unlink(modeFilePath());
  } catch {
    /* yok sayılır */
  }
}
