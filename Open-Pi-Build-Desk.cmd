@echo off
cd /d "%~dp0"
node tools\open-pi.mjs --open
if errorlevel 1 pause
