# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered baby product recommendation service using an **Agentic Workflow** architecture with Google Gemini API. Core concept: "From the top N most popular products, we'll pick the perfect top 3 for you."

**Primary Focus**: Formula milk warmer (분유포트) with full tag-based selection flow
**Additional Categories**: 8 other baby product categories with alternative flow

**Tech Stack**: Next.js 16.0.1 (App Router), React 19.2.0, TypeScript, Tailwind CSS v4, Framer Motion, Google Gemini API, Supabase (logging only)

**Supported Product Categories** (9 total):
- **Feeding**: baby_formula_dispenser, milk_powder_port, baby_bottle, baby_bottle_sterilizer
- **Baby Life**: baby_monitor, baby_play_mat, car_seat, nasal_aspirator, thermometer

## Development Commands

```bash
npm run dev         # Start dev server at http://localhost:3000
npm run build       # Build for production
npm start           # Start production server
npm run lint        # Run ESLint
```

## Architecture Overview

### Page Flow (14+ Pages)

**Main Flow** (Priority-based, milk_powder_port only):
1. **Home** (`/`) → Product ranking list (integrated) + favorites (찜하기) feature
2. **Priority** (`/priority`) → Tag-based conversational priority selection
3. **Result** (`/result`) → Top 3 personalized recommendations
4. **Chat** (`/chat`) → Deep-dive conversation for re-recommendation (accessed from Result page)
5. **Compare** (`/compare`) → Side-by-side comparison of 3 products with AI-generated features
6. **Product Chat** (`/product-chat`) → Detailed Q&A about specific products

**Alternative Flow** (Category-based, all 9 product categories):
1. **Categories** (`/categories`) → Select product category (9 categories)
2. **Anchor** (`/anchor`) → Select anchor product from category
3. **Tags** (`/tags`) → Tag-based conversational selection (pros/cons/budget)
4. **Result V2** (`/result-v2`) → Top 3 recommendations for selected category

**Utility Pages**:
- **Favorites** (`/favorites`) → View saved favorite products
- **Product Detail** (`/product/[id]`) → Individual product detail page
- **Admin** (`/admin`) → Log viewer with statistics dashboard
- **Admin Upload** (`/admin/upload`) → Product management interface

### User Journey Flows

**Main Flow** (분유포트 only, fully featured):
```
Home (/)
  → Browse products & add favorites (최대 3개)
  → Click "1분만에 추천받기"
    ↓
Priority (/priority) - TAG-BASED SYSTEM
  → Step 1: View 3 anchor products (국민템/가성비/프리미엄)
  → Step 2: Select pros tags (장점 태그 선택)
  → Step 3: Select cons tags (단점 태그 선택, optional skip)
  → Step 4: Select additional consideration tags (추가 고려사항, optional skip)
  → Step 5: Select budget
  → [Step 6: Product preview - filtered results shown]
  → Natural language input supported at any step
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

**Alternative Category-Based Flow** (All 9 categories):
```
Categories (/categories)
  → Select product category (분유포트, 젖병, 젖병소독기, etc.)
    ↓
Anchor (/anchor)
  → View top products in category (sorted by reviews)
  → Select one anchor product
    ↓
Tags (/tags)
  → Step 1: View selected anchor product
  → Step 2: Select pros tags from product reviews
  → Step 3: Select cons tags (optional skip)
  → Step 4: Select budget
  → Natural language input supported
  → Click "추천받기"
    ↓
Result-v2 (/result-v2)
  → View Top 3 recommendations for category
  → Can switch anchor product and regenerate
  → [Optional paths]:
     • "비교하기" → /compare
