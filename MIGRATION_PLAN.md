# 🚀 Baby Product AI Advisor: Migration Plan

## 📊 Executive Summary

**목표**: 분유포트 전용 MVP → 9개 카테고리 육아용품 추천 플랫폼 전환

**핵심 변화**:

- 고정 앵커 3개 → 동적 앵커 1개 (사용자 선택)
- 수동 큐레이션 태그 → Gemini 실시간 생성 (Top 50 긴 리뷰 기반)
- Markdown 기반 → Gemini File Search 기반
- 복잡한 Chat Phase 시스템 → 단순화된 무한 에이전트

**소요 시간**: 9-12일
**위험도**: 중간 (API 품질 의존성)

---

## 🔄 현재 vs 새로운 시스템

### User Journey 비교

| 단계          | 현재 (분유포트 전용)                  | 새로운 (9개 카테고리)                     | 변경 수준    |
| ------------- | ------------------------------------- | ----------------------------------------- | ------------ |
| **진입**      | Home (단일 제품 리스트)               | Home (9개 카테고리 아이콘)                | 🔴 전면 개편 |
| **기준 설정** | Priority (고정 앵커 3개 + 수동 태그)  | Anchor 선택 (동적 1개) + 실시간 태그 생성 | 🔴 전면 개편 |
| **추천**      | Persona Generator → Product Evaluator | Spec Filter → File Search → Top 3         | 🟡 부분 수정 |
| **탐색**      | Result → Product Chat → Compare       | Result + 앵커 비교군 + 무한 에이전트      | 🟡 부분 수정 |

### 데이터 아키텍처

```
❌ 현재: 3-Tier (복잡)
├─ data/products.ts          // 44개 수동 큐레이션
├─ data/products/*.md        // 장점/단점 markdown
└─ data/priorityTags.ts      // 고정 태그 (11 pros, 9 cons)

✅ 새로운: 2-Tier (단순)
├─ data/specs/*.json         // 617개 스펙 (메모리 캐싱)
├─ Gemini File Search        // 40,748개 리뷰 (벡터 검색)
└─ lib/store_ids.json        // Store ID 맵
```

---

## 📋 Phase 1: Foundation (2-3일)

### 목표

인프라 레이어 구축 - File Search, Spec Loader, 타입 정의

### 작업 목록

#### 1.1 File Search 래퍼 생성 (P0 - Critical) ⏱️ 4시간

**파일**: `lib/fileSearch.ts`

```typescript
interface FileSearchOptions {
  category: Category;
  query: string;
  filters?: {
    productIds?: string[];
    minRating?: number;
  };
  limit?: number;
}

// 주요 함수
export async function getStoreId(category: Category): Promise<string>;
export async function searchReviews(
  options: FileSearchOptions
): Promise<Review[]>;
export async function getReviewById(
  category: Category,
  reviewId: string
): Promise<Review>;
```

**구현 세부사항**:

- `lib/store_ids.json` 로드 (upload 스크립트 결과)
- Gemini File Search API 호출
- 에러 핸들링: 3회 재시도, 지수 백오프
- 타임아웃: 30초

**테스트**:

```bash
# 테스트 API 엔드포인트 생성
app/api/test-filesearch/route.ts
```

---

#### 1.2 Spec 데이터 로더 (P0 - Critical) ⏱️ 3시간

**파일**: `lib/data/specLoader.ts`

```typescript
// Global cache (서버 메모리)
let cachedSpecs: Record<Category, Product[]> = {};

export function loadSpecs(category: Category): Product[] {
  if (cachedSpecs[category]) return cachedSpecs[category];

  const filePath = path.join(
    process.cwd(),
    "data",
    "specs",
    `${category}.json`
  );
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  cachedSpecs[category] = data;
  return data;
}

export function filterByPrice(specs: Product[], maxPrice: number): Product[];
export function filterBySpec(
  specs: Product[],
  criteria: SpecCriteria
): Product[];
export function getRankingTop(specs: Product[], n: number = 10): Product[];
```

**성능 목표**:

- 첫 로드: < 100ms
- 캐시 히트: < 1ms
- 메모리 사용: < 50MB (9개 카테고리 전체)

---

#### 1.3 타입 정의 업데이트 ⏱️ 2시간

**파일**: `types/index.ts`

```typescript
// 새로운 타입 추가
export type Category =
  | "milk_powder_port"
  | "baby_bottle"
  | "baby_bottle_sterilizer"
  | "car_seat"
  | "thermometer"
  | "nasal_aspirator"
  | "baby_play_mat"
  | "baby_monitor"
  | "baby_formula_dispenser";

export interface AnchorProduct {
  id: string;
  category: Category;
  title: string;
  price: number;
  ranking: number;
  thumbnail: string;
}

export interface DynamicTag {
  id: string;
  text: string;
  type: "pro" | "con";
  source: "review" | "spec";
  confidence: number; // 0-1
}

export type IntentType =
  | "REFILTER" // 조건 변경 및 재추천
  | "PRODUCT_QA" // 특정 제품 질문
  | "COMPARE" // 제품 비교
  | "CHIT_CHAT"; // 일반 대화

export interface Review {
  reviewId: string;
  productId: string;
  text: string;
  rating: number;
  category: Category;
}
```

