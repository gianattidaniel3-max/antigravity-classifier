@echo off
pushd "%~dp0"
TITLE ECO - Setup
echo --- Avvio Setup ECO ---
echo Caricamento script PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -File "setup_windows.ps1"
popd
pause
