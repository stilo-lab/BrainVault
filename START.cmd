@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Bitte Node.js 24.17 oder neuer von https://nodejs.org installieren.
  pause
  exit /b 1
)
if not exist .env (
  echo Bitte zuerst SETUP.cmd ausfuehren und .env ausfuellen.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Bitte zuerst SETUP.cmd ausfuehren.
  pause
  exit /b 1
)
call npm start
pause
