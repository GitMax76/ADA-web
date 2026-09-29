@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title A.D.A. Web - Preparazione ambiente

echo ============================================================
echo   A.D.A. WEB - PREPARAZIONE AMBIENTE
echo ============================================================
echo.

where node.exe >nul 2>&1 || goto :NO_NODE
where npm.cmd >nul 2>&1 || goto :NO_NODE

node --version
npm --version

echo.
echo Installazione / aggiornamento dipendenze...
call npm install
if errorlevel 1 goto :ERR

echo.
echo Verifica build di produzione...
call npm run build
if errorlevel 1 goto :ERR

echo.
echo ============================================================
echo [OK] Ambiente pronto e build completata.
echo Puoi avviare A.D.A. Web con AVVIA_ADA_WEB.bat
echo ============================================================
echo.
pause
exit /b 0

:NO_NODE
echo [ERRORE] Node.js / npm non trovati.
echo Installa Node.js LTS da https://nodejs.org/ e riprova.
echo.
pause
exit /b 1

:ERR
echo.
echo [ERRORE] Preparazione non completata.
echo Leggi il messaggio sopra per individuare il problema.
echo.
pause
exit /b 1
