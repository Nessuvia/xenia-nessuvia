@echo off
rem Double-click launcher for relay.ps1. Bypasses execution policy for this one run only.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0relay.ps1" %*
echo.
pause
