@echo off
chcp 65001 >nul
title Divian — LAN próba (HTTP 8080 + forwarder 17321)
cd /d "%~dp0"

echo.
echo  === Divian LAN próba ===
echo  1) Windows tűzfal: engedélyezd a bejövő TCP 8080 és 17321 portot (ha másik gépről nyitják).
echo  2) Ez a gép legyen bekapcsolva; a kollégák ugyanazon a Wi-Fi / irodai hálózaton legyenek.
echo.

set "LANIP="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "try { $x = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Sort-Object InterfaceMetric | Select-Object -First 1 -ExpandProperty IPAddress; if ($x) { $x } } catch { '' }"`) do set "LANIP=%%A"
if defined LANIP (
  echo  Másik gép böngészője (ugyanazon a LAN-on^):
  echo    http://%LANIP%:8080/arajanlat.html
) else (
  echo  IPv4: futtasd az ipconfig-ot, és a 192.168.x.x / 10.x címet használd:
  echo    http://TE_IP-d:8080/arajanlat.html
)
echo.
echo  Indul: statikus kiszolgáló (8080^) + forwarder (17321, minden interfész^).
echo  Leállítás: mindkét ablakban Ctrl+C.
echo.

start "Divian HTTP 8080" cmd /k "cd /d "%~dp0" && echo Ctrl+C = HTTP szerver leállítása. && npx --yes serve -l 8080 ."
timeout /t 5 /nobreak >nul

set SCREENSHOT_API_HOST=0.0.0.0
node "%~dp0divian-playwright-forwarder.js"
if errorlevel 1 pause