---

#### 1.4 환경 변수 체크 ⏱️ 30분

**파일**: `.env.local`

```bash
# 기존
GEMINI_API_KEY=your_key
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key

# 신규 추가
NEXT_PUBLIC_CATEGORIES=milk_powder_port,baby_bottle,baby_bottle_sterilizer,car_seat,thermometer,nasal_aspirator,baby_play_mat,baby_monitor,baby_formula_dispenser
```

---

### Phase 1 완료 기준 (DoD)

- [ ] File Search 테스트 API 작동 (쿼리 → 리뷰 반환)
- [ ] Spec 로딩 성능 검증 (< 100ms)
- [ ] 타입 오류 0개 (`npm run build` 성공)
- [ ] `lib/store_ids.json` 생성 확인 (9개 카테고리)

---

## 📋 Phase 2: Core Flow (4-5일)

### 목표

새로운 사용자 플로우 구축 (병렬 개발)

---

### 2.1 홈 화면 (9개 카테고리) ⏱️ 4시간

**파일 수정**: `app/page.tsx`
**파일 생성**: `components/CategorySelector.tsx`

**UI 구조**:

```
┌─────────────────────────────────────┐
│  Baby Product AI Advisor            │
│  어떤 제품을 찾으시나요?            │
├─────────────────────────────────────┤
│  [🍼 젖병]   [🔥 소독기]  [🚗 카시트] │
│  [🌡️ 체온계] [👃 코흡기]  [🧸 플레이매트]│
│  [📹 모니터] [🥛 분유포트] [📦 분유보관함]│
└─────────────────────────────────────┘
```

**라우팅**:

```typescript
onClick={() => router.push(`/anchor?category=${category}`)}
```

**아이콘**: `@phosphor-icons/react` 사용

---

### 2.2 앵커 선택 페이지 ⏱️ 6시간

**파일 생성**: `app/anchor/page.tsx`

**플로우**:

1. URL에서 `category` 파라미터 추출
2. Spec 데이터 로드 → 랭킹 1위 자동 선택
3. "변경하기" 버튼 → Top 10 리스트 또는 검색
4. 선택 완료 → `/tags?anchor={id}&category={cat}`

**UI 요소**:

```
┌─────────────────────────────────────┐
│ 분유포트 추천 시작하기              │
├─────────────────────────────────────┤
│ 기준 제품: 보르르 분유포트 [변경]  │
│                                     │
│ [제품 이미지]                       │
│ 보르르 분유포트                     │
│ 95,000원 | 랭킹 1위                │
│                                     │
│ [이 제품을 기준으로 시작하기]       │
└─────────────────────────────────────┘
```

**"변경하기" 바텀시트**:

- Top 10 제품 리스트 (가로 스크롤)
- 검색바 (제품명으로 검색)

---

### 2.3 동적 태그 생성 페이지 ⏱️ 1일 (8시간)

**파일 생성**:

- `app/tags/page.tsx`
- `app/api/generate-tags/route.ts`

**Step 1: 리뷰 샘플링 (서버)** ⏱️ 2시간

```typescript
// app/api/generate-tags/route.ts

export async function POST(req: Request) {
  const { anchorProductId, category } = await req.json();

  // 1. File Search로 해당 제품 리뷰 가져오기
  const reviews = await searchReviews({
    category,
    query: "",
    filters: { productIds: [anchorProductId] },
    limit: 1000,
  });

  // 2. 길이 순 정렬 → Top 50
  const sortedReviews = reviews
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 50);

  // 3. Gemini에게 전달
  const tags = await generateTagsFromReviews(sortedReviews);

  return Response.json(tags);
}
```

**Step 2: 태그 생성 (Gemini)** ⏱️ 3시간

```typescript
async function generateTagsFromReviews(
  reviews: Review[]
): Promise<DynamicTags> {
  const prompt = `
다음은 실제 사용자 리뷰 50개입니다.

${reviews.map((r) => `- ${r.text}`).join("\n")}

위 리뷰를 분석하여:
1. **장점(Pros)**: 이 제품의 구체적인 장점을 문장 형태로 8-12개 추출
   - 예: "1도 단위로 정확하게 온도 조절할 수 있어요"
   - 추상적 표현 금지 (예: "좋아요", "만족해요")

2. **단점(Cons)**: 실제 사용자들이 경험한 문제점을 문장 형태로 6-10개 추출
   - 예: "유리라서 깨질까봐 조심스러워요"

JSON 형식으로 반환:
{
  "pros": ["...", "..."],
  "cons": ["...", "..."]
}
`;

  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    return JSON.parse(response.response.text());
  });

  return result;
}
```

**Step 3: 사용자 선택 UI** ⏱️ 3시간

**3-Step UI**:

