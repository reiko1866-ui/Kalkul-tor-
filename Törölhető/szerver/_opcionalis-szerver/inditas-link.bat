@echo off
chcp 65001 >nul
title Divian — nyilvános link
cd /d "%~dp0"

echo.
echo  === Divian NYILVANOS LINK ===
echo  Egy ablak: szerver + internetes tunnel + https link
echo  (A valami-random.loca.lt csak pelda volt — a tenyleges link itt jelenik meg.)
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  HIBA: Node.js nincs telepitve. https://nodejs.org/
  pause
  exit /b 1
)

if not exist "%~dp0node_modules\localtunnel" (
  echo  Fuggosegek telepitese (elso alkalommal)...
  call npm install
  if errorlevel 1 (
    echo  HIBA: npm install sikertelen.
    pause
    exit /b 1
  )
)

node "%~dp0tools\free-port-17321.js"
echo.

node "%~dp0tools\divian-public-link.js"
echo.
pause
