@echo off
cd /d %~dp0
echo Starting Easy酒馆 2.0...
npx vite --port 5173 --host 0.0.0.0
pause
