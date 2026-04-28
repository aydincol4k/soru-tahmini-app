import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Pencere geneli: dropzone dışına bırakılan dosyalarda Electron'un varsayılan
// davranışı drop'u reddedip "yasak" imleci gösterir. preventDefault'u capture
// fazında çağırıyoruz; gerçek işleme DropZone bileşeninde.
const swallow = (e: DragEvent) => {
  e.preventDefault();
  if (e.type === "dragover" && e.dataTransfer) {
    e.dataTransfer.dropEffect = "copy";
  }
};
for (const evt of ["dragenter", "dragover", "drop", "dragleave"] as const) {
  window.addEventListener(evt, swallow as EventListener, { capture: true });
  document.addEventListener(evt, swallow as EventListener, { capture: true });
}

const container = document.getElementById("root");
if (!container) throw new Error("root yok");
createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
