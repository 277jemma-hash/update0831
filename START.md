# 🏡 부동산 AI 감정평가 및 실거래가 분석 시스템 시작 가이드

다른 컴퓨터나 환경에서도 손쉽게 실행할 수 있도록 준비된 원클릭 시작 파일들입니다.

---

## ⚡ 1. 가장 빠른 원클릭 실행 방법

### 🪟 Windows 사용자
- 폴더 내의 **`START.bat`** 파일을 더블 클릭합니다.
- 자동으로 필요한 패키지를 설치하고, 개발 서버 구동 후 웹 브라우저(`http://localhost:3000`)를 즉시 띄워줍니다.

### 🍎 Mac / Linux 사용자
- 터미널에서 아래 명령어를 입력하거나 `START.sh`를 실행합니다:
  ```bash
  chmod +x START.sh
  ./START.sh
  ```
- 자동으로 라이브러리 설치 후 기본 브라우저(`http://localhost:3000`)가 열립니다.

---

## 💻 2. 수동 실행 방법 (터미널/명령 프롬프트)

1. **사전 준비**: [Node.js (v18 이상 권장)](https://nodejs.org) 설치
2. **패키지 설치**:
   ```bash
   npm install
   ```
3. **서버 실행**:
   ```bash
   npm run dev
   ```
4. **브라우저 접속**: [http://localhost:3000](http://localhost:3000)

---

## 🔑 3. 환경 변수 설정 (선택 사항)
`.env` 파일에 API 키를 설정할 수 있습니다 (기본 모의/시연 데이터 및 샘플 키가 내장되어 있어 키 없이도 정상 구동됩니다):
- `GEMINI_API_KEY`: AI 감정평가 의견서 고도화 생성용 API 키
- `VITE_KAKAO_MAP_KEY`: 카카오맵 JavaScript API 키
- `MOLIT_SERVICE_KEY`: 국토교통부 실거래가 Open API 인증키

