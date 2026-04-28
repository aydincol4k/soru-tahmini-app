import { app, BrowserWindow, shell } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./ipc";

const isDev = !app.isPackaged;

// SDK'nın spawn ettiği Claude Code CLI alt-prosesi erken ölürse, parent
// stdin yazımı "write EOF" / EPIPE atar. Bu, runAgent'ın try/catch'inin
// dışında bir async-pump'ta olur → uncaughtException → Electron diyalog.
// Yutuyoruz; runAgent zaten kendi yolunu boş sonuçla / iterator-end ile
// çevirip hata fırlatacak.
const isStreamEofError = (err: unknown): boolean => {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "EPIPE" || e.code === "ERR_STREAM_WRITE_AFTER_END") return true;
  return typeof e.message === "string" && /write EOF|write after end|EPIPE/i.test(e.message);
};
process.on("uncaughtException", (err) => {
  if (isStreamEofError(err)) {
    console.error("[uncaughtException] CLI alt-proses erken kapandı:", err);
    return;
  }
  console.error("[uncaughtException]", err);
});
process.on("unhandledRejection", (reason) => {
  if (isStreamEofError(reason)) {
    console.error("[unhandledRejection] CLI alt-proses erken kapandı:", reason);
    return;
  }
  console.error("[unhandledRejection]", reason);
});

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    title: "Soru Tahmini",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
