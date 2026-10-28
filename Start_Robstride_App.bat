@echo off
setlocal
title Robstride 2-DOF Arm Control Application

echo ================================================================
echo        Robstride 2-DOF Arm Control Application Launcher
echo ================================================================
echo.

cd /d "%~dp0ArmControlApp"

echo Working Directory: %CD%
echo.

if exist "%~dp0ArmControlApp\dist\win-unpacked\Robstride Arm Control.exe" (
    echo Compiled Standalone Executable available at:
    echo   "%~dp0ArmControlApp\dist\win-unpacked\Robstride Arm Control.exe"
    echo.
)

echo Starting application via npm run dev...
echo (Close the application window or press Ctrl+C to exit)
echo.

call npm run dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Trying npm.cmd...
    call npm.cmd run dev
)

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ================================================================
    echo [ERROR] Failed to start via npm run dev (Exit code %ERRORLEVEL%).
    if exist "%~dp0ArmControlApp\dist\win-unpacked\Robstride Arm Control.exe" (
        echo Attempting to launch standalone compiled executable instead...
        start "" "%~dp0ArmControlApp\dist\win-unpacked\Robstride Arm Control.exe"
    )
    echo ================================================================
)

echo.
echo ================================================================
echo Application session finished.
echo ================================================================
pause
