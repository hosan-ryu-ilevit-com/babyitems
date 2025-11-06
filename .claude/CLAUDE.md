# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered formula milk warmer (분유포트) recommendation service using an **Agentic Workflow** architecture with Google Gemini API. Core concept: "From the top N most popular warmers, we'll pick the perfect top 3 for you."

**Tech Stack**: Next.js 16.0.1 (App Router), React 19.2.0, TypeScript, Tailwind CSS v4, Framer Motion, Google Gemini API, Supabase (logging only)

## Development Commands

```bash
npm run dev         # Start dev server at http://localhost:3000
npm run build       # Build for production
npm start           # Start production server
npm run lint        # Run ESLint
```

## Architecture Overview

### Page Flow (7 Pages)
1. **Home** (`/`) → Start button
2. **Ranking** (`/ranking`) → Product list view
3. **Priority** (`/priority`) → Single-page priority & budget selection
4. **Chat** (`/chat`) → Deep-dive conversation on 'high' priority attributes (optional)
5. **Result** (`/result`) → Top 3 personalized recommendations
6. **Admin** (`/admin`) → Log viewer with conversation tracking
7. **Admin Upload** (`/admin/upload`) → Product management interface

### Priority Flow (Main User Journey)

**Priority 페이지는 필수 진입점입니다.** 기존 Phase 0 → Chat1 플로우는 DEPRECATED.

#### **Priority Page** (`/priority`) - Single Scrollable Page
**Section 1: Attribute Priority Selection**
- 6개 속성 중요도 설정 (priceValue 제외)
- 3단계: `low` / `medium` / `high`
- **제약**: '중요함(high)' 1~3개 필수 선택
- **속성**:
  1. 온도 조절/유지 성능
  2. 위생/세척 편의성
  3. 소재 (안전성)
  4. 사용 편의성
  5. 휴대성
  6. 부가 기능 및 디자인

**Section 2: Budget Selection** (same page, below attributes)
- 4개 예산 범위 (priceValue 속성 기반):
  - `0-50000`: 5만원 이하 (기본 보온 기능 중심)
  - `50000-100000`: 5~10만원 (좋은 소재와 편의 기능 포함)
  - `100000-150000`: 10~15만원 (프리미엄 기능 및 구성품)
  - `150000+`: 15만원 이상 (최고급 제품)
- **커스텀 예산 입력**: 주관식 금액 입력 시 자동으로 범위 매핑
- **필수**: 예산 선택 완료해야 하단 버튼 활성화

#### **User Choice** (Priority 페이지 하단)
1. **"채팅으로 더 자세히"** → `/chat`
   - 'high' 속성들에 대해 3~5턴 자유 대화
   - Phase 0 변형: 특별한 상황 선택적 입력
   - 각 속성마다 AI가 디테일 질문
   - Chat2로 전환 (추가 맥락 수집)
   - 추천 받기

2. **"바로 추천받기"** → `/result`
   - Priority 설정 + 예산만으로 즉시 추천
   - Chat 단계 스킵

### Chat Flow (Priority 플로우 전용)

**전제조건**: Priority 페이지에서 `prioritySettings` + `budget` 설정 완료

#### **Phase 0 (변형): Optional Context**
- 기존: "어떤 상황이든 좋아요"
- Priority 플로우: "**특별한 상황**(쌍둥이, 외출 많음 등)이 있으시면 알려주세요"
- "없어요" 버튼으로 스킵 가능
- `session.phase0Context` 저장

#### **Phase 1: 'high' Attributes Deep-Dive**
- Priority 페이지에서 'high' 선택한 속성들만 질문
- **속성별 자유 대화 모드** (`inAttributeConversation: true`)
  - **최소 3턴, 최대 5턴**
  - 턴 1-2: 구체적 상황 파악 질문
  - 턴 3: 종합 정리 + 전환 제안 (권장)
  - 턴 4-5: 사용자가 더 말하고 싶은 경우
  - 턴 5 도달 시 **강제 전환**

**API**: `POST /api/chat` with `action: 'generate_attribute_conversation'`
```typescript
{
  action: 'generate_attribute_conversation',
  attributeName: string,
  attributeDetails: string[],
  conversationHistory: string, // 해당 속성 대화 이력
  phase0Context: string,
  currentTurn: number // 1~5
}
```

