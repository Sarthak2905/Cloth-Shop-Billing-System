@echo off
title Label printer helper
cd /d "%~dp0"

rem ---- Change these two lines if needed ----
rem The printer name exactly as Windows shows it
set PRINTER_NAME=TSC TTP-244 Pro
rem The website addresses that may use the helper (separate several with commas, no spaces)
set ALLOWED_ORIGINS=http://localhost:5173,https://dhokatecollection-billing-system.onrender.com
rem ------------------------------------------

node label-helper.cjs
pause