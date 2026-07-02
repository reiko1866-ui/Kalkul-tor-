@echo off
chcp 65001 >nul
title Divian — központi szerver
cd /d "%~dp0"

echo.
echo  === Divian KÖZPONTI SZERVER ===
echo  Minden adat egy helyen — böngészőből elérhető (LAN / domain).
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  HIBA: Node.js nincs telepitve.
  pause
  exit /b 1
)

for /f "delims=" %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if defined NODE_MAJOR if %NODE_MAJOR% LSS 18 (
  echo  FIGYELMEZETES: Node.js 18+ ajanlott ^(most: 
  node -v
  echo  ^). Frissites: https://nodejs.org/
  echo.
)

if not exist "%~dp0config\szerver.env" (
  if exist "%~dp0config\szerver.env.example" (
    echo  Elso inditas: config\szerver.env letrehozasa...
    copy /Y "%~dp0config\szerver.env.example" "%~dp0config\szerver.env" >nul
    echo  Szerkeszd: config\szerver.env  ^(DIVIAN_PUBLIC_URL, adatmappak^)
    echo.
  )
)

set "DIVIAN_SERVER_MODE=1"

node "%~dp0tools\init-server-data.js"
node "%~dp0tools\free-port-17321.js" >nul 2>&1

echo.
echo  Szerver indul — NE zarjad be ezt az ablakot.
echo  Helyi: http://localhost:17321/dashboard.html
echo  Tavoli (100 km): inditas-szerver-tavoli.bat  ^(https link^)
echo  Leallitas: Ctrl+C
echo.

node "%~dp0divian-static-server.js"
pause
