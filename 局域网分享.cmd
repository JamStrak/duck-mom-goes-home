@echo off
setlocal
title Duck Mom Goes Home - Share on LAN
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" -ShareLan
if errorlevel 1 pause
endlocal
