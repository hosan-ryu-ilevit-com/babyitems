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

### Page Flow (8 Pages)
1. **Home** (`/`) → Product ranking list (integrated) + favorites (찜하기) feature
2. **Priority** (`/priority`) → Single-page priority & budget selection
3. **Result** (`/result`) → Top 3 personalized recommendations
4. **Chat** (`/chat`) → Deep-dive conversation for re-recommendation (accessed from Result page)
5. **Compare** (`/compare`) → Side-by-side comparison of 3 products with AI-generated features
6. **Product Chat** (`/product-chat`) → Detailed Q&A about specific products
7. **Admin** (`/admin`) → Log viewer with statistics dashboard
8. **Admin Upload** (`/admin/upload`) → Product management interface

### User Journey Flow
```
Home (/)
  → Browse products & add favorites (최대 3개)
  → Click "1분만에 추천받기"
    ↓
Priority (/priority)
  → Set attribute priorities (high/medium/low)
  → Set budget
  → Click "바로 추천받기"
    ↓
Result (/result)
  → View Top 3 recommendations
  → [Optional paths]:
     • "채팅하고 더 정확히 추천받기" → /chat → /result (re-recommendation)
     • "비교하기" → /compare (3-product comparison table)
     • "질문하기" → /product-chat (specific product Q&A)
     • "찜한 상품 비교하기" (from Home) → /compare
```

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

#### **Priority Page Action**
**"바로 추천받기"** → `/result`
- Priority 설정 + 예산만으로 즉시 추천
- Chat 단계 스킵 (Note: Priority 페이지에서 Chat으로 직접 가지 않음)

#### **Result Page Options**
1. **"채팅하고 더 정확히 추천받기"** → `/chat` → `/result`
   - Result 페이지에서만 접근 가능
   - 'high' 속성들에 대해 추가 대화
   - 재추천 받기 (forceRegenerate flag)

2. **"비교하기"** → `/compare`
   - Top 3 제품 상세 비교표
   - AI가 생성한 핵심 특징 태그, 장단점, 한줄 비교

3. **"질문하기"** → `/product-chat`
   - 특정 제품에 대한 Q&A

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
  phase: 'home' | 'priority' | 'chat' | 'result' | 'compare';
  isQuickRecommendation?: boolean; // 바로 추천받기 여부
  forceRegenerate?: boolean; // Chat 후 재추천 플래그
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

#### **POST /api/product-chat**
Product-specific Q&A endpoint
- Input: `{ message, productId, conversationHistory }`
- Output: AI-generated answers about specific product features and details
- Uses product data and user persona for contextual responses

#### **POST /api/compare**
Generate pros/cons and comparison summary for 3 products
- Input: `{ productIds: string[] }` (exactly 3)
- Output: `{ productDetails: Record<string, { pros: string[], cons: string[], comparison: string }> }`
- Uses LLM to analyze product markdown and generate concise summaries
- Temperature: 0.7 for creative comparisons

#### **POST /api/compare-features**
Generate specific feature tags for 3 products (핵심 특징)
- Input: `{ productIds: string[] }` (exactly 3)
- Output: `{ features: Record<string, string[]> }` (4 tags per product)
- **Important**: Uses product.id as JSON keys (not price!)
- Tags must be:
  - Positive features only (no "부재", "약함", etc.)
  - Specific and quantitative (e.g., "110V/220V 프리볼트", "SUS304 스테인리스")
  - Unique per product (no duplicates across products)
  - 2-6 words each
- Temperature: 0.3 for accurate spec extraction
- Fallback: Score-based tag generation if LLM fails

#### **POST /api/compare-chat**
Conversational Q&A about 3 products being compared
- Input: `{ message, productIds: string[], conversationHistory, userContext? }`
- Output: `{ response: string, type?: 'general' | 'replace' | 'add' }`
- Supports product replacement/addition intents
- Uses user's Priority context if available

#### **GET /api/admin/stats**
Statistics dashboard endpoint (requires authentication)
- Auth: `x-admin-password: '1545'` header
- Output: `DashboardStats` with comprehensive analytics:
  - Home page visits and button clicks
  - Ranking page product click statistics
  - Priority page conversion metrics (quick vs chat recommendations)
  - Result page recommendation statistics and product performance
