@echo off
title Divian - helyi visszaallitas
cd /d "%~dp0"
echo.
echo  Visszaallitjuk a helyi (nem szerveres) allapotot a frissites/ mentesbol.
echo.
pause
node "%~dp0tools\vissza-allitas-helyi.js"
echo.
echo  Kesz. Inditsd: INDITAS.bat
echo.
pause
