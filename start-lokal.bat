@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ist nicht installiert. Bitte von https://nodejs.org die "LTS"-Version installieren (mindestens Version 22.13^), dann diese Datei erneut starten.
  pause
  exit /b 1
)
node -e "const[a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo Deine Node.js-Version ist zu alt. Bitte von https://nodejs.org die aktuelle LTS-Version installieren (mindestens 22.13^).
  pause
  exit /b 1
)
echo.
echo === StickStudio lokal starten (Online-Version mit Anmeldung und Verwaltung) ===
echo.
set /p ADMIN_EMAIL=Deine E-Mail (das wird dein Admin-Login): 
set /p ADMIN_PASSWORD=Dein Passwort (mindestens 10 Zeichen): 
set PORT=8080
set BASE_URL=http://localhost:8080
set DATA_DIR=%~dp0data
set GEOIP=off
echo.
echo Starte... Der Browser oeffnet sich gleich. Zum Beenden dieses Fenster schliessen.
echo Verwaltung: http://localhost:8080/admin
start "" "http://localhost:8080/login"
node --no-warnings server\server.js
pause