```

### Category-Based Flow (Alternative Journey)

**Overview**: Alternative flow for all 9 product categories, simpler than Priority flow

**Categories** (`/categories`):
- User selects from 9 product categories
- Categories grouped into: Feeding (4) and Baby Life (5)

**Anchor Selection** (`/anchor`):
- Loads top products in selected category via `/api/anchor-products`
- Products sorted by review count (most popular first)
- User selects ONE anchor product to base recommendations on
- Opens guide bottom sheet automatically on load

**Tags Selection** (`/tags`):
- 4-step conversational flow (similar to Priority but simpler)
- Step 1: Shows selected anchor product
- Step 2: Pros tags (dynamically generated from anchor product reviews via `/api/generate-tags`)
- Step 3: Cons tags (optional skip)
- Step 4: Budget selection (category-specific, 3 options)
- Natural language input supported at any step
- State saved in `sessionStorage` with key `tag_selections`

**Result V2** (`/result-v2`):
- Uses `/api/recommend-v2` endpoint
- Top 3 recommendations based on anchor product + selected tags
- Can switch to different anchor product and regenerate
- Simpler than main Result page (no chat re-recommendation)

### Priority Flow (Main User Journey) - TAG-BASED SYSTEM

**IMPORTANT**: The Priority page uses a **conversational, tag-based selection system** instead of simple attribute sliders.

**Only for milk_powder_port category** - other categories use the simpler Category-Based Flow above.

#### **Priority Page** (`/priority`) - Multi-Step Conversational Flow

**Architecture**:
- Chat-like interface with typing animations
- Natural language input supported at any step
- Tag selections automatically converted to `PrioritySettings`
- State persisted in `sessionStorage` (key: `babyitem_priority_conversation`)
- Progress tracked through 5 steps (6 including product preview)

**Step 1: Anchor Products Display**
- Shows 3 representative products:
  1. **국민템 (Ranking)**: 보르르 분유포트 (most popular)
  2. **가성비 (Value)**: 리웨이 분유포트 (best value)
  3. **프리미엄 (Premium)**: 베이비부스트 이지 분유포트 (premium features)
- Each product card shows pros/cons derived from reviews
- User can view product details via bottom sheet

**Step 2: Pros Tags Selection (장점 태그)**
- User selects pros tags from anchor products
- Tags are specific, concrete features (e.g., "1도 단위로 정확하게 온도 조절할 수 있어요")
- Each tag has `relatedAttributes` with weights:
  - Primary attribute: `weight: 1.0`
  - Secondary attributes: `weight: 0.3-0.5`
- **Validation**: Must select enough tags to create at least 1 'high' priority
- **Data**: `data/priorityTags.ts` - `PROS_TAGS[]`
- Popular tags highlighted based on click statistics from `/api/tag-stats`

**Step 3: Cons Tags Selection (단점 태그)**
- User selects cons tags (concerns/dealbreakers)
- Tags represent negative aspects to avoid
- Each tag linked to attributes with weights (reduces priority score)
- **Optional**: User can skip ("이 부분은 괜찮아요" button)
- **Data**: `data/priorityTags.ts` - `CONS_TAGS[]`

**Step 4: Additional Consideration Tags (추가 고려사항)**
- Covers attributes not well-represented in anchor products
- Examples: portability, compact size, specific use cases
- **Optional**: User can skip
- **Data**: `data/priorityTags.ts` - `ADDITIONAL_TAGS[]`

**Step 5: Budget Selection**
- 4개 예산 범위 ("Up to X" and "X+" format):
  - `0-50000`: 최대 5만원 (Up to 50,000원)
  - `50000-100000`: 최대 10만원 (Up to 100,000원)
  - `100000-150000`: 최대 15만원 (Up to 150,000원)
  - `150000+`: 15만원+ (150,000원+)
- **커스텀 예산 입력**: Natural language input supported
- **필수**: Budget must be selected to proceed

**Step 6: Product Preview (Optional Display)**
- Shows filtered products based on current selections
- Real-time filtering using `lib/filtering/quickScore.ts`
- Sortable by score or price
- User can refine selections or proceed to recommendation

**Natural Language Input**:
- Supported at any step via `ChatInputBar` component
- Calls `POST /api/parse-query` to extract priority + budget
- AI analyzes query using Gemini and maps to priority settings
- Validation ensures 1-3 'high' priorities

**Tag-to-Priority Conversion** (`lib/utils/tagToPriority.ts`):
```typescript
// Scoring system:
// - Pros tags: +3 points × weight
// - Cons tags: -2 points × weight
// - Additional tags: +3 points × weight

// Score → Priority mapping:
// - high: score >= 6
// - medium: score >= 3
// - low: score < 3

