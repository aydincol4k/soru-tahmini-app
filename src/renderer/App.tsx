import React, { useEffect, useMemo, useState } from "react";
import { DropZone } from "./components/DropZone";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ProgressPanel } from "./components/ProgressPanel";
import {
  DEFAULT_ANALYSIS_MODEL,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_CONCURRENCY,
  DEFAULT_SYNTHESIS_MODEL,
  MODEL_CHOICES,
  type AuthMode,
  type FileKind,
  type JobProgress,
  type JobResult,
} from "../shared/types";
import { api } from "./api";

export function App() {
  const [authReady, setAuthReady] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [authHint, setAuthHint] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState(false);

  const [slaytlar, setSlaytlar] = useState<string[]>([]);
  const [cikmis, setCikmis] = useState<string[]>([]);
  const [elNotlari, setElNotlari] = useState<string[]>([]);
  const [dersAdi, setDersAdi] = useState("");
  const [soruSayisi, setSoruSayisi] = useState(10);
  const [cevapAnahtari, setCevapAnahtari] = useState(true);
  const [analysisModel, setAnalysisModel] = useState(DEFAULT_ANALYSIS_MODEL);
  const [synthesisModel, setSynthesisModel] = useState(DEFAULT_SYNTHESIS_MODEL);
  const [concurrency, setConcurrency] = useState(DEFAULT_CONCURRENCY);
  const [chunkSize, setChunkSize] = useState(DEFAULT_CHUNK_SIZE);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [outputDir, setOutputDir] = useState("");

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAuth = async () => {
    const s = await api().auth.status();
    setAuthMode(s.mode);
    setAuthHint(s.apiKey.hint);
    const ready =
      s.mode === "api-key"
        ? s.apiKey.hasKey
        : s.mode === "subscription"
          ? s.subscription.credentialsFileExists
          : false;
    setAuthReady(ready);
    if (!ready) setShowKeyModal(true);
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  useEffect(() => {
    return api().job.onProgress((p) => {
      setProgress(p);
      setLog((l) => [...l, `[${new Date(p.timestamp).toLocaleTimeString()}] ${p.message}`].slice(-200));
    });
  }, []);

  const canStart = useMemo(
    () =>
      authReady === true &&
      !running &&
      dersAdi.trim().length > 0 &&
      soruSayisi > 0 &&
      slaytlar.length + cikmis.length + elNotlari.length > 0,
    [authReady, running, dersAdi, soruSayisi, slaytlar, cikmis, elNotlari],
  );

  const start = async () => {
    setRunning(true);
    setProgress(null);
    setLog([]);
    setResult(null);
    setError(null);

    const toInput = (kind: FileKind, arr: string[]) =>
      arr.map((path) => ({ kind, path, name: path.split(/[\\/]/).pop() ?? path }));

    const res = await api().job.run({
      dersAdi: dersAdi.trim(),
      soruSayisi,
      cevapAnahtariDahil: cevapAnahtari,
      analysisModel,
      synthesisModel,
      concurrency,
      chunkSize,
      outputDir: outputDir.trim() || undefined,
      files: [
        ...toInput("slaytlar", slaytlar),
        ...toInput("cikmis-sorular", cikmis),
        ...toInput("el-notlari", elNotlari),
      ],
    });
    setRunning(false);
    if (res.ok && res.result) {
      setResult(res.result);
    } else {
      setError(res.error ?? "Bilinmeyen hata");
    }
  };

  return (
    <div className="app">
      <div className="topbar">
        <h1>Soru Tahmini</h1>
        <div className="topbar-right">
          {authMode && (
            <span className={`auth-pill ${authMode}`}>
              {authMode === "api-key"
                ? `API Key${authHint ? ` …${authHint}` : ""}`
                : "Abonelik"}
            </span>
          )}
          <button onClick={() => setShowKeyModal(true)}>Kimlik Doğrulama</button>
        </div>
      </div>

      <div className="main">
        <DropZone
          kind="slaytlar"
          title="Slayt Sunumları"
          desc="Dersin slayt PDF'lerini buraya ekle."
          files={slaytlar}
          onChange={setSlaytlar}
        />
        <DropZone
          kind="cikmis-sorular"
          title="Çıkmış Sorular"
          desc="Geçmiş dönem sınav PDF'leri."
          files={cikmis}
          onChange={setCikmis}
        />
        <DropZone
          kind="el-notlari"
          title="El Yazısı Notlar"
          desc="El notu PDF'leri (hoca vurguları tespit edilir)."
          files={elNotlari}
          onChange={setElNotlari}
        />

        <div className="controls">
          <label>
            Ders adı
            <input
              type="text"
              value={dersAdi}
              onChange={(e) => setDersAdi(e.target.value)}
              placeholder="ör. Olasılık ve İstatistik"
            />
          </label>
          <label>
            Soru sayısı
            <input
              type="number"
              min={1}
              max={100}
              value={soruSayisi}
              onChange={(e) => setSoruSayisi(Math.max(1, Math.min(100, Number(e.target.value))))}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={cevapAnahtari}
              onChange={(e) => setCevapAnahtari(e.target.checked)}
            />
            Cevap anahtarı dahil
          </label>
          <button className="start" onClick={start} disabled={!canStart}>
            {running ? "Çalışıyor..." : "Tahmin Sorularını Üret"}
          </button>
        </div>

        <div className="controls output-dir">
          <label style={{ gridColumn: "1 / -1" }}>
            Çıktı klasörü <span className="hint-inline">(boş bırakılırsa Masaüstü\Soru Tahmini'ne kaydedilir)</span>
            <div className="folder-row">
              <input
                type="text"
                value={outputDir}
                onChange={(e) => setOutputDir(e.target.value)}
                placeholder="ör. C:\Users\...\Desktop\Tahminler"
              />
              <button
                type="button"
                onClick={async () => {
                  const picked = await api().dialog.selectFolder();
                  if (picked) setOutputDir(picked);
                }}
              >
                Klasör Seç…
              </button>
              {outputDir && (
                <button type="button" className="reset" onClick={() => setOutputDir("")}>
                  Temizle
                </button>
              )}
            </div>
          </label>
        </div>

        <div className="controls models">
          <label>
            Analiz modeli
            <select
              value={analysisModel}
              onChange={(e) => setAnalysisModel(e.target.value)}
              title={MODEL_CHOICES.find((m) => m.id === analysisModel)?.description}
            >
              {MODEL_CHOICES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sentez & soru üretimi modeli
            <select
              value={synthesisModel}
              onChange={(e) => setSynthesisModel(e.target.value)}
              title={MODEL_CHOICES.find((m) => m.id === synthesisModel)?.description}
            >
              {MODEL_CHOICES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <div className="model-hint">
            {MODEL_CHOICES.find((m) => m.id === synthesisModel)?.description}
          </div>
        </div>

        <div className="advanced">
          <button
            className="advanced-toggle"
            onClick={() => setShowAdvanced((s) => !s)}
            type="button"
          >
            {showAdvanced ? "▾" : "▸"} Gelişmiş Ayarlar
          </button>
          {showAdvanced && (
            <div className="advanced-body">
              <label>
                Paralel job sayısı: <strong>{concurrency}</strong>
                <input
                  type="range"
                  min={1}
                  max={8}
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                />
                <span className="hint">
                  Birbirinden bağımsız dosyalar paralel analiz edilir. Yüksek değer daha hızlı
                  ama rate-limit'e takılma riskini artırır.
                </span>
              </label>
              <label>
                PDF chunk boyutu (sayfa): <strong>{chunkSize}</strong>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={5}
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                />
                <span className="hint">
                  Bu sayıdan uzun PDF'ler parçalanıp map-reduce ile analiz edilir. Küçük değer
                  daha güvenilir kalite (uzun bağlamda detay kaçmaz), büyük değer daha az çağrı
                  ve daha hızlı.
                </span>
              </label>
              <button
                type="button"
                className="reset"
                onClick={() => {
                  setConcurrency(DEFAULT_CONCURRENCY);
                  setChunkSize(DEFAULT_CHUNK_SIZE);
                }}
              >
                Varsayılana dön
              </button>
            </div>
          )}
        </div>

        <ProgressPanel progress={progress} log={log} />

        {result && (
          <div className="result">
            <strong>Hazır!</strong>
            <button onClick={() => api().shell.openPath(result.pdfPath)}>PDF'i Aç</button>
            <button
              className="open-folder"
              onClick={() => api().shell.showItemInFolder(result.pdfPath)}
            >
              Klasörü Aç
            </button>
          </div>
        )}

        {error && (
          <div className="result" style={{ background: "#fef2f2", borderColor: "#fecaca" }}>
            <strong style={{ color: "#b91c1c" }}>Hata:</strong>
            <span>{error}</span>
          </div>
        )}
      </div>

      {showKeyModal && (
        <ApiKeyModal
          canDismiss={authReady === true}
          onDismiss={() => setShowKeyModal(false)}
          onDone={async () => {
            await refreshAuth();
            setShowKeyModal(false);
          }}
        />
      )}
    </div>
  );
}
