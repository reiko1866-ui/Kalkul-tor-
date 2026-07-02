@echo off
title Divian — kuldendo csomag keszitese
cd /d "%~dp0"
echo.
echo  Telepito csomag keszitese a nagy gephez...
echo  Kimenet: Asztal\kuldendo-nagygep\
echo.
node "%~dp0tools\build-deploy-bundle.js"
if errorlevel 1 (
  echo.
  echo  HIBA a csomag keszitese kozben.
  pause
  exit /b 1
)
echo.
echo  Kesz. Masold at az egesz kuldendo-nagygep mappat USB-re vagy halozatra.
echo.
pause
