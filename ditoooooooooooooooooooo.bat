@echo off
cd /d "%~dp0"
if not exist "node_modules\@decartai\sdk\package.json" (
  echo Installing the AI try-on dependencies...
  npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not exist "dist\index.html" (
  echo Building the website...
  npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node -e "fetch('http://127.0.0.1:8000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>&1
if not errorlevel 1 goto open_site
echo Starting Anywear real-time AI try-on...
start "Anywear server" /D "%~dp0" npm start
timeout /t 2 /nobreak >nul
:open_site
start "" "http://127.0.0.1:8000"
