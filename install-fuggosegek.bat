@echo off

title Divian — fuggosegek + frissites

cd /d "%~dp0"

echo.

echo  Mappa: %CD%

if not exist package.json (

  echo.

  echo  HIBA: package.json nem talalhato. Rossz mappa?

  pause

  exit /b 1

)

where node >nul 2>&1

if errorlevel 1 (

  echo.

  echo  HIBA: Node.js nincs telepitve vagy nincs a PATH-on.

  echo  Toltsd le: https://nodejs.org/  majd inditsd ujra a gepet.

  pause

  exit /b 1

)

echo.

echo  npm install indul...

call npm.cmd install

if errorlevel 1 (

  echo.

  echo  HIBA az npm install soran.

  pause

  exit /b 1

)

if exist "%~dp0frissites\" (

  echo.

  echo  Frissites fajlok masolasa a frissites mappabol...

  node "%~dp0tools\apply-update.js"

  if errorlevel 1 (

    echo.

    echo  FIGYELMEZTETES: frissites masolas hibas lehet.

  )

) else (

  echo.

  echo  Nincs frissites mappa — csak npm install futott.

)

echo.

echo  Kesz.

echo  Ha uj programfajlok erkeztek: inditsd ujra a start-playwright-forwarder.bat-ot.

echo  Az arajanlat oldalon: Ctrl+F5

echo.

pause

