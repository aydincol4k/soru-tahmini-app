import { app, safeStorage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

function keyFilePath(): string {
  return path.join(app.getPath("userData"), "secrets", "anthropic.key");
}

export async function saveApiKey(plain: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("İşletim sistemi şifreli saklamayı desteklemiyor (safeStorage).");
  }
  const file = keyFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const encrypted = safeStorage.encryptString(plain);
  await fs.writeFile(file, encrypted);
}

export async function loadApiKey(): Promise<string | null> {
  const file = keyFilePath();
  try {
    const buf = await fs.readFile(file);
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

export async function deleteApiKey(): Promise<void> {
  const file = keyFilePath();
  try {
    await fs.unlink(file);
  } catch {
    /* yok sayılır */
  }
}

export async function hasApiKey(): Promise<boolean> {
  const file = keyFilePath();
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
