@echo off
echo ====================================
echo Starting QuizPortal Server
echo ====================================
echo.

cd /d "%~dp0"

echo Checking Node.js installation...
node --version
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found! Please install Node.js first.
    echo Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo.
echo Node.js found! Continuing...
echo.

echo Cleaning old dependencies (if any)...
if exist node_modules (
    echo Removing old node_modules...
    rmdir /s /q node_modules 2>nul
)
if exist package-lock.json (
    echo Removing old package-lock.json...
    del package-lock.json
)

echo.
echo Installing fresh dependencies (Pure JavaScript SQLite - No compilation needed)...
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo ====================================
echo Starting Server on Port 5000
echo ====================================
echo.
echo Server will be available at: http://localhost:5000
echo Press CTRL+C to stop the server
echo.

call npm start

pause