**Response**:
```typescript
{
  message: string, // AI 응답
  shouldTransition: boolean, // 턴 3+ 시 true
  forceTransition?: boolean // 턴 5 시 true
}
```

**전환 의도 분석**: `action: 'analyze_transition_intent'`
- 사용자가 "네", "좋아요", "넘어가요" 등 입력 시
- `shouldTransition: true/false` 반환

#### **Phase 2: Chat2 (Open Conversation)**
- 모든 'high' 속성 대화 완료 후
- 추가 특수 상황 파악 (2-3회 대화)
- `ASSISTANT_CHAT2_PROMPT` 사용
- "추천 받기" 버튼 표시

### Recommendation Workflow Pipeline

**Entry Point**: `app/api/recommend/route.ts` (SSE streaming)

**Input**:
```typescript
{
  messages: Message[], // 전체 대화 이력
  prioritySettings: PrioritySettings, // Priority 페이지 설정
  budget: BudgetRange // 예산 범위
}
```

**Phase 1: Persona Generation** (`lib/agents/personaGenerator.ts`)
- Priority 설정을 가중치로 변환:
  - `high` → 10
  - `medium` → 7
  - `low` → 5
- Chat 이력에서 `contextualNeeds` 추출
- Output: `UserPersona` with `coreValueWeights` (1-10)

**Phase 2: Initial Filtering** (`lib/filtering/initialFilter.ts`)
- Budget filter: `filterByBudget()`
- Weighted scoring: `score = Σ(product.coreValues[i] × persona.weights[i])`
- Top 5 선택

**Phase 3: AI Evaluation** (`lib/agents/productEvaluator.ts`)
- Top 5 제품을 Persona 관점에서 평가
- 속성별 등급: 매우 충족(5) ~ 매우 미흡(1)

**Phase 4: Final Scoring** (`lib/filtering/scoreCalculator.ts`)
- Formula: `70% weighted scores + 30% overallScore`
- Top 3 선택

**Phase 5: Recommendation Generation**
- `generateTop3Recommendations()`: 개인화된 추천 이유
- `generateContextSummary()`: 사용자 맥락 요약

### Core Data Types (`types/index.ts`)

```typescript
// Priority 설정
interface PrioritySettings {
  temperatureControl?: 'low' | 'medium' | 'high';
  hygiene?: 'low' | 'medium' | 'high';
  material?: 'low' | 'medium' | 'high';
  usability?: 'low' | 'medium' | 'high';
  portability?: 'low' | 'medium' | 'high';
  additionalFeatures?: 'low' | 'medium' | 'high';
}

// 세션 상태
interface SessionState {
  prioritySettings?: PrioritySettings;
  budget?: BudgetRange;
  phase0Context?: string; // Phase 0 맥락
  messages: Message[];
  phase: 'home' | 'ranking' | 'priority' | 'chat1' | 'chat2' | 'result';
  isQuickRecommendation?: boolean; // 바로 추천받기 여부
}

// 대화 상태 (Chat 페이지)
interface ConversationalState {
  inAttributeConversation: boolean; // 속성별 대화 모드
  attributeConversationTurn: number; // 현재 턴 (1~5)
  waitingForTransitionResponse: boolean; // 전환 의사 대기
}
```

### Core Attributes (`data/attributes.ts`)

**CORE_ATTRIBUTES**: 7개 (UI 및 대화용, durability 제외)
**PRIORITY_ATTRIBUTES**: 6개 (priceValue 제외)
**CoreValues interface**: 8개 속성 (durability 포함, 제품 데이터용)

**Note**: `CoreValues` interface has 8 properties including `durability`, but `CORE_ATTRIBUTES` array only has 7 (durability removed from UI). Product data may still have durability scores but they're not displayed or used in conversations.

**The 7 active attributes** (in `CORE_ATTRIBUTES`):
1. temperatureControl (온도 조절/유지 성능)
2. hygiene (위생/세척 편의성)
3. material (소재/안전성)
4. usability (사용 편의성)
5. portability (휴대성) - optional
6. priceValue (가격 대비 가치) - optional
7. additionalFeatures (부가 기능 및 디자인) - optional

