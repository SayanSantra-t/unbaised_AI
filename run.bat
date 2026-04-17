@echo off
setlocal EnableDelayedExpansion
title BiasModel v2.5 — Auto Setup ^& Launch

color 0A
echo.
echo  ██████╗ ██╗ █████╗ ███████╗███╗   ███╗ ██████╗ ██████╗ ███████╗██╗
echo  ██╔══██╗██║██╔══██╗██╔════╝████╗ ████║██╔═══██╗██╔══██╗██╔════╝██║
echo  ██████╔╝██║███████║███████╗██╔████╔██║██║   ██║██║  ██║█████╗  ██║
echo  ██╔══██╗██║██╔══██║╚════██║██║╚██╔╝██║██║   ██║██║  ██║██╔══╝  ██║
echo  ██████╔╝██║██║  ██║███████║██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗███████╗
echo  ╚═════╝ ╚═╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝
echo                         v2.5 — Unbiased AI Pipeline
echo.
echo ========================================================================
echo.

:: ── STEP 1: Check Python ────────────────────────────────────────────────────
echo  [1/6] Checking Python...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Python not found!
    echo  Please install Python 3.10+ from https://python.org
    echo  Make sure to check "Add Python to PATH" during install.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  Found: %%v
echo.

:: ── STEP 2: Check Node.js ───────────────────────────────────────────────────
echo  [2/6] Checking Node.js / npm...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Node.js / npm not found!
    echo  Please install Node.js from https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo  Found: Node %%v
echo.

:: ── STEP 3: Python virtual environment ─────────────────────────────────────
echo  [3/6] Python virtual environment...
if not exist "venv\Scripts\activate.bat" (
    echo  Creating venv...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo  [ERROR] Failed to create venv.
        pause
        exit /b 1
    )
    echo  venv created.
    :: Mark as fresh so we install deps below
    set FRESH_VENV=1
) else (
    echo  venv already exists — skipping creation.
    set FRESH_VENV=0
)
echo.

:: ── STEP 4: Install Python dependencies ────────────────────────────────────
echo  [4/6] Python dependencies...
if "%FRESH_VENV%"=="1" (
    echo  Installing packages from requirements.txt...
    .\venv\Scripts\python.exe -m pip install --upgrade pip --quiet
    .\venv\Scripts\python.exe -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo  [ERROR] pip install failed.
        pause
        exit /b 1
    )
    echo  All packages installed.
) else (
    :: Quick check — try importing fastapi. If it fails, reinstall.
    .\venv\Scripts\python.exe -c "import fastapi" >nul 2>nul
    if %errorlevel% neq 0 (
        echo  Packages missing — reinstalling...
        .\venv\Scripts\python.exe -m pip install --upgrade pip --quiet
        .\venv\Scripts\python.exe -m pip install -r requirements.txt
    ) else (
        echo  Packages already installed — skipping.
    )
)
echo.

:: ── STEP 5: Install npm dependencies ────────────────────────────────────────
echo  [5/6] Frontend dependencies...
if not exist "frontend\node_modules" (
    echo  Running npm install (first time — may take a minute)...
    cd frontend
    call npm install --silent
    if %errorlevel% neq 0 (
        cd ..
        echo  [ERROR] npm install failed.
        pause
        exit /b 1
    )
    cd ..
    echo  npm packages installed.
) else (
    echo  node_modules already exists — skipping.
)
echo.

:: ── STEP 6: Environment file ────────────────────────────────────────────────
echo  [6/6] Environment variables...
if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  Created .env from .env.example.
    ) else (
        echo GEMINI_API_KEY=your_gemini_api_key_here > .env
        echo GOOGLE_CSE_ID=your_google_cse_id_here >> .env
        echo  Created blank .env file.
    )
    echo.
    echo  ╔══════════════════════════════════════════════════════════╗
    echo  ║  ACTION REQUIRED: Open .env and add your GEMINI_API_KEY ║
    echo  ╚══════════════════════════════════════════════════════════╝
    echo.
    echo  Press any key to open .env in Notepad...
    pause >nul
    start notepad ".env"
    echo  Save the file, then press any key to continue launching...
    pause >nul
) else (
    :: Check if the key is still the placeholder
    findstr /i "your_gemini_api_key_here" ".env" >nul 2>nul
    if %errorlevel% equ 0 (
        echo  [WARNING] .env has a placeholder key. Gemini features may not work.
        echo  Edit .env and add your real GEMINI_API_KEY.
        echo.
    ) else (
        echo  .env found and configured.
    )
)
echo.

:: ── LAUNCH ──────────────────────────────────────────────────────────────────
echo ========================================================================
echo   Setup complete! Launching servers...
echo ========================================================================
echo.
echo  Backend  →  http://localhost:8000
echo  Frontend →  http://localhost:5173
echo.
echo  NOTE: Make sure Jan AI is running at http://127.0.0.1:1337
echo        (or Ollama if you switched to it)
echo.

:: Start backend in a new terminal window
start "BiasModel — Backend (port 8000)" cmd /k "color 0B && echo  BiasModel Backend Starting... && echo. && .\venv\Scripts\python.exe main.py"

:: Wait 3 seconds for backend to initialize
timeout /t 3 /nobreak >nul

:: Start frontend in a new terminal window
start "BiasModel — Frontend (port 5173)" cmd /k "color 0D && echo  BiasModel Frontend Starting... && echo. && cd frontend && npm run dev"

:: Wait 4 more seconds then open browser
timeout /t 4 /nobreak >nul
echo  Opening browser...
start "" "http://localhost:5173"

echo.
echo  Both servers are running in separate windows.
echo  Close those windows to stop the servers.
echo.
pause