convertTagsToPriority(prosTagIds, consTagIds, additionalTagIds) → PrioritySettings
```

**Priority Page Actions**:
1. **"바로 추천받기"** → `/result`
   - Tag selections converted to `PrioritySettings`
   - Proceeds directly to recommendation (no Chat)

2. **Natural Language Query**
   - User types free-form query at any step
   - Parsed via `/api/parse-query`
   - Automatically sets priorities + budget

#### **Result Page Options** (Unchanged)
1. **"채팅하고 더 정확히 추천받기"** → `/chat` → `/result`
   - Result 페이지에서만 접근 가능
   - 'high' 속성들에 대해 추가 대화
   - 재추천 받기 (forceRegenerate flag)

2. **"비교하기"** → `/compare`
   - Top 3 제품 상세 비교표

3. **"질문하기"** → `/product-chat`
   - 특정 제품에 대한 Q&A

### Chat Flow (Re-recommendation from Result Page)

**전제조건**: Priority 페이지에서 태그 선택 → `prioritySettings` + `budget` 이미 설정됨

#### **Phase 0 (변형): Optional Context**
- "**특별한 상황**(쌍둥이, 외출 많음 등)이 있으시면 알려주세요"
- "없어요" 버튼으로 스킵 가능
- `session.phase0Context` 저장

#### **Phase 1: 'high' Attributes Deep-Dive**
- Priority 설정에서 'high' 선택된 속성들만 질문
- **속성별 자유 대화 모드** (`inAttributeConversation: true`)
  - **최소 3턴, 최대 5턴**
  - 턴 1-2: 구체적 상황 파악 질문
  - 턴 3: 종합 정리 + 전환 제안 (권장)
  - 턴 4-5: 사용자가 더 말하고 싶은 경우
  - 턴 5 도달 시 **강제 전환**

**API**: `POST /api/chat` with `action: 'generate_attribute_conversation'`

**전환 의도 분석**: `action: 'analyze_transition_intent'`

#### **Phase 2: Chat2 (Open Conversation)**
- 모든 'high' 속성 대화 완료 후
- 추가 특수 상황 파악 (2-3회 대화)
- `ASSISTANT_CHAT2_PROMPT` 사용
- "추천 받기" 버튼 표시

### Recommendation Workflow Pipeline (Unchanged)

**Entry Point**: `app/api/recommend/route.ts` (SSE streaming)

**Input**:
```typescript
{
  messages: Message[], // 전체 대화 이력
  prioritySettings: PrioritySettings, // Priority 페이지 설정 (태그 기반 변환)
  budget: BudgetRange // 예산 범위
}
```

**Phase 1: Persona Generation** (`lib/agents/personaGenerator.ts`)
- Priority 설정을 가중치로 변환:
  - `high` → 10
  - `medium` → 7
  - `low` → 5

**Phase 2-5**: (Same as before - Initial Filtering → AI Evaluation → Final Scoring → Recommendation Generation)

### Core Data Types (`types/index.ts`)

```typescript
// Priority 설정 (unchanged)
interface PrioritySettings {
  temperatureControl?: 'low' | 'medium' | 'high';
  hygiene?: 'low' | 'medium' | 'high';
  material?: 'low' | 'medium' | 'high';
  usability?: 'low' | 'medium' | 'high';
  portability?: 'low' | 'medium' | 'high';
  additionalFeatures?: 'low' | 'medium' | 'high';
}

// 세션 상태 (unchanged)
interface SessionState {
  prioritySettings?: PrioritySettings;
  budget?: BudgetRange;
  phase0Context?: string;
  messages: Message[];
  phase: 'home' | 'priority' | 'chat' | 'result' | 'compare';
  isQuickRecommendation?: boolean;
  forceRegenerate?: boolean;
  utmCampaign?: string; // NEW: UTM campaign tracking
  phone?: string; // NEW: Phone number tracking
}