**Priority page uses 6** (excludes priceValue, which is handled via budget selection)

Each attribute:
- `key`: Property name
- `name`: 한글 이름
- `description`: 설명
- `details`: 세부 사항 배열 (AI 질문 생성에 사용)
- `conversationalIntro`: 대화형 인트로
- `importanceExamples`: 중요도별 예시 (DEPRECATED in Priority flow)
- `isOptional`: 선택적 속성 여부

### API Endpoints

#### **POST /api/chat**
Multi-purpose endpoint with `action` parameter:

**Priority 플로우 전용**:
- `generate_priority_summary`: Priority 설정 요약 문구 생성
- `generate_attribute_conversation`: 속성별 자유 대화 (3~5턴)
- `analyze_transition_intent`: 전환 의사 분석 ("네", "넘어가요" 등)
- `parse_budget`: 자연어 예산 파싱 (DEPRECATED - Priority 페이지에서 처리)

**공통**:
- `phase: 'chat2'`: Chat2 오픈 대화

**DEPRECATED (기존 플로우)**:
- `generate_followup`: Phase 0 맥락 기반 follow-up (Priority에서 사용 안 함)
- `reassess_importance`: Follow-up 답변 기반 중요도 재평가
- `phase: 'chat1'`: 7개 속성 순차 질문 (analyzeUserIntent 사용)

#### **POST /api/recommend**
SSE streaming endpoint
- Input: `{ messages, prioritySettings, budget }`
- Output: Progress events (0-100%) + final recommendations
- Format: `data: {"phase": "...", "progress": ..., "message": "..."}\n\n`

### AI Integration (`lib/ai/gemini.ts`)

**Model**: `gemini-flash-lite-latest`
**Retry**: `callGeminiWithRetry()` - 3회, 지수 백오프 (1s, 2s, 4s)
**JSON Parsing**: `parseJSONResponse<T>()` - 마크다운 코드 블록 제거

**Temperature**:
- 분류 (전환 의사 분석): 0.3
- 생성 (속성별 대화, Chat2): 0.7

### Key Agents

**Priority 플로우 전용**:
- `lib/agents/personaGenerator.ts`: Priority 설정을 가중치로 변환
- `lib/agents/contextSummaryGenerator.ts`: 사용자 맥락 요약

**공통**:
- `lib/agents/productEvaluator.ts`: Top 5 제품 평가
- `lib/agents/recommendationWriter.ts`: Top 3 추천 이유 생성

**DEPRECATED**:
- `lib/ai/intentAnalyzer.ts`: 자연어 의도 분석 (analyzeUserIntent)
- `lib/utils/messageTemplates.ts`: follow-up 질문 템플릿
- `lib/utils/contextRelevance.ts`: Phase 0 맥락 연관도 판단

### Session & Logging

**Session Management**: Browser `sessionStorage`
- Key: `babyitem_session`
- 포함: prioritySettings, budget, messages, phase0Context, phase, etc.
- Priority 페이지 → Chat → Result 전환 시 유지

**Logging** (`lib/logging/`):
- `logger.ts`: 서버 Supabase 로깅
- `clientLogger.ts`: 클라이언트 래퍼
- Table: `daily_logs` (date + events array)

### UI/UX Guidelines

- Max width: 480px (mobile-first)
- Target: 30-40대 육아맘 (친근하고 공감적인 톤)
- Min touch area: 44×44px
- Framer Motion: 페이지 전환, 버튼 애니메이션
- Priority 페이지: 단일 페이지 (attributes + budget 통합)

### Environment Variables

