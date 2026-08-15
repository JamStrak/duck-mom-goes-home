@echo off
setlocal
title Sync to GitHub
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-github.ps1"
echo.
pause
endlocal
