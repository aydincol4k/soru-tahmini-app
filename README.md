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
- **İlk açılışta API key onboarding:** `safeStorage` ile şifreli saklama
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

İlk açılışta API key istenir; `console.anthropic.com` üzerinden alınabilir. API key cihaza özel olarak Electron `safeStorage` ile şifrelenip saklanır, repo'ya **gönderilmez**.

## Paketleme

**Lokal build** (kendi platformun için):

```bash
npm run dist         # Mevcut platforma göre
npm run dist:mac     # .dmg (yalnızca macOS'ta)
npm run dist:win     # .exe (NSIS, yalnızca Windows'ta veya wine ile Linux'ta)
```

**Release — GitHub Actions ile çapraz-platform otomatik build:**

`.github/workflows/release.yml` tanımlı. Kullanım:

```bash
git tag v0.1.0
git push --tags
```

Workflow otomatik olarak:
1. macOS runner'da `.dmg` üretir
2. Windows runner'da `.exe` üretir
3. İki dosyayı GitHub Release sayfasına yükler (tag adıyla)

GitHub → Releases sekmesinden kullanıcılar indirebilir. `workflow_dispatch`
ile manuel de tetiklenebilir (tag olmadan sadece artifact bırakır, release
oluşturmaz).

> **Not:** İmzasız build'de Mac kullanıcıları "doğrulanmamış geliştirici"
> uyarısı görür (Sistem Ayarları → Güvenlik'ten "yine de aç"). Windows'ta
> SmartScreen "bilinmeyen yayıncı" der ("More info" → "Run anyway"). Kod
> imzası almak istersen `CSC_LINK` + `CSC_KEY_PASSWORD` secret'larını ekleyip
> workflow'daki `CSC_IDENTITY_AUTO_DISCOVERY` satırını kaldır.

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
