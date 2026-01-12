@echo off
chcp 65001 >nul
title Orca AI Chat - Python Server

echo.
echo ========================================
echo   Orca AI Chat - Python 服务器启动器
echo ========================================
echo.

:: 获取脚本所在目录
set "SCRIPT_DIR=%~dp0"

:: 检查 Python 是否可用
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.x
    echo.
    echo 下载地址: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

:: 启动服务器
echo 正在启动 Python 服务器...
echo.
python "%SCRIPT_DIR%python-server.py"

:: 如果服务器退出，暂停以便查看错误
if errorlevel 1 (
    echo.
    echo [错误] 服务器异常退出
    pause
)
