import { BrowserWindow, ipcMain, dialog, shell } from "electron";
import type { AuthMode, AuthStatus, JobRequest, JobProgress } from "../shared/types";
import { hasApiKey, loadApiKey, saveApiKey, deleteApiKey } from "./security/apiKey";
import { getMode, setMode, clearMode } from "./security/authMode";
import { subscriptionLoginExists } from "./security/subscription";
import { validateApiKey } from "./pipeline/sdkClient";
import { runPipeline } from "./pipeline";

export function registerIpcHandlers(): void {
  ipcMain.handle("apiKey:status", async () => {
    const has = await hasApiKey();
    if (!has) return { hasKey: false, hint: null };
    const key = await loadApiKey();
    const hint = key && key.length >= 4 ? key.slice(-5) : null;
    return { hasKey: true, hint };
  });

  ipcMain.handle("apiKey:save", async (_e, plainKey: string) => {
    if (!plainKey || plainKey.length < 10) {
      return { ok: false, error: "Geçersiz API key." };
    }
    const valid = await validateApiKey(plainKey);
    if (!valid) return { ok: false, error: "API key doğrulanamadı. Lütfen kontrol edin." };
    await saveApiKey(plainKey);
    // İlk kez bir kimlik kaydediliyorsa modu otomatik api-key yap. Mevcut mod
    // subscription ise dokunmuyoruz — kullanıcı modlar arası gezebilsin.
    const current = await getMode();
    if (current === null) await setMode("api-key");
    return { ok: true };
  });

  ipcMain.handle("apiKey:delete", async () => {
    await deleteApiKey();
    // Mevcut mod api-key ise temizle (subscription'a geçilmediyse modeyi de bırakmıyoruz).
    const mode = await getMode();
    if (mode === "api-key") await clearMode();
    return { ok: true };
  });

  ipcMain.handle("auth:status", async (): Promise<AuthStatus> => {
    const [mode, has, subExists] = await Promise.all([
      getMode(),
      hasApiKey(),
      subscriptionLoginExists(),
    ]);
    let hint: string | null = null;
    if (has) {
      const key = await loadApiKey();
      hint = key && key.length >= 4 ? key.slice(-5) : null;
    }
    return {
      mode,
      apiKey: { hasKey: has, hint },
      subscription: { credentialsFileExists: subExists },
    };
  });

  ipcMain.handle("auth:setMode", async (_e, mode: AuthMode) => {
    if (mode !== "api-key" && mode !== "subscription") {
      return { ok: false, error: "Geçersiz mod." };
    }
    if (mode === "subscription") {
      const exists = await subscriptionLoginExists();
      if (!exists) {
        return {
          ok: false,
          error:
            "Claude Code aboneliği için önce bir terminalde 'claude /login' çalıştırman gerek.",
        };
      }
    } else {
      const has = await hasApiKey();
      if (!has) return { ok: false, error: "Önce bir API key kaydet." };
    }
    await setMode(mode);
    return { ok: true };
  });

  ipcMain.handle("auth:checkSubscription", async () => {
    return { exists: await subscriptionLoginExists() };
  });

  ipcMain.handle("dialog:selectFolder", async () => {
    const res = await dialog.showOpenDialog({
      title: "PDF çıktı klasörünü seç",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("dialog:selectFiles", async (_e, kind: string) => {
    const res = await dialog.showOpenDialog({
      title: `${kind} seç`,
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (res.canceled) return [];
    return res.filePaths;
  });

  ipcMain.handle("shell:openPath", async (_e, p: string) => {
    await shell.openPath(p);
  });

  ipcMain.handle("shell:showItemInFolder", async (_e, p: string) => {
    shell.showItemInFolder(p);
  });

  ipcMain.handle("job:run", async (event, req: JobRequest) => {
    const mode = await getMode();
    let apiKey: string | null = null;
    if (mode === "api-key") {
      apiKey = await loadApiKey();
      if (!apiKey)
        return { ok: false, error: "API key yok. Lütfen Ayarlar'dan ekleyin." };
    } else if (mode === "subscription") {
      const exists = await subscriptionLoginExists();
      if (!exists) {
        return {
          ok: false,
          error:
            "Claude Code aboneliği aktif ama oturum bulunamadı. Bir terminalde 'claude /login' çalıştır.",
        };
      }
      apiKey = null;
    } else {
      return { ok: false, error: "Auth modu seçilmemiş. Ayarlar'dan API Key veya Abonelik seç." };
    }

    const sender = event.sender;
    const send = (p: JobProgress) => {
      if (!sender.isDestroyed()) sender.send("job:progress", p);
    };

    try {
      const result = await runPipeline(req, { apiKey, onProgress: send });
      return { ok: true, result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      send({ stage: "hata", pct: 100, message: msg, timestamp: Date.now() });
      return { ok: false, error: msg };
    }
  });
}

export function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null;
}