// NEW: Priority 페이지 대화 상태 (별도 저장)
interface PriorityConversationState {
  messages: ChatMessage[];
  currentStep: 1 | 2 | 3 | 4 | 5; // 1: 장점, 2: 단점, 3: 추가, 4: 예산, 5: 프리뷰
  prioritySettings: PrioritySettings;
  budget: BudgetRange;
  selectedProsTags: string[];
  selectedConsTags: string[];
  selectedAdditionalTags: string[];
  customBudget: string;
  isCustomBudgetMode: boolean;
  filteredProducts: ScoredProduct[];
  sortType: 'score' | 'price';
  hasUserInput: boolean;
  additionalInput: string;
  scrollPosition: number;
  showFloatingButtons: boolean;
}
```

### Priority Tags System (`data/priorityTags.ts`)

**NEW**: Tag-based selection system for Priority page

**ANCHOR_PRODUCTS**: 3 representative products
```typescript
[
  { id: '6962086794', type: 'ranking', label: '국민템' },
  { id: '7118428974', type: 'value', label: '가성비' },
  { id: '7647695393', type: 'premium', label: '프리미엄' }
]
```

**PROS_TAGS**: Positive feature tags (11 tags)
- Each tag has:
  - `id`: Unique identifier
  - `text`: User-facing description
  - `relatedAttributes`: Array of `{ attribute, weight }` (weight: 0.3-1.0)
  - `sourceProduct`: Which anchor product it's from

**CONS_TAGS**: Negative feature tags (9 tags)
- Same structure as PROS_TAGS
- Used to reduce attribute priority scores

**ADDITIONAL_TAGS**: Additional consideration tags (covering portability, compact size, etc.)

**TAG_SELECTION_LIMITS**: Validation rules
- Pros: 1-5 tags (min 1, max 5)
- Cons: 0-4 tags (optional)
- Additional: 0-5 tags (optional)

**POPULAR_TAG_IDS**: Most-clicked tag IDs (from `/api/tag-stats`)

### Core Attributes (`data/attributes.ts`) (Unchanged)

**CORE_ATTRIBUTES**: 7개 (UI 및 대화용, durability 제외)
**PRIORITY_ATTRIBUTES**: 6개 (priceValue 제외)
**CoreValues interface**: 8개 속성 (durability 포함, 제품 데이터용)

### API Endpoints

#### **POST /api/chat**
Multi-purpose endpoint with `action` parameter
- `action: 'generate_attribute_conversation'` - Generate attribute-specific questions
- `action: 'analyze_transition_intent'` - Analyze if user wants to move to next attribute
- Input: `{ messages, action, attributeKey?, turnNumber? }`

#### **POST /api/recommend**
SSE streaming endpoint for main flow (Priority-based)
- Input: `{ messages, prioritySettings, budget }`
- Output: SSE stream with progress updates + final recommendations
- Used by: `/result` page

#### **POST /api/recommend-v2** (NEW)
Alternative recommendation endpoint for category-based flow
- Input: `{ category, anchorProduct, selectedTags, budget }`
- Output: Top 3 recommendations for selected category
- Used by: `/result-v2` page

#### **POST /api/product-chat**
Product-specific Q&A endpoint
- Input: `{ productId, question, conversationHistory }`
- Output: AI-generated answer about specific product

#### **POST /api/compare**
Generate pros/cons for 3 products
- Input: `{ productIds: [id1, id2, id3], userContext? }`
- Output: Comparative pros/cons analysis

#### **POST /api/compare-features**
Generate feature tags for 3 products
- Input: `{ productIds: [id1, id2, id3] }`
- Output: Feature comparison matrix

#### **POST /api/compare-chat**
Conversational Q&A about 3 products
- Input: `{ productIds: [id1, id2, id3], question, history }`
- Output: AI-generated comparative answer

#### **POST /api/log** (NEW)
Log event saving endpoint
- Input: `{ sessionId, eventType, ...eventData }`
- Extracts IP, userAgent from headers
- Saves to Supabase `daily_logs` table
- Returns: `{ success: true }`

#### **GET /api/tag-stats** (NEW)
Tag click statistics endpoint (public, no authentication)
- Output: `{ pros: TagStats[], cons: TagStats[], lastUpdated: string }`
- `TagStats`: `{ tag: string, clickCount: number, isPopular: boolean }`
- `isPopular`: Top 4 most-clicked tags
- Used to highlight popular tags in Priority page

#### **POST /api/parse-query**
Parse natural language query → priority settings + budget
- Input: `{ query: string }`
- Uses Gemini API to analyze user intent
- Output: `{ prioritySettings: PrioritySettings, budget: BudgetRange | null }`
- **Validation**: Ensures 1-3 'high' priorities
- Temperature: 0.3 (classification task)

#### **POST /api/parse-budget**
Parse budget from natural language input
- Input: `{ query: string, category?: Category }`
- Output: `{ budget: BudgetRange }`
- Used in both Priority and Tags pages

#### **POST /api/generate-contextual-questions**
Generate contextual questions for conversational flow
- Input: `{ prioritySettings, budget, conversationHistory, currentTurn: 1-5 }`
- Uses 'high' priority attributes to generate targeted questions
- Output: `{ question: string }`
- Temperature: 0.7 (creative question generation)
- Used in Chat page for deep-dive conversations

#### **POST /api/generate-tags**
Generate tags dynamically from product reviews
- Input: `{ productId, category }`
- Output: `{ prosTags: Tag[], consTags: Tag[] }`
- Used in category-based flow

#### **POST /api/analyze-custom-tag**
Analyze user-created custom tag and map to attributes
- Input: `{ tagText: string, tagType: 'pros' | 'cons' }`
- Output: `{ relatedAttributes: Array<{ attribute, weight }> }`
- Temperature: 0.5

#### **GET /api/anchor-products**
Load anchor products for a category
- Query: `?category={category}&limit={number}`
- Output: `{ success: boolean, products: ProductWithReviews[] }`
- Includes product details + top reviews

#### **GET /api/product-reviews**
Fetch reviews for a specific product
- Query: `?productId={id}`
- Output: `{ reviews: Review[] }`

#### **POST /api/analyze-reviews**
Analyze reviews to extract insights
- Input: `{ productId, reviews }`
- Output: `{ pros: string[], cons: string[] }`

#### **POST /api/comparative-analysis**
Advanced comparative analysis of multiple products
- Input: `{ productIds: string[], analysisType: string }`
- Output: Detailed comparative insights

#### **POST /api/agent**
Agent-based recommendation with tool use
- Input: `{ query: string, context: any }`
- Output: Agent's response with actions taken
- Experimental agentic workflow

#### **GET /api/admin/stats** (SIGNIFICANTLY UPDATED)
UTM campaign-based funnel analytics endpoint
- Auth: `x-admin-password: '1545'` header
- Output: `{ campaigns: CampaignFunnelStats[], availableCampaigns: string[], productRecommendationRankings: ProductRecommendationRanking[] }`
- **Excludes test IPs**: `['::1', '211.53.92.162', '::ffff:172.16.230.123']`
- **7-Step Funnel** (per UTM campaign):
  1. `homePageViews`: Home page visits (100% baseline)
  2. `priorityEntry`: Priority page entry
  3. `prosTagsSelected`: Pros tags selected (Step 2)
  4. `consTagsSelected`: Cons tags selected or skipped (Step 3)
  5. `additionalSelected`: Additional tags selected or skipped (Step 4)
  6. `budgetSelected`: Budget selected (Step 5)
  7. `recommendationReceived`: Recommendation completed (Result page reached)
- **Pre-recommendation Actions**: `{ total: number, unique: number }`
  - `guideOpened`: "분유포트 1분 가이드" opened
  - `rankingTabClicked`: Ranking tab clicked
- **Post-recommendation Actions**: `{ total: number, unique: number }`
  - `productChatClicked`: Product Q&A clicked
  - `recommendationReasonViewed`: "추천이유보기" clicked
  - `purchaseCriteriaViewed`: "내 구매 기준" opened
  - `coupangClicked`: Coupang link clicked
  - `lowestPriceClicked`: Lowest price link clicked
  - `comparisonTabClicked`: Comparison tab clicked
  - `comparisonChatUsed`: Comparison chat used
- **Product Recommendation Rankings**: Which products recommended most (total + by rank)

#### Admin Product Management Endpoints (NEW)
- `POST /api/admin/analyze-product`: Analyze Coupang product from URL
- `POST /api/admin/check-duplicate`: Check if product already exists
- `POST /api/admin/save-product`: Save new product to `data/products/`
- `POST /api/admin/upload-thumbnail`: Upload product image
- `GET /api/admin/logs`: Fetch daily logs (requires auth)

### AI Integration (`lib/ai/gemini.ts`) (Unchanged)

**Model**: `gemini-flash-lite-latest`
**Retry**: `callGeminiWithRetry()` - 3회, 지수 백오프 (1s, 2s, 4s)

### Product Data Structure (Unchanged)

**Location**: `data/products/` directory (markdown files with frontmatter)

### Session & Logging

**Session Management**: Browser `sessionStorage`
- Key: `babyitem_session` (main session)
- Key: `babyitem_priority_conversation` (NEW - Priority page state)
- **NEW Fields**:
  - `utmCampaign`: UTM campaign parameter from URL (`?utm_campaign=xxx`)
  - `phone`: Phone number from URL (`?phone=01012345678`)

**Logging** (`lib/logging/`):
- `logger.ts`: 서버 Supabase 로깅
- `clientLogger.ts`: 클라이언트 래퍼
- Table: `daily_logs` (date + events array)
- **Event Types** (UPDATED):
  - `page_view`: 페이지 방문 추적
  - `button_click`: 버튼 클릭 추적
  - `recommendation_received`: 추천 결과 수신
  - `message_sent`: 채팅 메시지 전송
  - `priority_set`: Priority 설정 완료
  - `favorite_added` (NEW): 찜하기 추가
  - `favorite_removed` (NEW): 찜하기 제거
  - `favorites_compare_clicked` (NEW): 찜한 상품 비교 클릭
  - `comparison_chat_message` (NEW): 비교 채팅 메시지
  - `comparison_product_action` (NEW): 비교 페이지 제품 액션

**LogEvent fields** (UPDATED):
```typescript
interface LogEvent {
  sessionId: string;
  timestamp: string;
  ip?: string;
  userAgent?: string;
  phone?: string; // NEW
  utmCampaign?: string; // NEW
  eventType: LogEventType;
  page?: string;
  buttonLabel?: string;
  // ... (other fields)
  favoriteData?: { productId, productTitle, action, currentFavoritesCount }; // NEW
  comparisonData?: { source, productIds, actionType, userMessage, aiResponse }; // NEW
}
```

**SessionSummary** (UPDATED):
```typescript
interface SessionSummary {
  sessionId: string;
  firstSeen: string;
  lastSeen: string;
  ip?: string;
  phone?: string; // NEW
  utmCampaign?: string; // NEW
  events: LogEvent[];
  journey: string[];
  completed: boolean; // Result 페이지 도달 여부
  recommendationMethods?: ('quick' | 'chat')[];
}
```

**CampaignFunnelStats** (NEW):
```typescript
interface CampaignFunnelStats {
  utmCampaign: string; // 'all' | 'none' | specific campaign
  totalSessions: number;
  funnel: {
    homePageViews: FunnelStep;
    priorityEntry: FunnelStep;
    prosTagsSelected: FunnelStep;
    consTagsSelected: FunnelStep;
    additionalSelected: FunnelStep;
    budgetSelected: FunnelStep;
    recommendationReceived: FunnelStep;
    preRecommendationActions: {
      guideOpened: { total: number, unique: number };
      rankingTabClicked: { total: number, unique: number };
    };
    postRecommendationActions: {
      productChatClicked: { total: number, unique: number };
      recommendationReasonViewed: { total: number, unique: number };
      purchaseCriteriaViewed: { total: number, unique: number };
      coupangClicked: { total: number, unique: number };
      lowestPriceClicked: { total: number, unique: number };
      comparisonTabClicked: { total: number, unique: number };
      comparisonChatUsed: { total: number, unique: number };
    };
  };
}
```

### UI/UX Guidelines (Unchanged)

- Max width: 480px (mobile-first)
- Target: 30-40대 육아맘 (친근하고 공감적인 톤)
- Min touch area: 44×44px
- Framer Motion: 페이지 전환, 버튼 애니메이션

### Environment Variables (Unchanged)

```env
GEMINI_API_KEY=your_gemini_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Key Implementation Notes

