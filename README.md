# Soru Tahmini

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-31-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Slayt sunumları + çıkmış sorular + el yazısı notlardan, Claude Agent SDK ile sınavda çıkması olası soruları tahmin edip **PDF** çıktısı veren Electron masaüstü uygulaması. Mac ve Windows'ta çalışır.

## Özellikler

- **3 girdi türü:** slayt PDF'leri, çıkmış sınav PDF'leri, el yazısı not PDF'leri (drag-drop)
- **5 adımlı pipeline:** çıkmış soru analizi → slayt konu haritası → el notu vurgu haritası → sentez → soru üretimi
- **İstediğin kadar soru:** kullanıcıdan N alınır, Claude bu sayıda özgün soru üretir
- **PDF çıktı:** `pdfkit` ile düzgün biçimli, opsiyonel cevap anahtarlı PDF
- **Uzun PDF'lerde map-reduce chunking:** ayarlanabilir chunk boyutu (varsayılan 20 sayfa)
- **İki auth modu:** Anthropic API key (`safeStorage` ile şifreli) **veya** Claude Code aboneliği (Pro/Max OAuth oturumu)
- **Paralel bağımsız job'lar:** slayt + el notu + çıkmış soru analizleri aynı anda
- **Streaming progress:** aşama, yüzde ve canlı log

## Geliştirme

```bash
git clone https://github.com/aydincol4k/soru-tahmini-app.git
cd soru-tahmini-app
npm install
npm run dev       # renderer (Vite) + main (tsc -w) paralel başlatır
npm start         # Electron pencereyi aç
```

İlk açılışta auth modu sorulur:

1. **Anthropic API key (kullandıkça öde)** — [console.anthropic.com](https://console.anthropic.com) üzerinden alınır. Cihaza özel olarak Electron `safeStorage` ile şifrelenip saklanır, repo'ya **gönderilmez**.
2. **Claude Code aboneliği (Pro/Max)** — Sistemde Claude Code CLI kuruluysa (`~/.claude/.credentials.json`) uygulama bu OAuth oturumunu kullanır. **Ekstra API ücreti yok**, mevcut Claude.ai aboneliğinin limiti dahilinde çalışır. Bir kez terminalde `claude` çalıştırıp giriş yapmış olman yeterli.

İki mod arasında uygulama içinden istediğin zaman geçiş yapabilirsin.

## Paketleme

**Lokal build** (kendi platformun için):

```bash
npm run dist         # Mevcut platforma göre
npm run dist:mac     # .dmg (yalnızca macOS'ta)
npm run dist:win     # .exe (NSIS, yalnızca Windows'ta veya wine ile Linux'ta)
```

**Release — GitHub Actions + manuel Windows:**

`.github/workflows/release.yml` tanımlı. Kullanım:

```bash
git tag v0.1.0
git push --tags
```

Workflow otomatik olarak macOS runner'da `.dmg` üretip GitHub Release sayfasına yükler. `workflow_dispatch` ile manuel de tetiklenebilir.

> **Windows .exe CI'da üretilmiyor.** `pdfjs-dist`'in alt bağımlılığı `canvas`
> paketi GitHub Actions Windows runner'ında native compile edilemiyor
> (MSBuild + node-gyp uyumsuzluğu). Yerel makinede Visual Studio Build Tools
> mevcut olduğu için sorunsuz build alınabilir. Yeni bir release için akış:
>
> ```bash
> # 1. Tag at -> CI macOS .dmg'yi otomatik release'e atar
> git tag v0.2.1 && git push --tags
>
> # 2. Yerel olarak Windows installer'i uret
> npm install
> npm run dist:win
> # release\Soru Tahmini Setup 0.2.1.exe ciktisi
>
> # 3. Olusan .exe'yi release'e ekle
> gh release upload v0.2.1 "release/Soru Tahmini Setup 0.2.1.exe"
> ```

> **macOS Intel desteği yok.** GitHub'ın `macos-latest` runner'ı artık
> Apple Silicon (arm64). Intel Mac için yerel `npm run dist:mac` çalıştırılabilir.

> **İmzasız build uyarıları:**
> - macOS: "doğrulanmamış geliştirici" uyarısı → Sistem Ayarları → Gizlilik ve Güvenlik → "Yine de aç"
> - Windows: SmartScreen "bilinmeyen yayıncı" → "More info" → "Run anyway"
> - Kod imzası almak istersen `CSC_LINK` + `CSC_KEY_PASSWORD` secret'larını ekleyip workflow'daki `CSC_IDENTITY_AUTO_DISCOVERY` satırını kaldır.

## Dizin

```
<userData>/workspaces/<ders>/
  inputs/              # kullanıcı dosyaları kopyalanır
  intermediate/        # sayfa PNG'leri, chunk JSON'ları, cache
  outputs/
    01-cikmis-soru-analizi.(md|json)
    02-slayt-konu-haritasi/
    03-el-notu-konu-haritasi/
    04-sentez.json
    05-tahmin-sorulari.(md|json|pdf)
```

## Model Seçimi

Uygulama içinden **analiz modeli** ve **sentez & soru üretimi modeli** ayrı ayrı seçilebilir:

- **Claude Opus 4.7** (varsayılan, en güncel, en kaliteli)
- **Claude Sonnet 4.6** (dengeli)
- **Claude Haiku 4.5** (hızlı)

Varsayılan olarak her iki adımda da Opus 4.7 seçilidir. Maliyeti azaltmak istersen analiz modelini Sonnet/Haiku'ya düşürüp sentez + soru üretimini Opus'ta tutabilirsin.

## Ortam Değişkenleri

- `ANTHROPIC_MAX_PAGES_PER_CHUNK` — uzun PDF chunk boyutu (varsayılan 20)

## Katkı

Issue ve pull request'ler hoş karşılanır. Büyük değişiklikler için önce bir issue açıp tartışmak iyi olur.

## Lisans

[MIT](https://opensource.org/licenses/MIT) — özgürce kullanabilir, değiştirebilir ve dağıtabilirsin.