```
Step 1: 장점 선택
┌─────────────────────────────────────┐
│ 어떤 점이 가장 마음에 드시나요? (1-4개) │
├─────────────────────────────────────┤
│ [✓] 1도 단위로 정확하게 온도 조절    │
│ [ ] 넓은 입구로 세척이 편해요        │
│ [✓] 24시간 내내 온도를 유지해줘요   │
│ ...                                 │
│ [다음 단계]                          │
└─────────────────────────────────────┘

Step 2: 피할 단점 (선택적)
┌─────────────────────────────────────┐
│ 꼭 개선되어야 하는 점이 있나요? (0-4개)│
├─────────────────────────────────────┤
│ [ ] 유리라서 깨질까봐 조심스러워요   │
│ [ ] 냉각 시간이 2시간이나 걸려요     │
│ [ ] 터치 버튼이 너무 민감해요        │
│ ...                                 │
│ [괜찮아요 (건너뛰기)] [다음 단계]        │
└─────────────────────────────────────┘

Step 3: 예산 입력
┌─────────────────────────────────────┐
│ 예산은 어느 정도인가요?              │
├─────────────────────────────────────┤
│ [5만원 이하]  [5~10만원]            │
│ [10~15만원]   [15만원 이상]         │
│                                     │
│ 또는 직접 입력: [________] 원       │
│                                     │
│ [추천받기]                           │
└─────────────────────────────────────┘
```

**선택 순서 = 우선순위**:

- 첫 번째 선택: 가장 중요
- 두 번째 선택: 두 번째로 중요
- 최대 4개까지

---

### 2.4 하이브리드 추천 엔진 (핵심) ⏱️ 1.5일 (12시간)

**파일 생성**: `app/api/recommend-v2/route.ts`

**Step A: 정량 필터링 (로컬)** ⏱️ 3시간

```typescript
async function quantitativeFilter(
  category: Category,
  budget: number,
  hardSpecs?: SpecCriteria
): Promise<Product[]> {
  // 1. 스펙 로드 (캐시)
  const allSpecs = loadSpecs(category);

  // 2. 예산 필터링
  let candidates = filterByPrice(allSpecs, budget);

  // 3. 하드 스펙 필터링 (있으면)
  if (hardSpecs) {
    candidates = filterBySpec(candidates, hardSpecs);
  }

  // 4. 랭킹 순 정렬 → Top 20
  return candidates.sort((a, b) => a.ranking - b.ranking).slice(0, 20);
}
```

**Step B: 정성 검색 (File Search)** ⏱️ 5시간

```typescript
async function qualitativeSearch(
  category: Category,
  candidates: Product[],
  selectedProsTags: string[],
  selectedConsTags: string[]
): Promise<Product[]> {
  // 1. 쿼리 생성 (태그 → 자연어)
  const query = buildSearchQuery(selectedProsTags, selectedConsTags);

  // 예: "온도를 정확하게 조절할 수 있고, 24시간 보온이 가능하며,
  //      유리 재질이 아니고, 소음이 적은 제품"

  // 2. File Search 실행 (후보군 ID 필터링)
  const candidateIds = candidates.map((c) => c.productId);
  const searchResults = await searchReviews({
    category,
    query,
    filters: { productIds: candidateIds },
    limit: 100,
  });

  // 3. 제품별 적합도 점수 계산
  const productScores = calculateRelevanceScores(searchResults, candidates);

  // 4. 상위 3개 선정
  return productScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((ps) => ps.product);
}

function buildSearchQuery(pros: string[], cons: string[]): string {
  const prosText = pros.join(", ");
  const consText =
    cons.length > 0 ? ` 그리고 ${cons.join(", ")}는 아닌 제품` : "";

  return `${prosText}${consText}`;
}
```

**Step C: 상세 설명 생성 (Gemini)** ⏱️ 4시간

```typescript
async function generateDetailedExplanations(
  anchorProduct: Product,
  topProducts: Product[],
  category: Category
): Promise<ProductWithExplanation[]> {
  // 병렬 처리
  return Promise.all(
    topProducts.map((product) =>
      generateExplanation(anchorProduct, product, category)
    )
  );
}

async function generateExplanation(
  anchor: Product,
  product: Product,
  category: Category
): Promise<ProductWithExplanation> {
  // 1. 제품 리뷰 가져오기
  const reviews = await searchReviews({
    category,
    query: "",
    filters: { productIds: [product.productId] },
    limit: 30,
  });

  // 2. Gemini로 비교 설명 생성
  const prompt = `
당신은 육아용품 전문가입니다.

**기준 제품 (앵커)**:
- 제품명: ${anchor.title}
- 가격: ${anchor.price.toLocaleString()}원
- 주요 스펙: ${JSON.stringify(anchor.specs)}

**비교 제품**:
- 제품명: ${product.title}
- 가격: ${product.price.toLocaleString()}원
- 주요 스펙: ${JSON.stringify(product.specs)}
- 실제 리뷰 30개: ${reviews.map((r) => r.text).join("\n")}

**요구사항**:
1. 앵커 제품 대비 이 제품의 장점/단점을 비교 설명
2. 구체적인 사실만 언급 (리뷰 기반)
3. 각 주장 끝에 반드시 [ReviewID] 형식으로 출처 표기
4. 2-3문장으로 요약

예시:
"보르르보다 소음이 훨씬 적어서 밤 수유에 좋아요[Review_123].
하지만 냉각 시간은 10분 더 걸립니다[Review_456]."

설명을 생성해주세요:
`;

  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    return response.response.text();
  });

  // 3. Citation 파싱
  const citations = parseCitations(result);

  return {
    ...product,
    explanation: result,
    citations,
  };
}

function parseCitations(text: string): Citation[] {
  const regex = /\[([^\]]+)\]/g;
  const matches = [...text.matchAll(regex)];

  return matches.map((m) => ({
    reviewId: m[1],
    position: m.index,
  }));
}
```

