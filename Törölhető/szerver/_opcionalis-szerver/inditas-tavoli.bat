@echo off
chcp 65001 >nul
title Divian — távoli elérés (0.0.0.0:17321)
cd /d "%~dp0"

echo.
echo  === Divian TÁVOLI ELÉRÉS ===
echo  A szerver minden hálózati címen hallgat (nem csak localhost).
echo  Más gépről: http://TE_IP_CIMED:17321/arajanlat.html
echo  Internetről: router porttovábbítás TCP 17321 + tűzfal engedély.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo  HIBA: Node.js nincs telepitve. https://nodejs.org/
  pause
  exit /b 1
)

set "DIVIAN_PUBLIC_ACCESS=1"
set "DIVIAN_BIND_HOST=0.0.0.0"
set "SZAMLAZZ_LOCAL_ONLY=1"
set "SZAMLAZZ_USE_MARDOHOME_SELLER=1"
set "SZAMLAZZ_USE_DEMO=0"
set "SZAMLAZZ_USE_SANDBOX=false"
set "DIVIAN_PLAYWRIGHT_NO_CHANNEL=1"
set "DIVIAN_FAST_START=1"
set "DIVIAN_OPEN_BROWSER=1"

node "%~dp0tools\free-port-17321.js" >nul 2>&1

echo  Tuzfal (egyszer, admin): tools\open-firewall-17321.bat
echo  Leallitas: Ctrl+C ebben az ablakban
echo.

node "%~dp0divian-static-server.js"
set "SERVER_EXIT=%ERRORLEVEL%"

echo.
if "%SERVER_EXIT%"=="0" (
  echo  A szerver leallt.
) else (
  echo  HIBA: a szerver leallt (kod %SERVER_EXIT%^).
  echo  Probald: leallitas-17321.bat majd ujra inditas-tavoli.bat
)
echo.
pause
exit /b %SERVER_EXIT%
