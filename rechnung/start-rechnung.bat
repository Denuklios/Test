@echo off
REM RechnungsStudio starten - Windows (Doppelklick)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ist nicht installiert. Bitte von https://nodejs.org die LTS-Version installieren und dann erneut starten.
  pause
  exit /b 1
)
if not exist node_modules\@anthropic-ai\sdk (
  echo Einmalige Einrichtung ^(Belegerkennung^) ...
  call npm install --omit=dev --no-audit --no-fund
)
echo === RechnungsStudio ===
set HANDY=
set /p HANDY=Handy-Zugang einschalten (Belege mit dem Handy im selben WLAN fotografieren)? [j/N] 
if /i "%HANDY%"=="j" (
  set /p PASSWORD=Passwort fuer den Zugang ^(mind. 6 Zeichen, Benutzername beliebig^): 
  set HOST=0.0.0.0
  echo Die Adresse fuers Handy steht im Programm unter Einstellungen ^(mit QR-Code^).
  echo Windows fragt evtl. nach der Firewall - bitte fuer "Private Netzwerke" erlauben.
)
echo Laeuft unter http://localhost:8090 - zum Beenden dieses Fenster schliessen.
start "" "http://localhost:8090"
node --no-warnings server.js
pause