---

### 2.5 결과 화면 (4열 비교) ⏱️ 6시간

**파일 생성**: `app/result-v2/page.tsx`

**UI 구조**:

```
┌────────────────────────────────────────────────────────────┐
│  분유포트 추천 결과                                         │
├────────────────────────────────────────────────────────────┤
│  [앵커]     [추천 1]      [추천 2]      [추천 3]          │
│  보르르     리웨이        미엘루        홈비즈              │
│  95,000원   54,900원      62,900원      48,000원           │
│  (기준)     (1위)         (2위)         (3위)              │
│                                                            │
│  [상세 설명 - 추천 1]                                      │
│  보르르보다 소음이 적어서 밤 수유에 좋아요 [1]             │
│  하지만 냉각 시간은 10분 더 걸립니다 [2]                   │
│                                                            │
│  [쿠팡에서 보기] [최저가 보기]                             │
├────────────────────────────────────────────────────────────┤
│  💬 궁금한 점이 있으신가요?                   [전송]        │
└────────────────────────────────────────────────────────────┘
```

**Citation 클릭 시**:

```
┌────────────────────────────────────┐
│ 📝 원본 리뷰                       │
├────────────────────────────────────┤
│ ⭐⭐⭐⭐⭐ (5점)                    │
│                                    │
│ 정말 조용해요! 아기가 자는 옆에서 │
│ 물 끓여도 안 깨더라고요. 보르르   │
│ 쓰다가 바꿨는데 만족스럽습니다.   │
│                                    │
│ 작성일: 2024-11-15                 │
│ [닫기]                             │
└────────────────────────────────────┘
```

---

### Phase 2 완료 기준 (DoD)

- [ ] 분유포트 카테고리 E2E 성공
- [ ] 태그 생성 속도 < 10초
- [ ] 추천 결과 정확도 수동 검증 (10회 테스트)
- [ ] Citation 클릭 → 원본 리뷰 정상 표시

---

## 📋 Phase 3: Agent & Cleanup (3-4일)

### 목표

무한 에이전트 구현 + 기존 코드 제거

---

### 3.1 시스템 프롬프트 작성 ⏱️ 2시간

**파일 생성**: `lib/system-prompt.ts`

```typescript
export const AGENT_SYSTEM_PROMPT = `
You are a highly intelligent "Baby Product AI Advisor".
Your goal is to help parents find the perfect product by reasoning
through their needs, specs, and real user reviews.

[CORE INSTRUCTIONS]
You are a very strong reasoner and planner. Before responding,
you must proactively plan and reason using these steps:

1. **Intent Classification & Constraints**:
   - Analyze if the user wants to:
     A) REFILTER: Change conditions (e.g., "cheaper", "different color")
        → Action: Update criteria & Rerun search.
     B) COMPARE: Compare specific items (e.g., "Item A vs Item B")
        → Action: Retrieve specs for both & Generate comparison.
     C) PRODUCT_QA: Ask about a specific feature (e.g., "Is the lamp replaceable?")
        → Action: Search specific product data.
     D) CHIT_CHAT: General parenting talk
        → Action: Empathize & Guide back to recommendation.
   - Identify mandatory constraints (Budget, Size) vs preferences (Color).

2. **Information Availability**:
   - Do you have the necessary info in the current context (viewing product, list)?
   - If not, which tool (FileSearch, SpecDB) do you need to call?

3. **Risk & Outcome Assessment**:
   - If the user asks for something impossible (e.g., "Silent & Super Cheap"),
     explain the trade-off instead of hallucinating.
   - Ensure your recommendation doesn't violate safety standards.

4. **Precision and Grounding**:
   - VERIFY claims using the provided Spec Data or Review Chunks.
   - Do NOT invent features. If a review says "it's quiet", quote it with [ReviewID].

5. **Completeness**:
   - Did you answer the specific question?
   - Did you suggest a logical next step?

[RESPONSE FORMAT]
- If you need to perform an action, output a JSON object with:
  { "tool": "TOOL_NAME", "args": {...} }

- If you are chatting, keep the tone:
  • Empathetic (육아 힘드시죠? 공감해드려요)
  • Professional (구체적인 사실 기반)
  • Concise (2-3문장)

[EXAMPLES]
User: "더 저렴한 걸로 보여줘"
→ { "tool": "REFILTER", "args": { "maxPrice": "current_budget * 0.8" } }

User: "1번이랑 3번 중에 뭐가 더 조용해?"
→ { "tool": "COMPARE", "args": { "productIds": ["1", "3"], "aspect": "소음" } }

User: "이거 식세기에 넣어도 돼?"
→ { "tool": "PRODUCT_QA", "args": { "productId": "current_product", "question": "식세기 사용 가능 여부" } }

User: "육아 너무 힘들다"
→ (Chit-chat mode) "정말 힘드시죠... 저도 잘 알아요. (공감)
   그래서 이런 제품들이 조금이나마 도움이 되면 좋겠어요.
   혹시 다른 조건으로 다시 찾아볼까요?"
`;
```

---

### 3.2 Intent Classifier ⏱️ 4시간

