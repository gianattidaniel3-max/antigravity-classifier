@echo off
pushd "%~dp0"
TITLE ECO - Setup (Standard User)
echo --- Avvio Setup ECO ---
echo Nota: I privilegi di amministratore NON sono più necessari.
echo Caricamento in corso...
powershell -NoProfile -ExecutionPolicy Bypass -File "setup_windows.ps1"
popd
pause
