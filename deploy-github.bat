@echo off
setlocal
cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo Git was not found. Install Git for Windows first.
  pause
  exit /b 1
)

if not exist ".git" git init
git branch -M main
git config user.name >nul 2>nul
if errorlevel 1 git config user.name "YOBAK2033"
git config user.email >nul 2>nul
if errorlevel 1 git config user.email "YOBAK2033@users.noreply.github.com"
git remote get-url origin >nul 2>nul
if errorlevel 1 git remote add origin https://github.com/YOBAK2033/BayouTavern-Lite.git

git add .
git diff --cached --quiet
if errorlevel 1 (
  git commit -m "Update BayouTavern Lite 2.0"
  if errorlevel 1 exit /b 1
) else (
  echo No new changes.
)

git push -u origin main
if errorlevel 1 (
  echo Push failed. Check GitHub permissions and sign-in status.
  exit /b 1
) else (
  echo Pushed to GitHub successfully.
)
pause
