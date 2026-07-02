@echo off
title Divian szerver őr (17321 health)
cd /d "%~dp0.."
echo.
echo  Figyeli: http://localhost:17321/health
echo  Ha 3x nem valaszol, figyelmeztet.
echo  Automatikus ujrainditas: set DIVIAN_WATCHDOG_AUTO_RESTART=1
echo.
node "%~dp0divian-server-watchdog.js"
pause
