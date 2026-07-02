@echo off
chcp 65001 >nul
title Divian — Windows tűzfal (17321)
cd /d "%~dp0.."

net session >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Futtasd UAC-kent ^(jobb klikk -^> Futtatas rendszergazdakent^)!
  echo.
  pause
  exit /b 1
)

echo.
echo  Bejovo TCP 17321 engedelyezese (Divian helyi szerver)...
netsh advfirewall firewall delete rule name="Divian Kalkulator 17321" >nul 2>&1
netsh advfirewall firewall add rule name="Divian Kalkulator 17321" dir=in action=allow protocol=TCP localport=17321
if errorlevel 1 (
  echo  HIBA: tuzfal szabaly nem keszult.
  pause
  exit /b 1
)

echo  Kesz. Masik gep / internet: http://TE_IP:17321/arajanlat.html
echo.
pause
