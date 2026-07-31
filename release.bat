@echo off
cd /d "%~dp0"
echo ==================================================
echo      Telegram Drive Automated Release Trigger
echo ==================================================
echo.

set PKG_PATH=app\package.json
if not exist %PKG_PATH% (
    if exist package.json (
        set PKG_PATH=package.json
    )
)

:: 1. Read current version from package.json
for /f "tokens=2 delims=:" %%a in ('findstr /i "version" %PKG_PATH%') do set VER=%%~a
set VER=%VER:"=%
set VER=%VER:,=%
set VER=%VER: =%

echo [INFO] Detected version v%VER% in %PKG_PATH%
echo [INFO] Pushing code and updating Git release tag v%VER%...
echo.

:: 2. Automatically stage and commit any uncommitted changes for this release
git add -A
git commit -m "Release v%VER%"

:: 3. Push latest commits to remote repository
git push origin main

:: 4. Automatically recreate local and remote tag for current version
if not "%VER%"=="" (
    git tag -d "v%VER%" 2>NUL
    git push origin :refs/tags/"v%VER%" 2>NUL
    git tag "v%VER%"
    git push origin "v%VER%"
)

echo.
echo ==================================================
echo [SUCCESS] Release workflow triggered for v%VER%!
echo GitHub Actions is now building your release binaries.
echo ==================================================
