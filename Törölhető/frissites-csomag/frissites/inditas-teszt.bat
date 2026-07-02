@echo off

title Divian teszt inditas (helyi bizonylat)

cd /d "%~dp0"



echo.

echo  Divian Kalkulator - TESZT (helyi bizonylat, Szamlazz API nelkul)

echo  Mappa: %CD%

echo.



where node >nul 2>&1

if errorlevel 1 (

  echo  HIBA: Node.js nincs telepitve. https://nodejs.org/

  pause

  exit /b 1

)



set "SZAMLAZZ_LOCAL_ONLY=1"

set "SZAMLAZZ_USE_MARDOHOME_SELLER=1"

set "SZAMLAZZ_USE_DEMO=0"

set "SZAMLAZZ_USE_SANDBOX=false"

set "DIVIAN_PLAYWRIGHT_NO_CHANNEL=1"

set "DIVIAN_FAST_START=1"

set "DIVIAN_OPEN_PLANNER=1"

set "DIVIAN_OPEN_BROWSER=1"



node "%~dp0tools\free-port-17321.js" >nul 2>&1

cd /d "%~dp0"



echo  Bizonylat: helyi HTML (DB / SZL gombok) — nyomtatas / PDF mentes

echo  Cyncly ELO athozas: inditas-teszt-tervezo.bat (egy Chrome ablak)

echo  Cyncly LINK athozas: «Teljes projekt athozasa» + install-playwright-browsers.bat

echo  Eles Szamlazz API: SZAMLAZZ_LOCAL_ONLY=0 + szamlazz-agent-key.txt

echo  Parancspult: http://localhost:17321/dashboard.html
echo  Arajanlat (kozvetlen): http://localhost:17321/arajanlat.html

echo.

echo  FONTOS: ezt az ablakot NE zard be - futnia kell a hatterben.

echo  Leallitas: Ctrl+C

echo.



node "%~dp0divian-static-server.js"

set "SERVER_EXIT=%ERRORLEVEL%"



echo.

if "%SERVER_EXIT%"=="0" (

  echo  A szerver leallt.

) else (

  echo  HIBA: a szerver leallt (kod %SERVER_EXIT%^).

  echo  Probald: leallitas-17321.bat majd ujra inditas-teszt.bat

)

echo.

pause

exit /b %SERVER_EXIT%