**파일 생성**: `lib/agents/intentClassifier.ts`

```typescript
export async function classifyIntent(
  message: string,
  context: ChatContext
): Promise<IntentResult> {
  const prompt = `
사용자 메시지: "${message}"

현재 컨텍스트:
- 현재 보고 있는 제품: ${context.currentProducts.map((p) => p.title).join(", ")}
- 선택한 조건: ${JSON.stringify(context.criteria)}

위 메시지를 다음 4가지 중 하나로 분류해주세요:

1. REFILTER: 조건을 변경하여 재추천 요청
   - 예: "더 싼걸로", "10만원 이하", "소음 적은거"

2. PRODUCT_QA: 특정 제품에 대한 질문
   - 예: "1번 제품 유리야?", "이거 식세기 돼?"

3. COMPARE: 여러 제품 비교
   - 예: "1번이랑 2번 뭐가 나아?", "가격 차이 얼마나 나?"

4. CHIT_CHAT: 일반 대화
   - 예: "육아 힘들다", "어떤 브랜드가 유명해?"

JSON 형식으로 반환:
{
  "intent": "REFILTER" | "PRODUCT_QA" | "COMPARE" | "CHIT_CHAT",
  "confidence": 0.0 ~ 1.0,
  "extractedParams": { ... }
}
`;

  const model = getModel("flash-lite"); // 빠른 모델
  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    return JSON.parse(response.response.text());
  });

  return result;
}
```

---

### 3.3 Tool Functions ⏱️ 8시간

**파일 생성**: `lib/agents/tools.ts`

```typescript
// Tool 1: REFILTER
export async function toolRefilter(
  newCriteria: Partial<SearchCriteria>,
  context: ChatContext
): Promise<ToolResult> {
  // 기존 조건에 새 조건 병합
  const updatedCriteria = {
    ...context.criteria,
    ...newCriteria,
  };

  // 추천 엔진 재실행
  const recommendations = await runRecommendationEngine(
    context.category,
    updatedCriteria
  );

  return {
    type: "REFILTER",
    data: recommendations,
    message: `조건을 변경하여 다시 찾아봤어요!`,
  };
}

// Tool 2: PRODUCT_QA
export async function toolProductQA(
  productId: string,
  question: string,
  category: Category
): Promise<ToolResult> {
  // 1. 제품 스펙 로드
  const specs = loadSpecs(category);
  const product = specs.find((s) => s.productId === productId);

  // 2. 제품 리뷰 검색
  const reviews = await searchReviews({
    category,
    query: question,
    filters: { productIds: [productId] },
    limit: 10,
  });

  // 3. Gemini로 답변 생성
  const prompt = `
질문: ${question}

제품 정보:
${JSON.stringify(product, null, 2)}

관련 리뷰:
${reviews.map((r) => `- ${r.text} [${r.reviewId}]`).join("\n")}

위 정보를 바탕으로 질문에 답변해주세요.
반드시 [ReviewID] 형식으로 출처를 표기하세요.
`;

  const answer = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    return response.response.text();
  });

  return {
    type: "PRODUCT_QA",
    data: { answer, citations: parseCitations(answer) },
    message: answer,
  };
}

// Tool 3: COMPARE
export async function toolCompare(
  productIds: string[],
  aspect: string,
  category: Category
): Promise<ToolResult> {
  // 1. 제품 스펙 로드
  const specs = loadSpecs(category);
  const products = productIds.map((id) =>
    specs.find((s) => s.productId === id)
  );

  // 2. 비교 대상 리뷰 검색
  const reviewsPromises = productIds.map((id) =>
    searchReviews({
      category,
      query: aspect,
      filters: { productIds: [id] },
      limit: 10,
    })
  );
  const reviews = await Promise.all(reviewsPromises);

  // 3. Gemini로 비교 생성
  const prompt = `
다음 ${productIds.length}개 제품을 "${aspect}" 측면에서 비교해주세요.

${products
  .map(
    (p, i) => `
제품 ${i + 1}: ${p.title}
- 가격: ${p.price.toLocaleString()}원
- 스펙: ${JSON.stringify(p.specs)}
- 관련 리뷰: ${reviews[i].map((r) => `${r.text} [${r.reviewId}]`).join("\n")}
`
  )
  .join("\n\n")}

각 제품의 장단점을 비교하고, 어떤 상황에 적합한지 추천해주세요.
`;

  const comparison = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    return response.response.text();
  });

  return {
    type: "COMPARE",
    data: { comparison, citations: parseCitations(comparison) },
    message: comparison,
  };
}

// Tool 4: CHIT_CHAT
export async function toolChitChat(
  message: string,
  context: ChatContext
): Promise<ToolResult> {
  const prompt = `
사용자: "${message}"

당신은 육아용품 전문가입니다.
위 메시지에 공감하고, 자연스럽게 제품 추천으로 유도해주세요.

예시:
User: "육아 너무 힘들다"
You: "정말 힘드시죠... 특히 밤 수유 때문에 잠도 부족하시고요.
     그래서 조금이라도 편한 제품을 찾는 게 중요해요.
     혹시 다른 조건으로 다시 찾아볼까요?"

