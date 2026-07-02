@echo off
chcp 65001 >nul
title Divian — parancsikon létrehozása
cd /d "%~dp0"
echo.
echo  Asztali parancsikon + Divian ikon készítése...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create-divian-launcher-icon.ps1"
if errorlevel 1 (
  echo.
  echo  Hiba történt. Ha „running scripts is disabled” üzenet jön,
  echo  futtasd egyszer: install-fuggosegek.bat
  echo.
  pause
  exit /b 1
)
echo.
pause
