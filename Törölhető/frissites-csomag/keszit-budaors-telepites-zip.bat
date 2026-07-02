@echo off
title Budaors teljes telepites ZIP (fuggosegekkel)
cd /d "%~dp0"
echo.
echo  Divian — teljes csomag keszitese (node_modules benne)
echo.
if not exist node_modules (
  echo  Eloszor: install-fuggosegek.bat
  pause
  exit /b 1
)
node "%~dp0tools\prepare-budaors-telepites-zip.js"
if errorlevel 1 (
  echo.
  echo  HIBA.
  pause
  exit /b 1
)
echo.
echo  A ZIP a projekt mappaban van (DivianKalkulator-Budaors-telepites-*.zip)
echo.
pause
