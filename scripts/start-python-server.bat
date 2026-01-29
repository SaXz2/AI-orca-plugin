@echo off
title Orca AI Chat - Python Server

echo.
echo ========================================
echo   Orca AI Chat - Python Server
echo ========================================
echo.

:: Get script directory
set "SCRIPT_DIR=%~dp0"

:: Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.x
    echo.
    echo Download: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

:: Start server
echo Starting Python server...
echo.
python "%SCRIPT_DIR%python-server.py"

:: Pause if server exits with error
if errorlevel 1 (
    echo.
    echo [ERROR] Server exited with error
    pause
)