- Excludes test IPs: `['::1', '211.53.92.162']`
- Aggregates data across all dates in Supabase `daily_logs` table

### AI Integration (`lib/ai/gemini.ts`)

**Model**: `gemini-flash-lite-latest`
**Retry**: `callGeminiWithRetry()` - 3회, 지수 백오프 (1s, 2s, 4s)
**JSON Parsing**: `parseJSONResponse<T>()` - 마크다운 코드 블록 제거

**Temperature**:
- 분류 (전환 의사 분석): 0.3
- 생성 (속성별 대화, Chat2): 0.7

### Product Data Structure

**Location**: `data/products/` directory (markdown files with frontmatter)

**Format**:
```markdown
---
id: "product-id"
title: "제품명"
brand: "브랜드명"
price: 89000
ranking: 1
image: "/images/products/product-image.jpg"
coupangUrl: "https://link.coupang.com/..."
coreValues:
  temperatureControl: 8
  hygiene: 9
  material: 8
  usability: 7
  portability: 6
  priceValue: 8
  additionalFeatures: 7
  durability: 7  # Not used in UI but kept for data
tags: ["스테인리스", "빠른 가열"]
---

# 제품 특징 섹션 (마크다운 본문)
## 장점
- 특징 1
- 특징 2
...
```

**Loading**: Use `loadAllProducts()` from `lib/data/productLoader.ts`
- Parses frontmatter using `gray-matter`
- Sorts by ranking
- Returns `Product[]` type

### Key Agents

**Priority 플로우 전용**:
- `lib/agents/personaGenerator.ts`: Priority 설정을 가중치로 변환
- `lib/agents/contextSummaryGenerator.ts`: 사용자 맥락 요약

**공통**:
- `lib/agents/productEvaluator.ts`: Top 5 제품 평가
- `lib/agents/recommendationWriter.ts`: Top 3 추천 이유 생성
- `lib/agents/reviewAnalyzer.ts`: Admin upload 시 Coupang 리뷰 분석

**DEPRECATED (not used in current flow)**:
- `lib/ai/intentAnalyzer.ts`: 자연어 의도 분석 (analyzeUserIntent)
- `lib/utils/contextRelevance.ts`: Phase 0 맥락 연관도 판단
- `/ranking` page: Integrated into Home page

### Session & Logging

**Session Management**: Browser `sessionStorage`
- Key: `babyitem_session`
- 포함: prioritySettings, budget, messages, phase0Context, phase, etc.
- Priority 페이지 → Chat → Result 전환 시 유지

**Logging** (`lib/logging/`):
- `logger.ts`: 서버 Supabase 로깅
- `clientLogger.ts`: 클라이언트 래퍼 (`logPageView`, `logButtonClick`, etc.)
- Table: `daily_logs` (date + events array)
- **Event Types**:
  - `page_view`: 페이지 방문 추적
  - `button_click`: 버튼 클릭 추적 (buttonLabel 포함)
  - `recommendation_received`: 추천 결과 수신 (recommendations 객체 포함)
  - `message_sent`: 채팅 메시지 전송
  - `priority_set`: Priority 설정 완료
- **SessionSummary**: 세션별 집계 데이터 (journey, completed, recommendationMethods)
- **DashboardStats**: 전체 통계 집계 (home, ranking, priority, result 섹션별)

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

- **DEPRECATED 파일들**: intentAnalyzer, contextRelevance 등은 Priority 플로우에서 사용 안 함
- **속성 개수 불일치**:
  - `CoreValues` interface: 8개 속성 (durability 포함)
  - `CORE_ATTRIBUTES` array: 7개 (durability 제외, UI용)
  - `PRIORITY_ATTRIBUTES` array: 6개 (priceValue 제외, Priority 페이지용)
