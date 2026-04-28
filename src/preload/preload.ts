import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AuthMode, AuthStatus, JobProgress, JobRequest, JobResult } from "../shared/types";

type ApiKeyStatus = { hasKey: boolean; hint: string | null };
type SaveResult = { ok: boolean; error?: string };
type JobResponse = { ok: boolean; result?: JobResult; error?: string };

const api = {
  apiKey: {
    status: (): Promise<ApiKeyStatus> => ipcRenderer.invoke("apiKey:status"),
    save: (key: string): Promise<SaveResult> => ipcRenderer.invoke("apiKey:save", key),
    remove: (): Promise<SaveResult> => ipcRenderer.invoke("apiKey:delete"),
  },
  auth: {
    status: (): Promise<AuthStatus> => ipcRenderer.invoke("auth:status"),
    setMode: (mode: AuthMode): Promise<SaveResult> => ipcRenderer.invoke("auth:setMode", mode),
    checkSubscription: (): Promise<{ exists: boolean }> =>
      ipcRenderer.invoke("auth:checkSubscription"),
  },
  dialog: {
    selectFiles: (kind: string): Promise<string[]> =>
      ipcRenderer.invoke("dialog:selectFiles", kind),
    selectFolder: (): Promise<string | null> => ipcRenderer.invoke("dialog:selectFolder"),
  },
  shell: {
    openPath: (p: string): Promise<void> => ipcRenderer.invoke("shell:openPath", p),
    showItemInFolder: (p: string): Promise<void> =>
      ipcRenderer.invoke("shell:showItemInFolder", p),
  },
  job: {
    run: (req: JobRequest): Promise<JobResponse> => ipcRenderer.invoke("job:run", req),
    onProgress: (cb: (p: JobProgress) => void) => {
      const listener = (_: unknown, p: JobProgress) => cb(p);
      ipcRenderer.on("job:progress", listener);
      return () => ipcRenderer.removeListener("job:progress", listener);
    },
  },
  files: {
    pathFor: (file: File): string => {
      // Birden fazla yöntem dene. webUtils E30+ var; file.path E31'e kadar.
      try {
        if (webUtils && typeof webUtils.getPathForFile === "function") {
          const p = webUtils.getPathForFile(file);
          if (p) return p;
        }
      } catch (e) {
        console.error("[preload] webUtils.getPathForFile failed:", e);
      }
      const legacy = (file as File & { path?: string }).path;
      if (legacy) return legacy;
      console.warn("[preload] could not resolve path for dropped file:", file.name);
      return "";
    },
  },
};

contextBridge.exposeInMainWorld("soruTahmini", api);

export type SoruTahminiApi = typeof api;