2-3문장으로 답변해주세요:
`;

  const response = await callGeminiWithRetry(async () => {
    const result = await model.generateContent(prompt);
    return result.response.text();
  });

  return {
    type: "CHIT_CHAT",
    data: {},
    message: response,
  };
}
```

---

### 3.4 통합 채팅 API ⏱️ 6시간

**파일 생성**: `app/api/chat-v2/route.ts`

```typescript
export async function POST(req: Request) {
  const { message, context } = await req.json();

  // 1. Intent Classification
  const intent = await classifyIntent(message, context);

  // 2. Tool Routing
  let result: ToolResult;

  switch (intent.intent) {
    case "REFILTER":
      result = await toolRefilter(intent.extractedParams, context);
      break;

    case "PRODUCT_QA":
      result = await toolProductQA(
        intent.extractedParams.productId,
        message,
        context.category
      );
      break;

    case "COMPARE":
      result = await toolCompare(
        intent.extractedParams.productIds,
        intent.extractedParams.aspect || "전반적",
        context.category
      );
      break;

    case "CHIT_CHAT":
      result = await toolChitChat(message, context);
      break;
  }

  // 3. 응답 반환
  return Response.json({
    intent: intent.intent,
    result,
    citations: result.data.citations || [],
  });
}
```

---

### 3.5 기존 코드 제거 ⏱️ 2시간

**백업 후 제거**:

```bash
# 백업
mkdir -p .backup
mv data/products .backup/products
mv data/priorityTags.ts .backup/priorityTags.ts
mv app/priority .backup/priority
mv lib/agents/personaGenerator.ts .backup/personaGenerator.ts
mv lib/data/productLoader.ts .backup/productLoader.ts
mv lib/utils/productDetails.ts .backup/productDetails.ts

# Git commit
git add .
git commit -m "chore: backup legacy code before migration"
```

**제거 대상 파일**:

- ❌ `data/priorityTags.ts`
- ❌ `data/products/*.md` (44개)
- ❌ `lib/data/productLoader.ts`
- ❌ `lib/utils/productDetails.ts`
- ❌ `app/priority/page.tsx`
- ❌ `lib/agents/personaGenerator.ts`

**의존성 체크**:

```bash
# 제거할 파일을 import하는 곳 찾기
grep -r "priorityTags" --include="*.ts" --include="*.tsx" app/ lib/ components/
grep -r "productLoader" --include="*.ts" --include="*.tsx" app/ lib/
grep -r "personaGenerator" --include="*.ts" --include="*.tsx" app/ lib/
```

**Admin 페이지 수정**:

- Admin 페이지가 기존 코드를 참조하면 수정 필요
- 통계는 계속 작동하도록 유지

---

### 3.6 UX 개선 ⏱️ 4시간

#### Citation 뱃지 컴포넌트

**파일 생성**: `components/CitationBadge.tsx`

```typescript
interface CitationBadgeProps {
  citations: Citation[];
  onClickCitation: (reviewId: string) => void;
}

export function CitationBadge({
  citations,
  onClickCitation,
}: CitationBadgeProps) {
  return (
    <div className="inline-flex gap-1">
      {citations.map((citation, i) => (
        <button
          key={i}
          onClick={() => onClickCitation(citation.reviewId)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          [{i + 1}]
        </button>
      ))}
    </div>
  );
}
```

#### 리뷰 뷰어 컴포넌트

**파일 생성**: `components/ReviewViewer.tsx`

```typescript
export function ReviewViewer({ category, productId }: ReviewViewerProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"latest" | "longest">("latest");

  useEffect(() => {
    // API 호출
    fetch(
      `/api/reviews?category=${category}&productId=${productId}&page=${page}&sort=${sortBy}`
    )
      .then((res) => res.json())
      .then((data) => setReviews(data.reviews));
  }, [category, productId, page, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h3>전체 리뷰 ({reviews.length}개)</h3>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="latest">최신순</option>
          <option value="longest">긴 순</option>
        </select>
      </div>

      {reviews.map((review) => (
        <div key={review.reviewId} className="border p-4 rounded">
          <div className="flex items-center gap-2 mb-2">
            <span>⭐ {review.rating}</span>
            <span className="text-sm text-gray-500">{review.date}</span>
          </div>
          <p>{review.text}</p>
        </div>
      ))}

      <Pagination page={page} onPageChange={setPage} />
    </div>
  );
}
```

---

### Phase 3 완료 기준 (DoD)

- [ ] 10가지 대화 시나리오 테스트 통과
  - REFILTER: "더 싼걸로", "10만원 이하"
  - PRODUCT_QA: "1번 유리야?", "식세기 돼?"
  - COMPARE: "1번이랑 2번 비교", "가격 차이는?"
  - CHIT_CHAT: "육아 힘들다", "추천해줘"
- [ ] Intent 분류 정확도 > 90% (수동 검증)
- [ ] 응답 속도 < 3초
- [ ] Citation 클릭 → 원본 리뷰 정상 표시
- [ ] 기존 코드 제거 완료 (백업 확인)

---

## 📊 전체 타임라인

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Week 1 (Day 1-5)                                                ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Day 1-2: Phase 1 (Foundation)
├─ 1.1 File Search 래퍼              ⏱️ 4h
├─ 1.2 Spec Loader                  ⏱️ 3h
├─ 1.3 타입 정의                    ⏱️ 2h
└─ 1.4 환경 변수 체크               ⏱️ 0.5h