1. **Two parallel flows exist**:
   - **Main flow** (Priority-based): For milk_powder_port only, fully featured with chat re-recommendation
   - **Category flow** (Anchor-based): For all 9 categories, simpler flow with anchor product selection
2. **Priority 페이지는 태그 기반 시스템**: 단순한 속성 슬라이더가 아닌 대화형 태그 선택
3. **앵커 제품 3개** (main flow): 국민템, 가성비, 프리미엄 - 각 제품의 장단점에서 태그 생성
4. **앵커 제품 선택** (category flow): User selects one anchor product from top products in category
5. **태그 → Priority 변환**: `convertTagsToPriority()` - 점수 기반 변환 (장점 +3, 단점 -2)
6. **자연어 입력 지원**: Priority/Tags 페이지 어느 단계에서든 자유롭게 입력 가능
7. **5단계 플로우** (main): 장점 → 단점 → 추가 고려사항 → 예산 → 제품 프리뷰
8. **4단계 플로우** (category): 장점 → 단점 → 예산 → 완료
9. **상태 분리**: Main session (`babyitem_session`) + Priority conversation (`babyitem_priority_conversation`)
10. **UTM 추적**: URL 파라미터로 캠페인 추적 (`?utm_campaign=xxx`)
11. **퍼널 분석**: 7단계 퍼널 (홈 → Priority 진입 → 장점 → 단점 → 추가 → 예산 → 추천 완료)
12. **가중치 매핑**:
    - high → 10
    - medium → 7
    - low → 5
