import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Bundled Claude Code CLI'nin OAuth credentials dosyasının olası yolları.
 * Windows ve *nix'te konum farklı olabiliyor — ikisini de deniyoruz.
 */
function candidateCredentialsPaths(): string[] {
  const home = os.homedir();
  return [
    path.join(home, ".claude", ".credentials.json"),
    path.join(home, ".claude", "credentials.json"),
  ];
}

export async function subscriptionLoginExists(): Promise<boolean> {
  for (const p of candidateCredentialsPaths()) {
    try {
      await fs.access(p);
      return true;
    } catch {
      /* devam */
    }
  }
  return false;
}

export async function subscriptionCredentialsPath(): Promise<string | null> {
  for (const p of candidateCredentialsPaths()) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* devam */
    }
  }
  return null;
}
