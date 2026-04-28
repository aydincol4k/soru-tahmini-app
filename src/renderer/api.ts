import type { AuthMode, AuthStatus, JobProgress, JobRequest, JobResult } from "../shared/types";

export interface SoruTahminiApi {
  apiKey: {
    status: () => Promise<{ hasKey: boolean; hint: string | null }>;
    save: (key: string) => Promise<{ ok: boolean; error?: string }>;
    remove: () => Promise<{ ok: boolean }>;
  };
  auth: {
    status: () => Promise<AuthStatus>;
    setMode: (mode: AuthMode) => Promise<{ ok: boolean; error?: string }>;
    checkSubscription: () => Promise<{ exists: boolean }>;
  };
  dialog: {
    selectFiles: (kind: string) => Promise<string[]>;
    selectFolder: () => Promise<string | null>;
  };
  shell: {
    openPath: (p: string) => Promise<void>;
    showItemInFolder: (p: string) => Promise<void>;
  };
  job: {
    run: (req: JobRequest) => Promise<{ ok: boolean; result?: JobResult; error?: string }>;
    onProgress: (cb: (p: JobProgress) => void) => () => void;
  };
  files: {
    pathFor: (file: File) => string;
  };
}

declare global {
  interface Window {
    soruTahmini: SoruTahminiApi;
  }
}

export const api = (): SoruTahminiApi => window.soruTahmini;
