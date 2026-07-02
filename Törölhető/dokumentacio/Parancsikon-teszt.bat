@echo off
chcp 65001 >nul
title Divian — teszt parancsikon létrehozása
cd /d "%~dp0"
echo.
echo  Asztali parancsikon: Divian Teszt (Számlázz sandbox)…
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-divian-teszt-icon.ps1"
if errorlevel 1 (
  echo.
  echo  Hiba történt. Futtasd egyszer: Parancsikon-letrehozasa.bat
  echo  ^(ikon generálás^), majd újra ezt a fájlt.
  echo.
  pause
  exit /b 1
)
echo.
pause