```env
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

**Note**: Supabase is only used for logging. The app will work without it, but logs won't be saved.

## Key Implementation Notes

1. **Priority 페이지 필수**: 모든 사용자는 Priority 페이지를 먼저 거침
2. **예산은 Priority에서**: Chat에서 예산 질문 안 함
3. **'high' 속성만 대화**: 'medium', 'low'는 Persona 생성 시에만 반영
4. **3~5턴 제한**: 속성별 대화는 최대 5턴, 3턴 권장, 5턴 시 강제 전환
5. **Phase 0 선택적**: Priority 플로우에서는 특별한 상황만 물음 (스킵 가능)
6. **바로 추천받기**: Chat 없이 Priority + Budget만으로 추천 가능
7. **가중치 매핑**:
   - high → 10
   - medium → 7
   - low → 5

## Common Gotchas

- **DEPRECATED 파일들**: `lib/workflow/recommendationWorkflow.ts`, intentAnalyzer, contextRelevance 등은 Priority 플로우에서 사용 안 함
- **속성 개수 불일치**:
  - `CoreValues` interface: 8개 속성 (durability 포함)
  - `CORE_ATTRIBUTES` array: 7개 (durability 제외, UI용)
  - `PRIORITY_ATTRIBUTES` array: 6개 (priceValue 제외, Priority 페이지용)
- **JSON 파싱**: AI 응답이 ````json\n...\n``` 블록에 감싸져 올 수 있음
- **턴 카운터**: `attributeConversationTurn`은 1부터 시작 (0이 아님)
- **강제 전환**: 턴 5 도달 시 사용자 응답 무시하고 다음 속성으로
- **Phase 0 맥락**: Priority 플로우에서는 "특별한 상황" 중심, 필수 아님
- **Durability 속성**: `CoreValues`에는 존재하지만 UI/대화에서는 사용 안 함

## Migration Notes (기존 플로우 → Priority 플로우)

**제거된 것들**:
- Phase 0 워밍업 (기존): "어떤 상황이든 좋아요" → Priority 플로우에서는 선택적
- 7개 속성 순차 질문: Priority 페이지에서 사전 설정
- 중요도 버튼 (3개): Priority 페이지에서 처리
- Follow-up 질문 (연관도 기반): 속성별 자유 대화로 대체
- 중요도 재평가: Priority 설정이 최종
- 예산 질문 (Chat 중간): Priority 페이지로 통합
- `/budget` 페이지: 삭제됨 (Priority 페이지에 통합)

**변경된 것들**:
- Phase 0: 필수 → 선택적 (특별한 상황만)
- 속성 질문: 7개 전체 → 'high' 선택만
- 대화 구조: 고정 패턴 → 3~5턴 자유 대화
- 예산: Chat 중간 → Priority 페이지 (통합, 커스텀 입력 지원)
- Priority 페이지: 2단계 분리 → 단일 페이지 통합
- Persona 가중치: 대화 기반 → Priority 설정 기반 (Chat은 선택적 보강)

**유지되는 것들**:
- Chat2 (오픈 대화)
- Recommendation Workflow (Persona → Filtering → Evaluation → Top 3)
- Product 데이터 구조
- Logging 시스템
- Admin 페이지

## Debugging & Troubleshooting

### Common Issues

**Session not persisting between pages**:
- Check browser console for `sessionStorage` errors
- Session key: `babyitem_session`
- Clear session: `sessionStorage.removeItem('babyitem_session')`

**AI responses failing**:
- Verify `GEMINI_API_KEY` in `.env.local`
- Check retry logic in `lib/ai/gemini.ts` (3 attempts with exponential backoff)
- Look for JSON parsing errors (use `parseJSONResponse()`)

**Recommendation workflow timeout**:
- SSE endpoint has no explicit timeout, but typically completes in 10-30s
- Check browser Network tab for `/api/recommend` streaming response
- Verify progress events are being sent (0-100%)

**Products not loading**:
- Product files in `data/products/` are markdown with frontmatter
- Use `loadAllProducts()` from product loader
- Check file format: frontmatter + content sections

### Testing Flow

**Quick test of full flow**:
1. Visit `/` → click start
2. Visit `/ranking` → view products
3. Visit `/priority` → set 1-3 'high' priorities + budget → "바로 추천받기"
4. Visit `/result` → see recommendations

**Test chat flow**:
1. Same as above but click "채팅으로 더 자세히"
2. Chat will ask about each 'high' priority (3-5 turns each)
3. Then Chat2 phase (2-3 additional questions)
4. Click "추천 받기" button

**Admin features**:
- `/admin` - View logs (requires Supabase)
- `/admin/upload` - Upload new products from Coupang review URLs
