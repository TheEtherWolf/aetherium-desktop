@echo off
echo Opening Claude Code in current directory...

:: Get the directory where this .bat file is located
set CURRENT_DIR=%~dp0

:: Remove trailing backslash
set CURRENT_DIR=%CURRENT_DIR:~0,-1%

echo Current directory: %CURRENT_DIR%

:: Change to that directory
cd /d "%CURRENT_DIR%"

echo Starting Claude Code...
claude

pause
