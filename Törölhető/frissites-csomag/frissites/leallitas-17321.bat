@echo off
chcp 65001 >nul
title Divian — 17321 port felszabadítása
cd /d "%~dp0"
echo.
echo  A 17321-es porton futó régi Divian szerver leállítása…
echo.
node "%~dp0tools\free-port-17321.js"
echo.
pause
