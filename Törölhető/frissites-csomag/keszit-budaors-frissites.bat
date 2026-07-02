@echo off
title Budaors frissites elokeszitese
cd /d "%~dp0"
echo.
echo  Divian — frissites/ csomag keszitese (Budaors)
echo.
node "%~dp0tools\prepare-frissites.js"
if errorlevel 1 (
  echo.
  echo  HIBA a csomag keszitese kozben.
  pause
  exit /b 1
)
echo.
echo  Kesz. A frissites\ mappa tartalmat vidd a Budaors gepre,
echo  majd futtasd: install-fuggosegek.bat
echo.
pause
