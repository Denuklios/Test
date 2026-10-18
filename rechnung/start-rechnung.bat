@echo off
REM RechnungsStudio starten - Windows (Doppelklick)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ist nicht installiert. Bitte von https://nodejs.org die LTS-Version installieren und dann erneut starten.
  pause
  exit /b 1
)
echo === RechnungsStudio ===
echo Laeuft unter http://localhost:8090 - zum Beenden dieses Fenster schliessen.
start "" "http://localhost:8090"
node --no-warnings server.js
pause
