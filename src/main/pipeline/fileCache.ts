import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export class FileCache {
  constructor(private dir: string) {}

  private async ensure(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async keyFor(parts: string[]): Promise<string> {
    const hash = crypto.createHash("sha256");
    for (const p of parts) {
      try {
        const st = await fs.stat(p);
        if (st.isFile()) {
          const buf = await fs.readFile(p);
          hash.update(buf);
          continue;
        }
      } catch {
        /* dosya değil, string olarak hash'e ekle */
      }
      hash.update(p);
    }
    return hash.digest("hex").slice(0, 32);
  }

  async get(key: string): Promise<string | null> {
    await this.ensure();
    const fp = path.join(this.dir, key + ".txt");
    try {
      return await fs.readFile(fp, "utf8");
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensure();
    const fp = path.join(this.dir, key + ".txt");
    await fs.writeFile(fp, value, "utf8");
  }
}
