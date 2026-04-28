@echo off
REM Admin yetkisi olmadan calisir; sürükle-bırak çalışsın diye Explorer
REM tarafından açıldığında MediumIL'e düşer. Production-build (packaged renderer)
REM çalıştırır — Vite dev server gerektirmez.
cd /d "%~dp0"
if exist "release\win-unpacked\Soru Tahmini.exe" (
  start "" "release\win-unpacked\Soru Tahmini.exe"
) else (
  echo release\win-unpacked yok; once 'npm run dist:win' calistir.
  pause
)
