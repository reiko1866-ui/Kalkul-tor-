@echo off
title Divian — Playwright Chromium (tervezo athozas)
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
echo  Playwright Chromium telepitese (egyszer, 1-3 perc)...
echo  Ez kell az inditas-teszt-tervezo.bat es a Cyncly athozashoz.
echo.
call npx.cmd playwright install chromium
if errorlevel 1 (
  echo.
  echo  HIBA a Playwright telepites soran.
  pause
  exit /b 1
)
echo.
echo  Kesz. Inditas: inditas-teszt-tervezo.bat
echo.
pause
