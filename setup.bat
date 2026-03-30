@echo off
cd /d "%~dp0"
TITLE ECO - Setup
echo --- Avvio Setup ECO ---
powershell -NoProfile -ExecutionPolicy Bypass -File "setup_windows.ps1"
pause
