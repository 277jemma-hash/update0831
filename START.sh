#!/usr/bin/env bash

# Real Estate AI Appraisal App - Auto Starter
set -e

echo "========================================================"
echo "  🏡 부동산 AI 감정평가 및 실거래가 비교분석 시스템"
echo "========================================================"
echo ""

# 1. Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ [오류] Node.js가 설치되어 있지 않습니다."
    echo "https://nodejs.org 에서 Node.js를 설치한 후 다시 실행해주세요."
    exit 1
fi

# 2. Check and install dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 최초 실행 라이브러리 패키지를 설치 중입니다..."
    npm install
fi

# 3. Open browser in background
sleep 2 && (
  if command -v open &> /dev/null; then
    open http://localhost:3000
  elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000
  fi
) &

# 4. Start Server
echo "🚀 서버를 시작합니다 (http://localhost:3000)..."
echo "💡 종료하려면 Ctrl + C 를 누르세요."
echo ""
npm run dev

