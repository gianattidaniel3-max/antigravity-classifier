@echo off
TITLE ECO - Setup
echo --- Avvio Setup ECO ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_windows.ps1"
pause