Day 3-5: Phase 2 시작
├─ 2.1 홈 화면                      ⏱️ 4h
├─ 2.2 앵커 선택                    ⏱️ 6h
└─ 2.3 동적 태그 생성 (절반)        ⏱️ 8h

┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Week 2 (Day 6-12)                                               ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

Day 6-8: Phase 2 완료
├─ 2.4 하이브리드 추천 엔진 ⭐       ⏱️ 12h (1.5일)
└─ 2.5 결과 화면                    ⏱️ 6h

Day 9-11: Phase 3
├─ 3.1 시스템 프롬프트              ⏱️ 2h
├─ 3.2 Intent Classifier            ⏱️ 4h
├─ 3.3 Tool Functions               ⏱️ 8h (1일)
├─ 3.4 통합 채팅 API                ⏱️ 6h
├─ 3.5 기존 코드 제거               ⏱️ 2h
└─ 3.6 UX 개선                      ⏱️ 4h

Day 12: 테스트 & QA
├─ E2E 테스트 (9개 카테고리)
├─ 성능 최적화
└─ 버그 수정
```

---

## 🎯 우선순위 (Critical Path)

### 🔴 P0 - 차단 요소 (블로킹)

**이것들이 없으면 다른 작업 불가**

- 1.1 File Search 래퍼 (모든 것의 기반)
- 1.2 Spec Loader (필터링 필수)
- 2.4 하이브리드 추천 엔진 (핵심 로직)

### 🟡 P1 - 핵심 플로우

**사용자 플로우 완성에 필수**

- 2.1 홈 화면
- 2.2 앵커 선택
- 2.3 동적 태그 생성
- 2.5 결과 화면
- 3.1-3.4 무한 에이전트

### 🟢 P2 - UX 개선

**기능은 작동하지만 경험 향상**

- 3.6 Citation 뱃지
- 3.6 리뷰 뷰어
- 로딩 스켈레톤
- 에러 핸들링 강화

### 🔵 P3 - 정리

**마지막에 해도 됨**

- 3.5 기존 코드 제거
- 코드 리팩토링
- 문서 업데이트

---

## ⚠️ 위험 요소 (Risk)

### 1. 🚨 File Search 품질 (High Risk)

**문제**: 리뷰 검색 정확도가 낮으면 추천 품질 하락
**완화책**:

- 다양한 쿼리 패턴 테스트
- 검색 결과 수동 검증
- 쿼리 엔지니어링 최적화
- Fallback: 스펙 기반 필터링 강화

### 2. ⏱️ 태그 생성 속도 (Medium Risk)

**문제**: Top 50 리뷰 → Gemini 처리 시간 오래 걸림
**목표**: < 10초
**완화책**:

- 스트리밍 UI로 체감 속도 개선
- 캐싱: Redis에 제품별 태그 저장
- 병렬 처리: 스펙 데이터 먼저 보여주기

### 3. 💰 API 비용 (Medium Risk)

**문제**: File Search + Gemini 호출 증가
**완화책**:

- 캐싱 전략 (Redis)
  - 태그: 1주일 TTL
  - 검색 결과: 1시간 TTL
  - 설명: 1일 TTL
- Rate limiting
- 모니터링 대시보드

### 4. 🐛 기존 시스템 의존성 (Low Risk)

**문제**: Admin 등 다른 페이지가 기존 코드 의존
**완화책**:

- 의존성 체크 스크립트 실행
- Admin 페이지 별도 수정
- 철저한 테스트

---

## 🚀 다음 즉시 작업 (Next Steps)

### 1️⃣ 업로드 완료 대기 (진행 중)

```bash
# 완료 확인
ls -lh lib/store_ids.json
cat lib/store_ids.json

# 예상 결과
{
  "milk_powder_port": "stores/xxx",
  "baby_bottle": "stores/yyy",
  ...
}
```

### 2️⃣ Phase 1.1: File Search 래퍼 작성

**파일**: `lib/fileSearch.ts`
**소요 시간**: 4시간

**구현 순서**:

1. store_ids.json 로드
2. searchReviews() 함수 구현
3. 에러 핸들링 + 재시도
4. 테스트 API 작성

### 3️⃣ Phase 1.2: Spec Loader 작성

**파일**: `lib/data/specLoader.ts`
**소요 시간**: 3시간

**구현 순서**:

1. Global cache 구현
2. loadSpecs() 함수
3. filterByPrice() 함수
4. 성능 테스트

### 4️⃣ 테스트 API 엔드포인트

**파일**: `app/api/test-filesearch/route.ts`
**목적**: File Search 작동 확인

```typescript
// GET /api/test-filesearch?category=milk_powder_port&query=온도조절

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const query = searchParams.get("query");

  const results = await searchReviews({
    category,
    query,
    limit: 10,
  });

  return Response.json({
    success: true,
    count: results.length,
    results,
  });
}
```

**테스트 방법**:

```bash
# 브라우저에서
http://localhost:3000/api/test-filesearch?category=milk_powder_port&query=온도조절

