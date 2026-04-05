@echo off
setlocal
title BiasModel v2.5 - Easy Setup
echo ====================================================
echo   BIASMODEL V2.5 - PROJECT SETUP WIZARD
echo ====================================================
echo.

:: 1. Check for Python
echo [1/5] Checking for Python...
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found. Please install Python 3.10+ from python.org.
    pause
    exit /b
)
python --version
echo.

:: 2. Create Virtual Environment
echo [2/5] Creating Python Virtual Environment (venv)...
if not exist "venv" (
    python -m venv venv
    echo Virtual environment created.
) else (
    echo Virtual environment already exists. Skipping...
)
echo.

:: 3. Install Backend Dependencies
echo [3/5] Installing Backend dependencies...
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
echo Backend dependencies installed.
echo.

:: 4. Install Frontend Dependencies
echo [4/5] Installing Frontend dependencies (Node.js/NPM)...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] NPM not found. Skipping frontend setup.
    echo Please install Node.js from nodejs.org to run the frontend.
) else (
    cd frontend
    call npm install
    cd ..
    echo Frontend dependencies installed.
)
echo.

:: 5. Setup Environment Variables
echo [5/5] Setting up environment variables...
if not exist ".env" (
    if exist ".env.example" (
        copy .env.example .env
        echo Created .env from .env.example.
    ) else (
        echo GEMINI_API_KEY=YOUR_KEY_HERE > .env
        echo GOOGLE_CSE_ID=YOUR_CSE_ID_HERE >> .env
        echo Created a new .env file.
    )
) else (
    echo .env file already exists. Skipping...
)
echo.

echo ----------------------------------------------------
echo SETUP COMPLETE!
echo ----------------------------------------------------
echo.
echo NEXT STEPS:
echo 1. Edit the '.env' file with your GEMINI_API_KEY.
echo 2. Ensure Jan AI is running at 127.0.0.1:1337.
echo 3. Run 'start.bat' to launch the application.
echo.
pause
