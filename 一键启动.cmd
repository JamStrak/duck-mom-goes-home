@echo off
setlocal
title Duck Mom Goes Home - Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
if errorlevel 1 pause
endlocal
