@echo off
setlocal
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo Bitte Node.js 24.17 oder neuer inklusive npm von https://nodejs.org installieren.
  pause
  exit /b 1
)
call npm ci --ignore-scripts
if errorlevel 1 (
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo .env wird geoeffnet. Trage deinen Discord-Bot-Token ein. Die Application ID wird erkannt.
  echo Aktiviere Message Content Intent und Server Members Intent im Discord Developer Portal.
  echo Speichere die Datei und schliesse den Editor, bevor du fortfaehrst.
  start /wait notepad.exe .env
)
call npm run deploy
if errorlevel 1 (
  pause
  exit /b 1
)
echo Fertig. Nutze den Einladungslink oben und starte dann START.cmd.
pause