- **JSON 파싱**: AI 응답이 ````json\n...\n``` 블록에 감싸져 올 수 있음
- **턴 카운터**: `attributeConversationTurn`은 1부터 시작 (0이 아님)
- **강제 전환**: 턴 5 도달 시 사용자 응답 무시하고 다음 속성으로
- **Phase 0 맥락**: Priority 플로우에서는 "특별한 상황" 중심, 필수 아님
- **Durability 속성**: `CoreValues`에는 존재하지만 UI/대화에서는 사용 안 함
- **Admin 인증**: Admin 페이지 및 통계 API는 하드코딩된 비밀번호 '1545' 사용 (프로덕션에서는 환경 변수로 이동 권장)
- **Test IP 필터링**: 통계에서 `['::1', '211.53.92.162']` 자동 제외됨
- **Compare Features API**: LLM must use product.id (not price) as JSON keys. Prompt includes explicit ID validation.
- **Favorites Limit**: Maximum 3 products can be favorited (찜하기) from Home page
- **Chat Access**: Chat page is only accessible from Result page, not from Priority page

## Migration Notes (기존 플로우 → Priority 플로우)

**제거된 것들**:
- Phase 0 워밍업 (기존): "어떤 상황이든 좋아요" → Priority 플로우에서는 선택적
- 7개 속성 순차 질문: Priority 페이지에서 사전 설정
- 중요도 버튼 (3개): Priority 페이지에서 처리
- Follow-up 질문 (연관도 기반): 속성별 자유 대화로 대체
- 중요도 재평가: Priority 설정이 최종
- 예산 질문 (Chat 중간): Priority 페이지로 통합
- `/budget` 페이지: 삭제됨 (Priority 페이지에 통합)
- `/ranking` 페이지: 삭제됨 (Home 페이지에 통합)

**변경된 것들**:
- Phase 0: 필수 → 선택적 (특별한 상황만)
- 속성 질문: 7개 전체 → 'high' 선택만
- 대화 구조: 고정 패턴 → 3~5턴 자유 대화
- 예산: Chat 중간 → Priority 페이지 (통합, 커스텀 입력 지원)
- Priority 페이지: 2단계 분리 → 단일 페이지 통합
- Persona 가중치: 대화 기반 → Priority 설정 기반 (Chat은 선택적 보강)
- Chat 접근: Priority → Chat → Result에서 Priority → Result → (선택) Chat → Result로 변경
- 랭킹 표시: 별도 페이지 → Home 페이지 통합 (찜하기 기능 추가)

**유지되는 것들**:
- Chat2 (오픈 대화)
- Recommendation Workflow (Persona → Filtering → Evaluation → Top 3)
- Product 데이터 구조 (markdown with frontmatter)
- Logging 시스템 (Supabase)
- Admin 페이지 및 통계

**추가된 것들**:
- `/compare` 페이지: 3개 제품 상세 비교표
- 찜하기 기능 (Home): 최대 3개 제품 즐겨찾기
- AI 생성 핵심 특징 태그 (Compare)
- Product-specific chat (Product Chat 페이지)
- Result에서 Chat으로 재추천 플로우

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
1. Visit `/` → view products (ranking section)
2. Click "1분만에 추천받기" button
3. Visit `/priority` → set 1-3 'high' priorities + budget → "바로 추천받기"
4. Visit `/result` → see recommendations

**Test chat flow** (re-recommendation):
1. Complete quick test flow to reach Result page
2. Click "채팅하고 더 정확히 추천받기" button
3. Chat will ask about 'high' priority attributes (3-5 turns each)
4. Then Chat2 phase (2-3 additional questions)
5. Click "추천 받기" button → Return to Result with new recommendations

**Test compare flow**:
1. From Result page, click "비교하기" button → `/compare`
2. Or from Home page, favorite 3 products → click "찜한 상품 비교하기"
3. View side-by-side comparison table with:
   - AI-generated feature tags (핵심 특징)
   - Pros/Cons
   - One-line comparison (한줄 비교)
   - Core attribute scores with color-coded bars
4. Use compare chat to ask questions about the 3 products

**Admin features**:
- `/admin` - View logs and statistics dashboard (requires Supabase)
  - Password: `1545`
  - Statistics dashboard shows:
    - Home/Ranking/Priority/Result page analytics
    - Product click rankings and conversion rates
    - Recommendation performance (which products recommended most, click-through rates)
  - Detailed action logs (expandable section)
  - Session tracking with user journey visualization
- `/admin/upload` - Upload new products from Coupang review URLs