13. **Category-specific budgets**: Each category has 3 budget options in "최대 X원" format
14. **Tag generation**: Category flow dynamically generates tags from product reviews via `/api/generate-tags`

## Common Gotchas

- **Two parallel flows**: Main flow (Priority-based for 분유포트) vs Category-based flow (for all 9 categories)
- **Different recommendation engines**: `/api/recommend` for main flow, `/api/recommend-v2` for category flow
- **Priority 페이지는 더 이상 단순한 폼이 아님**: 대화형 인터페이스, 상태 관리 복잡
- **태그 가중치 시스템**: 각 태그는 여러 속성에 영향 (primary weight 1.0, secondary 0.3-0.5)
- **점수 임계값**: high ≥ 6, medium ≥ 3, low < 3
- **단계별 스킵 가능**: 단점, 추가 고려사항은 선택적
- **자연어 파싱**: `/api/parse-query`는 fallback이 아닌 primary input method
- **상태 복원**: Priority 페이지는 referrer 체크로 홈에서 오면 초기화
- **속성 개수 불일치**:
  - `CoreValues` interface: 8개 속성 (durability 포함)
  - `CORE_ATTRIBUTES` array: 7개 (durability 제외, UI용)
  - `PRIORITY_ATTRIBUTES` array: 6개 (priceValue 제외, Priority 페이지용)
