@echo off
title Dengue Alert System - Janiuay RHU
color 0A

echo.
echo  ============================================
echo   Dengue Alert System - Janiuay RHU
echo  ============================================
echo.

REM Kill any existing process on port 3001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo  Starting server... the link will appear below.
echo  (Keep this window open while using the system)
echo.

cd /d "%~dp0server"
node server.js
pause
