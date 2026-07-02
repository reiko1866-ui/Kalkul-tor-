@echo off
title Divian teszt + Cyncly tervezo (helyi bizonylat)
cd /d "%~dp0"

echo.
echo  Divian Kalkulator - TESZT + Cyncly tervezo (egy Chrome ablak)
echo  Mappa: %CD%
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

set "SZAMLAZZ_LOCAL_ONLY=1"
set "SZAMLAZZ_USE_MARDOHOME_SELLER=1"
set "SZAMLAZZ_USE_DEMO=0"
set "SZAMLAZZ_USE_SANDBOX=false"
set "DIVIAN_PLAYWRIGHT_NO_CHANNEL=0"
set "DIVIAN_PLAYWRIGHT_CHANNEL=chrome"
set "DIVIAN_FAST_START=1"

node "%~dp0tools\free-port-17321.js" >nul 2>&1
timeout /t 1 /nobreak >nul

echo  Bizonylat: helyi HTML (Szamlazz API nelkul)
echo  Cyncly: a telepitett Google Chrome-ot hasznaljuk
echo  (Ha nincs Chrome: https://google.com/chrome )
echo  Indulo lapok (3 db):
echo    - Parancspult + Cyncly: http://localhost:17321/dashboard.html
echo    - Arajanlat:            http://localhost:17321/arajanlat.html
echo    - Szamla elokeszito:    http://localhost:17321/szamla-eloreszlet.html
echo  Kozponti vezerlopult: http://localhost:17321/admin-center.html
echo  Arajanlat (kozvetlen): http://localhost:17321/arajanlat.html
echo.
echo  FONTOS: ezt az ablakot NE zard be - futnia kell a hatterben.
echo  Leallitas: Ctrl+C
echo.

node "%~dp0divian-playwright-forwarder.js"
set "SERVER_EXIT=%ERRORLEVEL%"

echo.
if "%SERVER_EXIT%"=="0" (
  echo  A szerver leallt.
) else (
  echo  HIBA: a szerver leallt (kod %SERVER_EXIT%^).
  echo  Ha Chromium/Chrome hiba: telepits Google Chrome-t, vagy install-playwright-browsers.bat
  echo  Probald: leallitas-17321.bat majd ujra inditas-teszt-tervezo.bat
)
echo.
pause
exit /b %SERVER_EXIT%
