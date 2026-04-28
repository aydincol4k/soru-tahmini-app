import React, { useState } from "react";
import type { FileKind } from "../../shared/types";
import { api } from "../api";

interface Props {
  kind: FileKind;
  title: string;
  desc: string;
  files: string[];
  onChange: (files: string[]) => void;
}

export function DropZone({ kind, title, desc, files, onChange }: Props) {
  const [active, setActive] = useState(false);

  const add = async () => {
    const picked = await api().dialog.selectFiles(title);
    if (picked.length) {
      const merged = Array.from(new Set([...files, ...picked]));
      onChange(merged);
    }
  };

  const remove = (p: string) => {
    onChange(files.filter((f) => f !== p));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setActive(false);
    const fileList = Array.from(e.dataTransfer.files);
    console.log("[DropZone] drop fired, files:", fileList.length, fileList.map((f) => f.name));
    const resolved = fileList.map((f) => {
      const p = api().files.pathFor(f);
      console.log("[DropZone] pathFor", f.name, "=>", p);
      return p;
    });
    const dropped = resolved.filter((p) => p && p.toLowerCase().endsWith(".pdf"));
    if (dropped.length) {
      onChange(Array.from(new Set([...files, ...dropped])));
    } else if (fileList.length > 0) {
      console.warn("[DropZone] dropped files but no valid paths resolved");
    }
  };

  return (
    <div
      className={`dropzone${active ? " active" : ""}`}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // sadece dropzone'un dışına çıkıldığında deaktive et
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setActive(false);
      }}
      onDrop={handleDrop}
    >
      <h3>{title}</h3>
      <p className="desc">{desc}</p>
      <ul className="files">
        {files.map((f) => (
          <li key={f} title={f}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fileName(f)}
            </span>
            <button onClick={() => remove(f)}>✕</button>
          </li>
        ))}
        {files.length === 0 && (
          <li className="dz-empty">PDF dosyalarını buraya sürükle-bırak veya butonu kullan</li>
        )}
      </ul>
      <button className="add" onClick={add}>
        + PDF Ekle
      </button>
      <input type="hidden" data-kind={kind} />
    </div>
  );
}

function fileName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
