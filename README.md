# 분유포트 추천 서비스

AI 기반 맞춤형 분유포트 추천 서비스입니다. Google Gemini API를 활용한 Agentic Workflow 아키텍처로 사용자에게 최적의 Top 3 제품을 추천합니다.

## 핵심 컨셉

**"인기 Top N 분유포트 중에서, 당신에게 딱 맞는 Top 3를 골라드려요"**

## 기술 스택

- **Frontend**: Next.js 16.0.1 (App Router), React 19.2.0, TypeScript
- **Styling**: Tailwind CSS v4, Framer Motion
- **AI**: Google Gemini API (gemini-flash-lite-latest)
- **Architecture**: Agentic Workflow with multi-phase AI pipeline

## 시작하기

### 환경 설정

1. 저장소 클론:
```bash
git clone [repository-url]
cd babyitem_MVP
```

2. 의존성 설치:
```bash
npm install
```

3. 환경 변수 설정:
```bash
# .env.local 파일 생성
GEMINI_API_KEY=your_api_key_here
```

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

### 빌드 및 배포

```bash
# 프로덕션 빌드
npm run build

# 프로덕션 서버 실행
npm start

# 코드 품질 검사
npm run lint
```

## 프로젝트 구조

### 페이지 플로우 (5단계)

1. **홈** (`/`) - 서비스 소개 및 시작
2. **랭킹** (`/ranking`) - 인기 제품 목록
3. **채팅 1** (`/chat/structured`) - 8가지 핵심 속성 질문 및 중요도 평가
4. **채팅 2** (`/chat/open`) - 자유 대화 (정확도 진행률 80-100% 표시)
5. **결과** (`/result`) - 맞춤형 Top 3 추천

### Agentic Workflow 파이프라인

추천 워크플로우는 5단계 AI 파이프라인으로 구성됩니다:

#### Phase 1: 페르소나 생성
- **위치**: `lib/agents/personaGenerator.ts`
- **입력**: 채팅 대화 내용
- **출력**: 8가지 속성별 가중치(1-10)를 포함한 `UserPersona`
- **옵션**: Reflection 패턴 (속도/품질 조절 가능)

#### Phase 2: 초기 필터링
- **위치**: `lib/filtering/initialFilter.ts`
- **방식**: 코드 기반 가중치 합산 `score = Σ(product.coreValues[i] × persona.weights[i])`
- **출력**: Top 5 후보 제품

#### Phase 3: AI 평가
- **위치**: `lib/agents/productEvaluator.ts`
- **방식**: Top 5 제품 병렬 평가
- **출력**: 속성별 등급 및 사유 (매우 충족 ~ 매우 미흡)

#### Phase 4: 최종 점수 계산
- **위치**: `lib/filtering/scoreCalculator.ts`
- **공식**: `70% 속성 점수 + 30% 전체 점수`
- **출력**: 최종 Top 3 제품

#### Phase 5: 추천 생성
- **위치**: `lib/agents/recommendationWriter.ts`
- **방식**: Top 3 제품 병렬 추천문 생성
- **출력**: 장단점, 비교, 추가 고려사항

### 8가지 핵심 속성

1. 온도 조절/유지 능력 (가장 중요)
2. 위생/세척 편의성
3. 재질 (안전성)
4. 사용 편의성
5. 휴대성 (선택)
6. 가격/가성비 (선택)
7. 내구성/A/S (선택)
8. 부가 기능/디자인 (선택)

### 주요 디렉토리

```
babyitem_MVP/
├── app/                    # Next.js App Router 페이지
│   ├── api/               # API 엔드포인트
│   │   ├── chat/         # 채팅 API
│   │   └── recommend/    # 추천 API (SSE)
│   ├── chat/             # 채팅 페이지
│   ├── ranking/          # 랭킹 페이지
│   └── result/           # 결과 페이지
├── lib/
│   ├── agents/           # AI 에이전트 (페르소나, 평가, 추천)
│   ├── filtering/        # 필터링 및 점수 계산
│   ├── workflow/         # 추천 워크플로우 오케스트레이션
│   ├── ai/              # Gemini API 클라이언트
│   └── data/            # 제품 데이터 로더
├── data/
│   └── products/        # 제품 마크다운 파일
├── types/               # TypeScript 타입 정의
└── components/          # React 컴포넌트
```

## API 엔드포인트

### POST /api/recommend
- **기능**: 스트리밍 추천 API (Server-Sent Events)
- **입력**: `{ messages: Message[] }`
- **출력**: 진행률 업데이트 (0-100%) 및 최종 추천 결과
- **응답 형식**: `data: {"phase": "...", "progress": ..., "message": "..."}\n\n`

### POST /api/chat
- **기능**: 구조화/자유 대화 단계의 채팅 처리

## 핵심 데이터 타입

모든 타입은 `types/index.ts`에 정의:

- **Product**: 8가지 `CoreValues`를 포함한 제품 데이터
- **UserPersona**: AI 생성 페르소나 및 속성별 가중치
- **ProductEvaluation**: AI 평가 결과 (등급 및 사유)
- **Recommendation**: 최종 Top 3 추천 및 맞춤형 설명

## 성능 최적화

1. **병렬 처리**: 제품 평가 및 추천 생성을 병렬로 실행
2. **하이브리드 접근**: 코드 기반 필터링(빠름) + LLM 평가(맥락 이해)
3. **선택적 패턴**: Reflection/Validation 패턴 토글 가능
4. **스트리밍**: SSE를 통한 실시간 진행률 표시 (10-30초 워크플로우)

## UI/UX 가이드라인

- 최대 너비: 480px (중앙 정렬, 외부 회색 배경)
- 타겟: 30-40대 여성 (심플하고 깔끔한 디자인)
- 최소 터치 영역: 44×44px
- Framer Motion을 활용한 부드러운 애니메이션
- 모든 사용자 대면 텍스트는 한국어

## 개발 참고사항

### AI 통합
- **모델**: `gemini-flash-lite-latest`
- **재시도 로직**: 3회 시도, 지수 백오프 (1s, 2s, 4s)
- **헬퍼 함수**:
  - `callGeminiWithRetry()`: 모든 API 호출 래핑
  - `parseJSONResponse()`: 마크다운 코드 블록에서 JSON 추출

### 주요 구현 노트
1. **세션 관리**: 인메모리 또는 sessionStorage (DB 불필요)
2. **에러 핸들링**: 모든 Gemini API 호출에 재시도 로직 적용
3. **JSON 파싱**: AI 응답이 마크다운 코드 블록을 포함할 수 있음 - 방어적 파싱 필요
4. **페이지 새로고침**: 홈 페이지로 복귀
5. **정확도 추적**: Chat 2에서 진행률 바 표시 (80-100%)

### 주의사항
- AI 응답이 JSON을 마크다운 코드 블록으로 래핑할 수 있음 (````json\n...\n````)
- 제품 `coreValues`와 페르소나 `weights`는 동일한 8가지 속성으로 정렬되어야 함
- 등급 변환: 매우 충족=5, 충족=4, 보통=3, 미흡=2, 매우 미흡=1
- 중요도 레벨: 매우 중요=10, 중요=7, 보통=4
- 필터링 전 모든 제품 마크다운 파일 로드 필수

## 프로젝트 가이드

프로젝트 가이드 및 Claude Code 작업 지침은 [.claude/CLAUDE.md](.claude/CLAUDE.md)를 참조하세요.

## 라이선스

MIT License
