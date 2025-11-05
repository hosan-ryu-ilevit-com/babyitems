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

### 페이지 플로우 (6단계)

1. **홈** (`/`) - 서비스 소개 및 시작
2. **랭킹** (`/ranking`) - 인기 제품 목록
3. **채팅** (`/chat`) - 대화형 속성 평가 및 맞춤 질문 (단일 페이지, Phase 0-8)
4. **결과** (`/result`) - 맞춤형 Top 3 추천
5. **관리자** (`/admin`) - 로그 뷰어 및 대화 추적
6. **관리자 업로드** (`/admin/upload`) - 제품 관리 인터페이스

### Agentic Workflow 파이프라인

추천 워크플로우는 5단계 AI 파이프라인으로 구성됩니다:

#### Phase 1: 페르소나 생성
- **위치**: `lib/agents/personaGenerator.ts`
- **입력**: 전체 채팅 기록 + `AttributeAssessment` 객체
- **출력**: 7가지 속성별 가중치(1-10)를 포함한 `UserPersona`
- **기능**: 버튼 클릭뿐만 아니라 대화 맥락을 통해 우선순위 추론

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

### 7가지 핵심 속성

1. 온도 조절/유지 성능 (Temperature Control)
2. 위생/세척 편의성 (Hygiene)
3. 소재 (안전성) (Material Safety)
4. 사용 편의성 (Usability)
5. 휴대성 (Portability) - 선택
6. 가격 대비 가치 (Price/Value) - 선택
7. 부가 기능 및 디자인 (Additional Features) - 선택

**참고**: 이전 버전의 "내구성/A/S" 속성은 제거되었습니다.

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
- **입력**: `{ messages: Message[], attributeAssessments: AttributeAssessment }`
- **출력**: 진행률 업데이트 (0-100%) 및 최종 추천 결과
- **응답 형식**: `data: {"phase": "...", "progress": ..., "message": "..."}\n\n`
- **중요**: 실제 워크플로우는 이 파일(`app/api/recommend/route.ts`)에 있으며, `lib/workflow/recommendationWorkflow.ts`는 DEPRECATED

### POST /api/chat
- **기능**: 다목적 채팅 엔드포인트
- **action 파라미터**:
  - `generate_followup`: 맥락적 후속 질문 생성
  - `reassess_importance`: 후속 답변 기반 중요도 재평가
- **phase 파라미터**:
  - `chat1`: 속성 평가 (`analyzeUserIntent()` 사용)
  - `chat2`: 자유 대화

## 핵심 데이터 타입

모든 타입은 `types/index.ts`에 정의:

- **Product**: 7가지 `CoreValues` (temperatureControl, hygiene, material, usability, portability, priceValue, additionalFeatures)
- **UserPersona**: AI 생성 페르소나 및 `coreValueWeights` (1-10 스케일)
- **ProductEvaluation**: 속성별 등급 + 사유 + `overallScore`
- **Recommendation**: 최종 Top 3 추천 및 맞춤형 설명
- **ConversationalState**: 현재 속성, 후속 질문 상태, 인트로 완료 여부 추적

## 성능 최적화

1. **병렬 처리**: 제품 평가 및 추천 생성을 병렬로 실행
2. **하이브리드 접근**: 코드 기반 필터링(빠름) + LLM 평가(맥락 이해)
3. **선택적 검증**: `evaluationValidator.ts` (현재 속도를 위해 비활성화)
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

1. **채팅 플로우**: 단일 페이지 대화형 플로우, 동적 단계 전환 (별도 chat1/chat2 페이지 없음)
2. **중요도 감지**: AI가 자연어를 분석하여 중요도 추출 (버튼 클릭뿐만 아니라)
3. **후속 질문 전략**: Phase 0 맥락 관련성 분석 기반 LLM 생성 맥락적 질문
4. **워크플로우 위치**: 실제 워크플로우는 `app/api/recommend/route.ts`에 있음 (NOT `lib/workflow/recommendationWorkflow.ts`)
5. **JSON 파싱**: AI 응답에 항상 `parseJSONResponse()` 사용 - 마크다운으로 래핑될 수 있음
6. **재시도 로직**: 모든 Gemini 호출은 `callGeminiWithRetry()`로 래핑하여 안정성 확보
7. **등급 변환**: 매우 충족=5, 충족=4, 보통=3, 미흡=2, 매우 미흡=1
8. **가중치 매핑**: 중요함=10, 보통=7, 중요하지 않음=5 (페르소나 생성에 사용)

### 주의사항

- **Deprecated 파일**: `lib/workflow/recommendationWorkflow.ts`에 경고 주석 - 사용하지 말것
- **속성 개수**: 8개에서 7개 속성으로 변경 ("내구성/A/S" 제거됨)
- **JSON in Markdown**: AI 응답이 종종 JSON을 ````json\n...\n``` 블록으로 래핑
- **제품 로딩**: 필터링 전 모든 제품 로드 필수 (`loadAllProducts()` 사용)
- **정렬**: 제품 `coreValues`와 페르소나 `weights`는 동일한 7개 속성을 같은 순서로 사용해야 함
- **맥락 참조**: 후속 질문은 관련성이 높을 때만 Phase 0를 자연스럽게 참조
- **톤 일관성**: 채팅 플로우 전반에 걸쳐 공감형 한국어 톤 유지
- **관리자 기능**: 제품 업로드는 쿠팡 리뷰 URL로부터 AI 기반 분석 포함

## 프로젝트 가이드

프로젝트 가이드 및 Claude Code 작업 지침은 [.claude/CLAUDE.md](.claude/CLAUDE.md)를 참조하세요.

## 라이선스

MIT License
