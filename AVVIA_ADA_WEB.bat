@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title A.D.A. Web - Avvio locale

set "ADA_PORT=5173"
set "ADA_URL=http://127.0.0.1:%ADA_PORT%/ADA-web/"

echo ============================================================
echo   A.D.A. WEB - ANONIMIZZATORE DOCUMENTI AUTONOMO
echo   Avvio locale - nessun documento viene caricato online
echo ============================================================
echo.

where node.exe >nul 2>&1
if errorlevel 1 goto :NO_NODE
where npm.cmd >nul 2>&1
if errorlevel 1 goto :NO_NODE

for /f "tokens=*" %%V in ('node --version') do set "NODE_VERSION=%%V"
echo [OK] Node.js rilevato: !NODE_VERSION!

rem Vite 7 richiede Node 20.19+ oppure 22.12+.
for /f "tokens=1,2 delims=." %%A in ("!NODE_VERSION:v=!") do (
    set "NODE_MAJOR=%%A"
    set "NODE_MINOR=%%B"
)
if !NODE_MAJOR! LSS 20 goto :OLD_NODE
if !NODE_MAJOR! EQU 20 if !NODE_MINOR! LSS 19 goto :OLD_NODE
if !NODE_MAJOR! EQU 21 goto :OLD_NODE
if !NODE_MAJOR! EQU 22 if !NODE_MINOR! LSS 12 goto :OLD_NODE

if not exist "package.json" goto :BROKEN

if not exist "node_modules\" (
    echo.
    echo [1/2] Prima configurazione: installazione componenti locali...
    echo       Questa operazione usa Internet SOLO per scaricare le librerie
    echo       dell'app. I documenti dell'utente non vengono inviati online.
    echo.
    call npm install
    if errorlevel 1 goto :NPM_ERROR
) else (
    echo [OK] Componenti locali gia presenti.
)

echo.
echo [2/2] Avvio di A.D.A. Web...
echo.
echo PC:         %ADA_URL%
echo Smartphone: usa l'indirizzo Network mostrato qui sotto,
echo             con telefono e PC collegati alla stessa rete Wi-Fi.
echo.
echo Per arrestare A.D.A. Web: premi CTRL+C in questa finestra.
echo ============================================================
echo.

rem Apertura browser robusta: PowerShell evita gli errori di quoting di START/CMD.
start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%ADA_URL%'"
call npm run dev -- --port %ADA_PORT% --strictPort
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    echo [ERRORE] A.D.A. Web si e arrestato con codice %EXITCODE%.
    echo Se la porta %ADA_PORT% e gia occupata, chiudi eventuali altre istanze.
    pause
)
exit /b %EXITCODE%

:NO_NODE
echo [ERRORE] Node.js / npm non sono installati o non sono nel PATH.
echo.
echo Installa una versione LTS moderna di Node.js dal sito ufficiale:
echo https://nodejs.org/
echo.
pause
exit /b 1

:OLD_NODE
echo.
echo [ERRORE] Versione Node.js non compatibile: !NODE_VERSION!
echo A.D.A. Web richiede Node.js 20.19+ oppure 22.12+.
echo Aggiorna Node.js e riprova.
echo.
pause
exit /b 1

:BROKEN
echo [ERRORE] package.json non trovato.
echo Mantieni questo file .bat nella cartella principale di A.D.A. Web.
echo.
pause
exit /b 1

:NPM_ERROR
echo.
echo [ERRORE] Installazione delle dipendenze non riuscita.
echo Controlla la connessione Internet e riprova.
echo Nessun documento e stato caricato online.
echo.
pause
exit /b 1

