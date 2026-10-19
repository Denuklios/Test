@echo off
rem Preisfinder auf dem eigenen Computer starten (Windows). Braucht Node.js 22 oder neuer.
cd /d "%~dp0"
where node >nul 2>nul || (echo Bitte zuerst Node.js installieren: https://nodejs.org & pause & exit /b 1)
start "" http://localhost:8090
node --no-warnings server.js
pause
