# 배포 가이드 (Deployment Guide)

## 1. 환경 변수 설정

### Vercel 배포 시

1. Vercel 대시보드에서 프로젝트 선택
2. **Settings** → **Environment Variables** 이동
3. 다음 환경 변수 추가:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: `your_actual_gemini_api_key`
   - **Environment**: Production, Preview, Development 모두 선택

### 로컬 개발 시

`.env.local` 파일 생성 (이미 생성됨):
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

## 2. Next.js API Routes 구조

이 프로젝트는 **Next.js 16 App Router** 구조를 사용합니다.

### API 엔드포인트
- `/api/chat` - 채팅 API (POST)
- `/api/recommendation` - 추천 생성 API (POST)

### 배포 환경에서 동작 보장
✅ **App Router 기반** (`/app/api/` 디렉토리)
✅ **환경 변수**: `process.env.GEMINI_API_KEY` 사용
✅ **에러 핸들링**: 재시도 로직 포함
✅ **Edge Runtime 호환**: 필요 시 `export const runtime = 'edge'` 추가 가능

## 3. 배포 체크리스트

### 필수 확인사항
- [ ] `.env.local`이 `.gitignore`에 포함되어 있는지 확인
- [ ] Vercel 환경 변수에 `GEMINI_API_KEY` 설정
- [ ] `npm run build` 실행하여 빌드 에러 없는지 확인
- [ ] API Routes가 `/app/api/` 디렉토리에 있는지 확인

### Vercel 배포 명령어
```bash
# 로컬 빌드 테스트
npm run build

# Vercel CLI 배포 (선택사항)
vercel --prod
```

## 4. 배포 후 테스트

1. **홈 페이지** 접속: `https://your-domain.vercel.app`
2. **채팅 기능** 테스트: "고르러 가기" → 질문 응답
3. **API 응답** 확인: 브라우저 개발자 도구에서 네트워크 탭 확인

### 예상 API 응답 시간
- Chat API: 2-5초 (Gemini API 응답 대기)
- Recommendation API: 10-20초 (Agentic Workflow 실행)

## 5. 트러블슈팅

### API 500 에러
- Vercel 환경 변수에 `GEMINI_API_KEY`가 설정되었는지 확인
- Gemini API 키가 유효한지 확인: https://makersuite.google.com/app/apikey

### 하이드레이션 에러
- 이미 해결됨: `mounted` 상태로 SSR/CSR 불일치 방지

### Cold Start 지연
- 첫 API 요청은 5-10초 걸릴 수 있음 (서버 시작 시간)
- Vercel Pro 플랜에서는 Warm Up 기능으로 개선 가능

## 6. 환경별 설정

### Production
- 환경 변수: Vercel Dashboard에서 설정
- 로깅: 최소화
- 에러 핸들링: 사용자 친화적 메시지

### Development
- 환경 변수: `.env.local` 파일
- 로깅: 상세 로그 (console.log, console.error)
- Hot Reload: Turbopack 사용

## 7. 보안 고려사항

✅ API Key는 **절대 클라이언트 코드에 노출하지 않음**
✅ 모든 API 요청은 **서버 사이드**(API Routes)에서 처리
✅ `.env.local`은 Git에 커밋되지 않음
✅ CORS 설정 불필요 (Next.js API Routes는 동일 도메인)

## 8. 성능 최적화

- **재시도 로직**: Gemini API 실패 시 최대 3회 재시도 (exponential backoff)
- **캐싱**: SessionStorage로 클라이언트 사이드 상태 관리
- **스트리밍**: 타이핑 이펙트로 UX 개선
- **Code Splitting**: Next.js 자동 최적화

## 9. 모니터링

### Vercel Analytics (추천)
```bash
npm install @vercel/analytics
```

### 로그 확인
- Vercel Dashboard → Deployments → Logs
- 실시간 로그 스트림 확인 가능
