@echo off
chcp 65001 >nul
title Divian — távoli elérés + Cyncly tervező
cd /d "%~dp0"

echo.
echo  === Divian TÁVOLI ELÉRÉS + tervező ===
echo  A szerver minden hálózati címen hallgat (0.0.0.0:17321).
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  HIBA: Node.js nincs telepitve. https://nodejs.org/
  pause
  exit /b 1
)

if not exist "%~dp0node_modules\playwright" (
  echo  HIBA: Futtasd elobb: install-fuggosegek.bat
  pause
  exit /b 1
)

set "DIVIAN_PUBLIC_ACCESS=1"
set "DIVIAN_BIND_HOST=0.0.0.0"
set "SCREENSHOT_API_HOST=0.0.0.0"
set "SZAMLAZZ_LOCAL_ONLY=1"
set "SZAMLAZZ_USE_MARDOHOME_SELLER=1"
set "SZAMLAZZ_USE_DEMO=0"
set "SZAMLAZZ_USE_SANDBOX=false"
set "DIVIAN_PLAYWRIGHT_NO_CHANNEL=1"
set "DIVIAN_FAST_START=1"

node "%~dp0tools\free-port-17321.js" >nul 2>&1
timeout /t 1 /nobreak >nul

echo  Tuzfal (egyszer, admin): tools\open-firewall-17321.bat
echo  Indulo lapok: http://localhost:17321/arajanlat.html (masik gep: sajat IP)
echo  Leallitas: Ctrl+C
echo.

node "%~dp0divian-playwright-forwarder.js"
set "SERVER_EXIT=%ERRORLEVEL%"

echo.
if "%SERVER_EXIT%"=="0" (
  echo  A szerver leallt.
) else (
  echo  HIBA: a szerver leallt (kod %SERVER_EXIT%^).
)
echo.
pause
exit /b %SERVER_EXIT%