- **Tag selection limits**: Pros max 5 (not 6), Cons max 4, Additional max 5
- **Budget format**: Category-based budgets use "최대 X원" format, vary by category
- **Test IP 필터링**: `['::1', '211.53.92.162', '::ffff:172.16.230.123']`
- **Tag Stats 캐싱**: Popular tags updated in real-time from Supabase
- **Step numbering**: Priority page uses 1-5 (not 0-indexed)
- **Product categories**: 9 total categories, but only milk_powder_port has full Priority flow
- **Backup files**: `.bak` and `.bak2` files exist in codebase (previous versions, can be ignored)

## Migration Notes (기존 플로우 → Tag-Based 플로우)

**제거된 것들**:
- 단순한 6개 속성 선택 UI (슬라이더/버튼)
- 속성별 직접 중요도 선택
- `/ranking` 페이지 (홈에 통합)
- `/budget` 페이지 (Priority 페이지에 통합)

**완전히 새로 만들어진 것들**:
- **Priority 페이지 전체**: 태그 기반 대화형 시스템
- **앵커 제품 시스템**: 3개 대표 제품 기반 태그 생성
- **장점/단점/추가 고려사항 태그**: 11개 장점, 9개 단점, 추가 태그들
- **태그 → Priority 변환 로직**: 가중치 기반 점수 계산
- **자연어 쿼리 파싱**: `/api/parse-query`
- **태그 클릭 통계**: `/api/tag-stats` (popular tags 표시)
- **UTM 캠페인 추적**: URL 파라미터 기반
- **퍼널 분석**: 7단계 세밀한 추적

**변경된 것들**:
- Priority 설정 방식: 직접 선택 → 태그 선택 + 변환
- 예산 입력: 별도 페이지 → Priority 페이지 Step 5
- Admin 통계: 기본 통계 → UTM 기반 퍼널 분석
- 세션 추적: 기본 정보 → UTM, phone 추가
- 로깅: 페이지/버튼 중심 → 퍼널 단계 중심

**유지되는 것들**:
- Chat 플로우 (Result에서 재추천용)
- Recommendation Workflow (Persona → Filtering → Top 3)
- Product 데이터 구조
- Compare 페이지
- Product Chat 페이지

## Debugging & Troubleshooting

### Common Issues

**Priority conversation not persisting** (Main flow):
- Check `sessionStorage` for `babyitem_priority_conversation`
- Clear state: `sessionStorage.removeItem('babyitem_priority_conversation')`
- Check referrer: Coming from home clears state

**Tags conversation not persisting** (Category flow):
- Check `sessionStorage` for `tag_selections`
- Clear state: `sessionStorage.removeItem('tag_selections')`

**Tags not converting to priorities correctly**:
- Inspect `convertTagsToPriority()` output in console
- Check tag weights in `data/priorityTags.ts` (main flow) or dynamic generation (category flow)
- Verify score thresholds: high ≥ 6, medium ≥ 3, low < 3

**Natural language parsing fails**:
- Check Gemini API key
- Review `/api/parse-query` (main) or `/api/parse-budget` (category) response in Network tab
- Verify 1-3 'high' priorities constraint (main flow only)

**Tag statistics not showing** (Main flow):
- Supabase must be available
- Check `/api/tag-stats` endpoint
- Verify `daily_logs` table has button_click events with tag labels

**Dynamic tag generation fails** (Category flow):
- Check `/api/generate-tags` endpoint
- Verify anchor product has reviews loaded
- Check `mentionCount` for each generated tag

**Recommendation endpoints**:
- Main flow uses `/api/recommend` (SSE streaming)
- Category flow uses `/api/recommend-v2` (standard POST)
- Verify correct endpoint for your flow

