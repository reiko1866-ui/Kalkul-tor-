@echo off
title Divian — Playwright Chrome
cd /d "%~dp0"
echo.
echo  Mappa: %CD%
if not exist node_modules (
  echo.
  echo  Eloszor futtasd: install-fuggosegek.bat
  pause
  exit /b 1
)
echo.
echo  Playwright Chrome telepitese (egyszer, 1-3 perc)...
call npx.cmd playwright install chrome
if errorlevel 1 (
  echo.
  echo  HIBA a Playwright telepites soran.
  pause
  exit /b 1
)
echo.
echo  Kesz. Inditas: inditas-teszt-tervezo.bat  (vagy start-playwright-forwarder.bat)
echo.
pause
