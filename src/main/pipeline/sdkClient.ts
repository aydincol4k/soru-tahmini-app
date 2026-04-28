import fs from "node:fs/promises";
import path from "node:path";
import type { SDKMessage, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

type AgentSdk = typeof import("@anthropic-ai/claude-agent-sdk");

export interface InlineImage {
  imagePath: string;
  label?: string;
}

// TypeScript `module: CommonJS` dinamik `import()`'u `require`'a çevirir. SDK saf
// ESM olduğundan bu runtime'da kırılır. Function constructor sayesinde ifade
// derleme sırasında bozulmadan kalır ve Node'un native dinamik import'u çalışır.
const nativeImport = new Function("s", "return import(s)") as (s: string) => Promise<AgentSdk>;

let sdkPromise: Promise<AgentSdk> | null = null;
function loadSdk(): Promise<AgentSdk> {
  if (!sdkPromise) {
    sdkPromise = nativeImport("@anthropic-ai/claude-agent-sdk");
  }
  return sdkPromise;
}

export interface RunOptions {
  systemPrompt: string;
  userPrompt: string;
  /**
   * Eğer verilirse, görüntüler base64 olarak prompt'a inline gömülür ve agent
   * Read tool'una hiç ihtiyaç duymaz. Bu, SDK'nın paralel Read çağrılarında
   * "tool_use ids must be unique" 400 hatasını tamamen baypas eder.
   */
  images?: InlineImage[];
  allowedTools?: string[];
  cwd?: string;
  model?: string;
  maxTurns?: number;
  onEvent?: (ev: SDKMessage) => void;
  /**
   * `string` → API key modu (env var set edilir).
   * `null` → Subscription modu (env var SİLİNİR; CLI fallback olarak
   * `~/.claude/.credentials.json`'daki OAuth token'ı kullanır).
   */
  apiKey: string | null;
}

function detectMediaType(p: string): "image/png" | "image/jpeg" | "image/webp" | "image/gif" {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

async function buildInlinePromptStream(
  userPrompt: string,
  images: InlineImage[],
): Promise<AsyncIterable<SDKUserMessage>> {
  type ContentBlock =
    | { type: "text"; text: string }
    | {
        type: "image";
        source: { type: "base64"; media_type: string; data: string };
      };

  const content: ContentBlock[] = [{ type: "text", text: userPrompt }];
  for (const img of images) {
    if (img.label) content.push({ type: "text", text: img.label });
    const buf = await fs.readFile(img.imagePath);
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: detectMediaType(img.imagePath),
        data: buf.toString("base64"),
      },
    });
  }

  const message: SDKUserMessage = {
    type: "user",
    message: {
      role: "user",
      // SDK tipi APIUserMessage; content multimodal blok dizisi kabul eder.
      content: content as unknown as string,
    },
    parent_tool_use_id: null,
    session_id: "",
  };

  return (async function* () {
    yield message;
  })();
}

