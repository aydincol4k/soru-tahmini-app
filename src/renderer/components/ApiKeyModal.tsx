import React, { useEffect, useState } from "react";
import { api } from "../api";
import type { AuthMode, AuthStatus } from "../../shared/types";

interface Props {
  onDone: () => void;
  canDismiss?: boolean;
  onDismiss?: () => void;
}

export function ApiKeyModal({ onDone, canDismiss, onDismiss }: Props) {
  const [tab, setTab] = useState<AuthMode>("api-key");
  const [status, setStatus] = useState<AuthStatus | null>(null);

  // API key tab state
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    const s = await api().auth.status();
    setStatus(s);
    if (s.mode) setTab(s.mode);
  };

  useEffect(() => {
    refresh();
  }, []);

  const submitApiKey = async () => {
    setErr(null);
    setBusy(true);
    const res = await api().apiKey.save(key.trim());
    if (!res.ok) {
      setBusy(false);
      setErr(res.error ?? "Bilinmeyen hata");
      return;
    }
    // Modu da api-key yap (backend zaten ilk seferde otomatik yapıyor ama açık kontrol)
    await api().auth.setMode("api-key");
    setBusy(false);
    setKey("");
    onDone();
  };

  const removeKey = async () => {
    setErr(null);
    setBusy(true);
    await api().apiKey.remove();
    setBusy(false);
    setKey("");
    await refresh();
  };

  const useSubscription = async () => {
    setErr(null);
    setBusy(true);
    const res = await api().auth.setMode("subscription");
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? "Abonelik aktive edilemedi");
      await refresh();
      return;
    }
    onDone();
  };

  const recheckSubscription = async () => {
    setBusy(true);
    await api().auth.checkSubscription();
    await refresh();
    setBusy(false);
  };

  const useApiKey = async () => {
    setErr(null);
    setBusy(true);
    const res = await api().auth.setMode("api-key");
    setBusy(false);
    if (!res.ok) {
      setErr(res.error ?? "API Key modu seçilemedi");
      return;
    }
    onDone();
  };

  if (!status) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <p>Yükleniyor…</p>
        </div>
      </div>
    );
  }

  const subActive = status.mode === "subscription";
  const apiActive = status.mode === "api-key";
  const subExists = status.subscription.credentialsFileExists;
  const hasKey = status.apiKey.hasKey;
  const hint = status.apiKey.hint;

  return (
    <div className="modal-overlay">
      <div className="modal modal-wide">
        <h2>Kimlik Doğrulama Modu</h2>
        {status.mode && (
          <div className={`active-mode-badge ${status.mode}`}>
            Şu an aktif:{" "}
            <strong>
              {status.mode === "api-key"
                ? `API Key${hint ? ` (…${hint})` : ""}`
                : "Claude Code Aboneliği"}
            </strong>
          </div>
        )}

        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === "api-key" ? "active" : ""}`}
            onClick={() => setTab("api-key")}
            type="button"
          >
            API Key
            {hasKey && <span className="badge ok">kayıtlı</span>}
          </button>
          <button
            className={`auth-tab ${tab === "subscription" ? "active" : ""}`}
            onClick={() => setTab("subscription")}
            type="button"
          >
            Claude Code Aboneliği
            {subExists ? (
              <span className="badge ok">hazır</span>
            ) : (
              <span className="badge warn">login gerek</span>
            )}
          </button>
        </div>

        {tab === "api-key" && (
          <div className="auth-pane">
            <p>
              Anthropic Console'dan aldığın API key'i gir. Kullanım API kredinden
              düşer. Key cihazında safeStorage ile şifreli saklanır, hiçbir sunucuya
              gönderilmez.
            </p>
            {hasKey && hint && (
              <div className="key-current">
                <span className="key-label">Kayıtlı key:</span>
                <code className="key-mask">…{hint}</code>
                <button
                  type="button"
                  className="toggle danger"
                  onClick={removeKey}
                  disabled={busy}
                >
                  Sil
                </button>
              </div>
            )}
            <div className="row">
              <input
                type={show ? "text" : "password"}
                placeholder={hasKey ? "Yeni key (sk-ant-...)" : "sk-ant-..."}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoFocus
              />
              <button type="button" className="toggle" onClick={() => setShow((s) => !s)}>
                {show ? "Gizle" : "Göster"}
              </button>
            </div>
            <a
              href="https://console.anthropic.com/settings/keys"
              onClick={(e) => {
                e.preventDefault();
                window.open("https://console.anthropic.com/settings/keys", "_blank");
              }}
            >
              Anthropic Console'dan key al →
            </a>
            {err && <div className="error">{err}</div>}
            <div className="actions">
              {canDismiss && (
                <button onClick={onDismiss} disabled={busy}>
                  Kapat
                </button>
              )}
              {hasKey && !apiActive && (
                <button
                  type="button"
                  className="primary"
                  onClick={useApiKey}
                  disabled={busy}
                >
                  Bu modu kullan
                </button>
              )}
              <button
                className="primary"
                onClick={submitApiKey}
                disabled={busy || key.length < 10}
              >
                {busy ? "Doğrulanıyor..." : hasKey ? "Yeni Key'i Kaydet" : "Kaydet ve Doğrula"}
              </button>
            </div>
          </div>
        )}

        {tab === "subscription" && (
          <div className="auth-pane">
            <p>
              Claude Code Pro/Max aboneliğin varsa kullanımı API kredisi yerine
              abonelik kotandan harcanır.{" "}
              <strong>Bu modu kullanmak için bir terminalde önce Claude Code'a giriş yapmış olman gerek.</strong>
            </p>
            {subExists ? (
              <div className="sub-status ok">
                ✅ Claude Code'da giriş yapılmış (
                <code>~/.claude/.credentials.json</code> bulundu).
                {subActive
                  ? " Şu an bu mod aktif."
                  : " Aktive etmek için aşağıdaki butona bas."}
              </div>
            ) : (
              <div className="sub-status warn">
                ⚠️ Claude Code oturumu bulunamadı.
                <ol>
                  <li>
                    Bir terminal aç (PowerShell, cmd vb. — admin değil).
                  </li>
                  <li>
                    <code>claude /login</code> komutunu çalıştır.
                  </li>
                  <li>
                    Tarayıcıda Anthropic hesabınla giriş yap (Pro/Max abonelik gerekir).
                  </li>
                  <li>Buraya dön ve "Tekrar Kontrol Et"e bas.</li>
                </ol>
              </div>
            )}
            {err && <div className="error">{err}</div>}
            <div className="actions">
              {canDismiss && (
                <button onClick={onDismiss} disabled={busy}>
                  Kapat
                </button>
              )}
              <button type="button" onClick={recheckSubscription} disabled={busy}>
                Tekrar Kontrol Et
              </button>
              {subExists && !subActive && (
                <button
                  type="button"
                  className="primary"
                  onClick={useSubscription}
                  disabled={busy}
                >
                  {busy ? "Aktive ediliyor…" : "Bu modu kullan"}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