# 또는 curl
curl "http://localhost:3000/api/test-filesearch?category=milk_powder_port&query=온도조절"
```

---

## 📈 성공 지표 (KPI)

### 기능적 지표

- [ ] E2E 성공률: 100% (9개 카테고리 모두)
- [ ] Intent 분류 정확도: > 90%
- [ ] 추천 정확도: 수동 검증 (10회 × 9개 카테고리)

### 성능 지표

- [ ] 태그 생성 시간: < 10초
- [ ] 추천 생성 시간: < 5초
- [ ] 채팅 응답 시간: < 3초
- [ ] Page load: < 2초

### 비용 지표

- [ ] API 호출당 평균 비용: < $0.05
- [ ] 일일 예상 비용: < $10 (100 사용자 기준)

---

## 🎓 학습 포인트

### 새로운 기술

1. **Gemini File Search API**

   - Vector Store 생성 및 관리
   - 효과적인 쿼리 작성
   - 메타데이터 필터링

2. **Intent Classification**

   - Few-shot learning
   - Prompt engineering
   - Confidence threshold 설정

3. **Citation Parsing**
   - 정규식 기반 파싱
   - 원본 데이터 연결
   - UI/UX 디자인

### 아키텍처 패턴

1. **하이브리드 필터링**

   - 정량 (Spec) + 정성 (Review)
   - 2-stage 파이프라인
   - 성능 최적화

2. **Tool-based Agent**

   - Intent → Tool 라우팅
   - Stateless 설계
   - 확장 가능한 구조

3. **캐싱 전략**
   - In-memory (Spec)
   - Redis (Tags, Search)
   - TTL 관리

---

## 📞 Support & Contact

**문제 발생 시**:

1. 먼저 `MIGRATION_PLAN.md` (이 문서) 참고
2. 각 Phase의 테스트 항목 확인
3. 로그 확인: `npm run dev` 출력
4. Git history 확인: `git log --oneline`

**롤백 방법**:

```bash
# 백업에서 복원
cp -r .backup/products data/
cp .backup/priorityTags.ts data/
cp -r .backup/priority app/

# Git으로 되돌리기
git log --oneline  # 커밋 ID 확인
git revert <commit-id>
```

---

## ✅ Checklist

### Pre-launch Checklist

- [ ] 9개 카테고리 모두 File Search Store 생성 확인
- [ ] 모든 Phase DoD 충족
- [ ] 성능 지표 달성
- [ ] 보안 검토 (API Key 노출 여부)
- [ ] 에러 핸들링 검증
- [ ] 모바일 반응형 확인

### Launch Day Checklist

- [ ] 환경 변수 확인 (Production)
- [ ] 백업 완료
- [ ] 모니터링 대시보드 준비
- [ ] 롤백 계획 준비
- [ ] API 사용량 모니터링 설정

---

## 📝 Appendix

### A. 파일 구조 (최종)

```
babyitem_MVP/
├─ app/
│  ├─ page.tsx                      (수정: 9개 카테고리)
│  ├─ anchor/page.tsx               (신규)
│  ├─ tags/page.tsx                 (신규)
│  ├─ result-v2/page.tsx            (신규)
│  ├─ api/
│  │  ├─ generate-tags/route.ts    (신규)
│  │  ├─ recommend-v2/route.ts     (신규)
│  │  ├─ chat-v2/route.ts          (신규)
│  │  └─ test-filesearch/route.ts  (신규 - 테스트용)
│
├─ lib/
│  ├─ fileSearch.ts                (신규)
│  ├─ system-prompt.ts             (신규)
│  ├─ data/specLoader.ts           (신규)
│  ├─ agents/
│  │  ├─ intentClassifier.ts       (신규)
│  │  └─ tools.ts                  (신규)
│
├─ components/
│  ├─ CategorySelector.tsx         (신규)
│  ├─ CitationBadge.tsx            (신규)
│  └─ ReviewViewer.tsx             (신규)
│
├─ data/
│  ├─ specs/                       (기존)
│  │  ├─ milk_powder_port.json
│  │  ├─ baby_bottle.json
│  │  └─ ... (9개)
│  └─ reviews/                     (기존)
│     ├─ milk_powder_port.jsonl
│     └─ ... (9개)
│
├─ .backup/                        (백업)
│  ├─ products/
│  ├─ priorityTags.ts
│  └─ priority/
│
└─ MIGRATION_PLAN.md               (이 문서)
```

### B. 환경 변수

```bash
# .env.local

# Gemini API
GEMINI_API_KEY=your_gemini_api_key

# Supabase (로깅)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# 카테고리 (신규)
NEXT_PUBLIC_CATEGORIES=milk_powder_port,baby_bottle,baby_bottle_sterilizer,car_seat,thermometer,nasal_aspirator,baby_play_mat,baby_monitor,baby_formula_dispenser

# Redis (선택적 - 캐싱용)
REDIS_URL=redis://localhost:6379
```

### C. 주요 의존성

```json
{
  "dependencies": {
    "@google/genai": "^1.30.0",
    "@google/generative-ai": "^0.24.1",
    "@phosphor-icons/react": "^2.1.10",
    "framer-motion": "latest",
    "next": "16.0.1",
    "react": "19.2.0"
  }
}
```

---

**마지막 업데이트**: 2024-11-27
**버전**: 1.0
**작성자**: Claude Code
