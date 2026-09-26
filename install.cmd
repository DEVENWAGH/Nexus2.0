@echo off
setlocal
title Nexus 3.0 - Setup and Installation

echo ========================================================
echo         Nexus 3.0 - Environment Setup & Install
echo ========================================================
echo.

:: 1. Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js (v20 or higher recommended) from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detected:
node -v
echo.

:: 2. Ensure Yarn via Corepack or check Yarn
echo [*] Checking Yarn package manager...
call corepack enable >nul 2>&1

where yarn >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Yarn not found in PATH, installing yarn...
    call npm install -g yarn
)

echo [OK] Yarn version:
call yarn -v
echo.

:: 3. Setup .env file
if exist .env (
    echo [OK] Pre-configured .env detected and preserved.
) else (
    if exist .env.example (
        echo [*] Creating .env from .env.example...
        copy .env.example .env >nul
        echo [OK] Created .env file.
    )
)

:: 4. Install dependencies
echo [*] Installing workspace dependencies with Yarn...
echo This may take a minute or two...
call yarn install
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] yarn install failed! Please review the messages above.
    pause
    exit /b %ERRORLEVEL%
)

:: 5. Generate Prisma database client
echo.
echo [*] Generating Prisma client definitions...
call yarn db:generate
if %ERRORLEVEL% neq 0 (
    echo [WARN] yarn db:generate had issues, you can re-run it later.
)

:: 6. Completion
echo.
echo ========================================================
echo  [SUCCESS] All dependencies and packages are installed!
echo ========================================================
echo.
echo To start the development servers, run:
echo    dev.cmd
echo    or
echo    yarn dev
echo.
set /p START_DEV="Would you like to start the dev server now? (Y/N): "
if /i "%START_DEV%"=="Y" (
    echo Starting dev server...
    call dev.cmd
) else (
    echo You can start Nexus anytime using: dev.cmd
    pause
)
