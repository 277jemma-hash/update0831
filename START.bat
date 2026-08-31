@echo off
chcp 65001 > nul
title Real Estate AI Appraisal App - Starting...

echo ========================================================
echo   🏡 부동산 AI 감정평가 및 실거래가 비교분석 시스템
echo ========================================================
echo.

:: 1. Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 Node.js를 설치한 후 다시 실행해주세요.
    echo.
    pause
    exit /b 1
)

:: 2. Check and install dependencies
if not exist "node_modules\" (
    echo 📦 처음 실행을 위한 라이브러리 패키지를 설치 중입니다...
    echo    (잠시만 기다려주세요)
    call npm install
    if %errorlevel% neq 0 (
        echo [오류] 패키지 설치 중 오류가 발생했습니다.
        pause
        exit /b 1
    )
)

:: 3. Open browser automatically after a short delay
echo 🌐 브라우저를 실행하여 http://localhost:3000 에 접속합니다...
start "" http://localhost:3000

:: 4. Run Development Server
echo 🚀 개발 서버를 구동합니다...
echo [안내] 종료하려면 이 창에서 Ctrl + C 를 누르세요.
echo.
npm run dev

pause

