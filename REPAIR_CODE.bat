@echo off
TITLE REPAIR ECO - Aggiornamento Codice
echo --- Avvio Aggiornamento Codice ECO ---
echo Questo script forzera' lo scaricamento della versione corretta per il Microsoft.
echo.
git fetch --all
git reset --hard origin/main
echo.
echo --- OK, Codice Aggiornato! ---
echo Ora puoi CHIUDERE questa finestra e lanciare run_eco.bat
pause