export async function runAgent(opts: RunOptions): Promise<string> {
  const { query } = await loadSdk();
  const prevKey = process.env.ANTHROPIC_API_KEY;
  if (opts.apiKey === null) {
    // Subscription modu: env var'ın varlığı CLI'nin OAuth fallback'ini engeller.
    // Boş string da fallback tetiklemez — DELETE şart.
    delete process.env.ANTHROPIC_API_KEY;
  } else {
    process.env.ANTHROPIC_API_KEY = opts.apiKey;
  }

  // Eğer inline image'lar verildiyse Read tool'una izin verme — SDK'nın paralel
  // Read çağrılarındaki "tool_use ids must be unique" bug'ını baypas etmek için.
  const allowed = opts.allowedTools ?? (opts.images ? [] : ["Read", "Glob", "Grep"]);
  const promptInput: string | AsyncIterable<SDKUserMessage> =
    opts.images && opts.images.length > 0
      ? await buildInlinePromptStream(opts.userPrompt, opts.images)
      : opts.userPrompt;
  const collectedText: string[] = [];
  let resultText: string | null = null;
  let resultErrorInfo: string | null = null;

  const stderrChunks: string[] = [];
  // SDK'nın iç debug loglarını da aç — alt-proses spawn komutu + hatalar
  // <userData>/.claude/debug/ altına yazılır. Hata olursa ekleyeceğiz.
  const prevDebug = process.env.DEBUG_CLAUDE_AGENT_SDK;
  process.env.DEBUG_CLAUDE_AGENT_SDK = "1";
  try {
    const iterator = query({
      prompt: promptInput,
      options: {
        systemPrompt: opts.systemPrompt,
        allowedTools: allowed,
        cwd: opts.cwd,
        model: opts.model,
        maxTurns: opts.maxTurns ?? 30,
        includePartialMessages: false,
        permissionMode: "bypassPermissions",
        stderr: (data: string) => {
          stderrChunks.push(data);
          console.error("[claude-cli stderr]", data);
        },
      },
    });

    for await (const msg of iterator) {
      opts.onEvent?.(msg);
      // Her mesajı debug için logla (text bloklarını kısaltarak)
      try {
        const summary = JSON.stringify(msg).slice(0, 500);
        console.log("[claude-sdk msg]", msg.type, summary);
      } catch {
        /* ignore */
      }
      if (msg.type === "assistant") {
        const content = msg.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && (block as { type?: string }).type === "text") {
              const text = (block as { text?: string }).text;
              if (typeof text === "string") collectedText.push(text);
            }
          }
        }
      } else if (msg.type === "result") {
        if ("result" in msg && typeof msg.result === "string") {
          resultText = msg.result;
        }
        // result tipi error/subtype içerebilir — sakla
        const r = msg as Record<string, unknown>;
        if (r.is_error || r.subtype === "error_max_turns" || r.subtype === "error") {
          try {
            resultErrorInfo = JSON.stringify(msg);
          } catch {
            resultErrorInfo = String(msg);
          }
        }
      }
    }
    if (resultErrorInfo && !resultText) {
      throw new Error(`CLI sonucu hata raporladı: ${resultErrorInfo.slice(0, 2000)}`);
    }
    const finalText = (resultText ?? collectedText.join("\n")).trim();
    // Iterator boş bittiyse + stderr varsa → CLI'nin söylediğini görünür yap.
    if (!finalText) {
      const stderr = stderrChunks.join("");
      if (stderr) {
        throw new Error(
          `CLI hiçbir cevap üretmeden kapandı. Stderr:\n${stderr.slice(0, 4000)}`,
        );
      }
      throw new Error(
        "CLI hiçbir cevap üretmeden kapandı (stderr de boş). Auth modunu kontrol et.",
      );
    }
    return finalText;
  } catch (err) {
    const stderr = stderrChunks.join("");
    const parts: string[] = [];
    if (stderr) parts.push(`[claude-cli stderr]:\n${stderr.slice(0, 4000)}`);
    if (resultErrorInfo) parts.push(`[result error]:\n${resultErrorInfo.slice(0, 2000)}`);
    if (parts.length > 0) {
      const e = err instanceof Error ? err : new Error(String(err));
      e.message = `${e.message}\n${parts.join("\n")}`;
      throw e;
    }
    throw err;
  } finally {
    if (prevDebug === undefined) {
      delete process.env.DEBUG_CLAUDE_AGENT_SDK;
    } else {
      process.env.DEBUG_CLAUDE_AGENT_SDK = prevDebug;
    }
    if (prevKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = prevKey;
    }
  }
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  // SDK doğrulaması Electron alt-proses spawn'ına bağlı. Doğrudan Anthropic
  // /v1/messages endpoint'ine 1 token'lık çağrı: 200 → key geçerli, 401 → değil.
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    // 401/403 → kimlik doğrulama hatası (key bozuk). Diğer her şey (200, 400,
    // 404, 429, 5xx) → key kimlik doğrulamasını geçti, başka bir hata var.
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => "");
      console.error("[validateApiKey] auth failed:", res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[validateApiKey] network error:", err);
    return false;
  }
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries = 4,
  baseMs = 2000,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === retries) break;
      const delay = baseMs * 2 ** i;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export function extractJson<T = unknown>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const firstBrace = raw.search(/[\[{]/);
  const candidate = firstBrace >= 0 ? raw.slice(firstBrace) : raw;
  return JSON.parse(candidate) as T;
}
