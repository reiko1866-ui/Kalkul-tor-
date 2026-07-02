"use strict";

const fs = require("fs");

const path = require("path");



const content = `@echo off

chcp 65001 >nul

title Divian - tavoli fo szerver

cd /d "%~dp0"



echo.

echo  === Divian TAVOLI FO SZERVER ===

echo  Kozponti szerver + https link. Tervezeshez: INDITAS.bat

echo.



where node >nul 2>&1

if errorlevel 1 goto :no_node



for /f "tokens=1 delims=." %%a in ('node -p "process.versions.node.split('.')[0]" 2^>nul') do set NODE_MAJOR=%%a

if not defined NODE_MAJOR set NODE_MAJOR=0

if %NODE_MAJOR% LSS 18 goto :old_node



if not exist "%~dp0config\\szerver.env" (

  if exist "%~dp0config\\szerver.env.example" (

    copy /Y "%~dp0config\\szerver.env.example" "%~dp0config\\szerver.env" >nul

  )

)



set "DIVIAN_SERVER_MODE=1"



node "%~dp0tools\\divian-remote-server.js"

set "DIVIAN_EXIT=%ERRORLEVEL%"



if not "%DIVIAN_EXIT%"=="0" goto :failed



echo.

echo  A szerver leallt. Nyomj Entert az ablak bezarasahoz...

pause >nul

exit /b 0



:no_node

echo.

echo  HIBA: Node.js nincs telepitve. https://nodejs.org/

pause

exit /b 1



:old_node

echo.

echo  HIBA: Node.js 18+ kell. Jelenlegi:

node -v

echo.

pause

exit /b 1



:failed

echo.

echo  HIBA: A tavoli szerver nem indult el. Kod: %DIVIAN_EXIT%

echo  Gyakori ok: 17321-es port foglalt - zard be a masik Divian ablakot

echo  Tervezes: INDITAS.bat  ^(nem egyszerre a tavoli szerverrel^)

echo.

pause >nul

exit /b %DIVIAN_EXIT%

`;



const out = path.join(__dirname, "..", "inditas-szerver-tavoli.bat");

fs.writeFileSync(out, content.replace(/\n/g, "\r\n"), "latin1");

console.log("Wrote", out);