**Funnel stats incorrect**:
- Verify excluded IPs: `['::1', '211.53.92.162', '::ffff:172.16.230.123']`
- Check UTM campaign parameter in URL
- Inspect `SessionSummary` objects in admin logs
- Ensure proper button labels for funnel steps

### Testing Flows

**Test Main Flow** (Priority-based, 분유포트):
1. Visit `/` → view ranking products
2. Click "1분만에 추천받기" button
3. Visit `/priority`:
   - View 3 anchor products
   - Select 2-3 pros tags (장점)
   - Select 1-2 cons tags or skip (단점)
   - Select 0-1 additional tags or skip (추가 고려사항)
   - Select budget
   - View filtered products (optional)
   - Click "바로 추천받기"
4. Visit `/result` → see recommendations
5. Optional: Test chat re-recommendation flow

**Test Category Flow** (Anchor-based, all categories):
1. Visit `/categories`
2. Select a category (e.g., 젖병)
3. Visit `/anchor`:
   - View top products in category
   - Select one anchor product
4. Visit `/tags`:
   - View selected anchor
   - Select pros tags (dynamically generated)
   - Select cons tags or skip
   - Select budget
   - Click "추천받기"
5. Visit `/result-v2` → see recommendations
6. Optional: Switch anchor and regenerate

**Test natural language input**:
1. Visit `/priority` or `/tags`
2. Type query: "쌍둥이라 분유를 자주 타고, 세척이 편한 게 중요해요. 예산은 10만원 정도요."
3. Verify priority settings and budget auto-filled
4. Proceed to recommendation

**Test UTM tracking**:
1. Visit `/?utm_campaign=test`
2. Complete full flow to Result
3. Check `/api/admin/stats` → filter by 'test' campaign
4. Verify funnel stats

**Admin features**:
- `/admin` - View logs and statistics dashboard
  - Password: `1545`
  - Statistics dashboard shows:
    - **UTM Campaign Selector**: Filter funnel by campaign
    - **7-Step Funnel**: homePageViews → priorityEntry → pros → cons → additional → budget → recommendation
    - **Pre/Post Actions**: Total + unique counts
    - **Product Recommendation Rankings**: Which products recommended most
  - Session tracking with user journey visualization
- `/admin/upload` - Upload new products from Coupang URLs

**Testing different categories**:
- Main flow only: `milk_powder_port`
- Category flow: All 9 categories (baby_bottle, baby_bottle_sterilizer, baby_formula_dispenser, baby_monitor, baby_play_mat, car_seat, nasal_aspirator, thermometer)

## Architecture Comparison: Main Flow vs Category Flow

| Feature | Main Flow (Priority) | Category Flow (Anchor-Tags) |
|---------|---------------------|----------------------------|
| **Entry Point** | Home (`/`) | Categories (`/categories`) |
| **Product Category** | milk_powder_port only | All 9 categories |
| **Selection Page** | `/priority` | `/anchor` → `/tags` |
| **Anchor Products** | 3 predefined (국민템/가성비/프리미엄) | User selects 1 from top products |
| **Tag Source** | Static (`data/priorityTags.ts`) | Dynamic (generated from reviews) |
| **Flow Steps** | 5 steps + preview (6 total) | 4 steps (anchor → pros → cons → budget) |
| **Additional Tags** | Yes (Step 4) | No |
| **Priority Conversion** | `convertTagsToPriority()` | Direct tag matching |
| **Result Page** | `/result` | `/result-v2` |
| **Recommendation API** | `/api/recommend` (SSE) | `/api/recommend-v2` (POST) |
| **Re-recommendation** | Yes (via `/chat`) | No (switch anchor only) |
| **Session Storage Key** | `babyitem_priority_conversation` | `tag_selections` |
| **Budget Options** | 4 ranges (분유포트 specific) | 3 ranges (category-specific) |
| **Natural Language** | Supported (via `/api/parse-query`) | Supported (via `/api/parse-budget`) |
| **Tag Statistics** | Yes (popular tags highlighted) | No (all tags equal) |
| **Complexity** | High (full agentic workflow) | Medium (simplified workflow) |

## Additional Documentation

Additional technical documentation can be found in the `/docs` folder:
- `AGENT_INTEGRATION_GUIDE.md` - Agent integration details
- `AGENT_INTEGRATION_COMPLETE.md` - Agent integration completion notes
- `RE_RECOMMENDATION_MECHANISM.md` - Re-recommendation mechanism

These docs may contain outdated information as the codebase has evolved. Always verify against actual code.
