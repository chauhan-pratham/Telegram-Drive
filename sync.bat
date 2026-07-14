@echo off
echo ==================================================
echo      Telegram Drive Upstream Sync Helper
echo ==================================================
echo.

:: 1. Setup upstream remote if not exists
git remote | findstr "upstream" >nul
if %errorlevel% neq 0 (
    echo [INFO] Setting up upstream tracking to original repository...
    git remote add upstream https://github.com/caamer20/Telegram-Drive.git
)

:: 2. Check for local uncommitted changes
git status --porcelain | findstr /R "^" >nul
if %errorlevel% eq 0 (
    echo [INFO] Stashing your local uncommitted changes...
    git stash
    set STASHED=1
) else (
    set STASHED=0
)

:: 3. Fetch latest changes from the developer
echo [INFO] Fetching updates from original developer...
git fetch upstream
if %errorlevel% neq 0 (
    echo [ERROR] Failed to fetch updates. Check your internet connection.
    goto restore_stash
)

:: 4. Merge changes
echo [INFO] Merging updates into your branch...
git merge upstream/main -m "Merge updates from upstream developer"
if %errorlevel% neq 0 (
    echo [WARNING] Merge conflicts occurred! Please resolve them in VS Code.
    goto restore_stash
)

:: 5. Scan files for new ad integrations
echo [INFO] Checking if new updates reintroduced ads...
findstr /s /i /m "effectivecpmnetwork highperformanceformat adsterra" app\src\*.ts app\src\*.tsx app\src-tauri\src\*.rs >nul
if %errorlevel% eq 0 (
    echo [ALERT] New ads were detected in the updated files!
    echo Please review the modifications to keep the app clean.
) else (
    echo [SUCCESS] No new ad domains detected. App remains clean!
)

:restore_stash
if "%STASHED%"=="1" (
    echo [INFO] Restoring your local uncommitted changes...
    git stash pop
)

echo.
echo ==================================================
echo Sync task completed.
echo ==================================================
pause
