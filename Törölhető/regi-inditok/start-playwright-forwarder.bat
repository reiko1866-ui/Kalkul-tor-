@echo off
title Divian Playwright forwarder (17321)
cd /d "%~dp0"
echo.
echo  Mappa: %CD%
echo.
echo  Ha Chrome exitCode=21 vagy port foglalt: hasznald az inditas-teszt.bat-ot
echo  ^(Playwright nelkul, Szamlazz sandbox + tervezo + arajanlat megnyitasa^).
echo.
node "%~dp0tools\free-port-17321.js" >nul 2>&1
timeout /t 1 /nobreak >nul
echo.
echo  Megnyilik EGY Chrome ablakban:
echo    - bal: Cyncly tervezo
echo    - jobb: arajanlat / megrendelo
echo    http://localhost:17321/dashboard.html
echo.
echo  NE nyisd meg kozvetlenul a file:/// arajanlat.html-t — a mikrofon
echo  minden kerdesnel ujra engedelyt ker!
echo.
echo  Csak arajanlat (forwarder fut): http://localhost:17321/arajanlat.html
echo.
node "%~dp0divian-playwright-forwarder.js"
if errorlevel 1 pause
