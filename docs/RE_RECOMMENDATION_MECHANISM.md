# 재추천 바텀시트 전체 메커니즘

## 📋 목차
1. [전체 플로우 개요](#전체-플로우-개요)
2. [단계별 상세 분석](#단계별-상세-분석)
3. [예산 처리 메커니즘](#예산-처리-메커니즘)
4. [Intent 분류 규칙](#intent-분류-규칙)
5. [SSE 이벤트 처리](#sse-이벤트-처리)
6. [세션 업데이트](#세션-업데이트)
7. [에러 처리](#에러-처리)

---

## 전체 플로우 개요

```
사용자 입력 (예: "10만원 아래로 다시 보여줘")
    ↓
[1] handleSendMessage() - 클라이언트 전처리
    ↓
[2] POST /api/agent - Agent API 호출 (SSE)
    ↓
[3] classifyIntent() - 의도 분류 + 예산 파싱
    ↓
[4] Tool 실행 (REFILTER / PRODUCT_QA / COMPARE / GENERAL)
    ↓
[5] SSE 이벤트 스트리밍 (thinking → intent → message → recommendations)
    ↓
[6] 클라이언트 상태 업데이트 + 세션 저장
    ↓
[7] Result 페이지 업데이트
```

---

## 단계별 상세 분석

### [1] 클라이언트 전처리 (ReRecommendationBottomSheet.tsx:487-546)

**위치**: `handleSendMessage()`

**처리 내용**:
```typescript
1. 입력 검증 (빈 문자열 / 로딩 중 체크)
2. 사용자 메시지 추가 (UI 업데이트)
3. 누적 입력 저장 (allUserInputs)
4. 초기 Summary 저장 (첫 재추천 시)
5. 세션 데이터 로드 (tags, budget, anchorProduct)
```

**Agent API 요청 바디**:
```typescript
{
  userInput: "10만원 아래로 다시 보여줘",
  sessionId: "1234567890",
  context: {
    currentRecommendations: [/* Top 3 추천 제품 */],
    currentSession: {
      selectedProsTags: ["temp-precise", "hygiene-easy"],
      selectedConsTags: ["noise-loud"],
      budget: "0-150000",
      anchorProduct: { productId: "...", title: "..." }
    }
  },
  anchorProductId: "7118428974"  // PDP에서만 포함 (조건부)
}
```

**중요 포인트**:
- `anchorProductId`는 **PDP 재추천 시에만** 포함 (spread operator 사용)
- `...(pdpInput?.productId && { anchorProductId: pdpInput.productId })`
- Floating button 사용 시에는 포함되지 않음

---

### [2] Agent API 처리 (app/api/agent/route.ts:23-183)

**SSE 스트리밍 시작**:
```typescript
const stream = new ReadableStream({
  async start(controller) {
    const sendSSE = (type, data) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
    };

    // Step 1: Intent 분류
    sendSSE('thinking', 'Analyzing your request...');
    const intent = await classifyIntent(userInput, context, anchorProductId);
    sendSSE('intent', { tool: intent.tool, confidence: intent.confidence });

    // Step 2: Tool 실행
    switch (intent.tool) {
      case 'REFILTER_WITH_ANCHOR': ...
      case 'REFILTER': ...
      case 'PRODUCT_QA': ...
      case 'COMPARE': ...
      case 'GENERAL': ...
      case 'ASK_CLARIFICATION': ...
    }

    sendSSE('done', {});
    controller.close();
  }
});
```

---

### [3] Intent 분류 + 예산 파싱 (lib/agents/intentRouter.ts:20-140)

#### 3-1. Gemini 기반 Intent 분류

**프롬프트 구조**:
```typescript
${AGENT_SYSTEM_PROMPT}

**Current Context:**
- Current Recommendations (Top 3)
- Current Anchor Product
- Current Budget
- Selected Tags (Pros/Cons)

**User Input:** "10만원 아래로 다시 보여줘"

**Critical Rules:**
1. Budget Classification:
   - SPECIFIC: "10만원", "7만원 이하", "100000원 아래" → REFILTER
   - VAGUE: "더 저렴한 걸로", "가격 낮춰서" → ASK_CLARIFICATION
   - 숫자 + 화폐단위 = SPECIFIC!
2. Product numbers: "1번" → productRank: 1
3. clickedAnchorId → REFILTER_WITH_ANCHOR 강제
```

**Gemini 출력** (JSON):
```json
{
  "tool": "REFILTER",
  "confidence": 85,
  "needsClarification": false,
  "args": {
    "tagChanges": null,
    "budgetChange": null
  },
  "reasoning": "User wants to change budget to 100,000 won or less"
}
```

#### 3-2. 예산 자동 파싱 (후처리)

**코드**: `intentRouter.ts:105-128`

```typescript
if (intent.tool === 'REFILTER' || intent.tool === 'REFILTER_WITH_ANCHOR') {
  // 1. 자연어 → BudgetRange 변환
  const parsedBudget = parseBudgetFromNaturalLanguage(userInput);
  // "10만원 아래" → "0-100000"

  // 2. 모호성 체크
  const needsClarification = needsBudgetClarification(userInput);
  // "더 저렴한 걸로" → true
  // "10만원 아래" → false

  if (parsedBudget && !needsClarification) {
    // ✅ 구체적인 예산 - 즉시 적용
    console.log(`   💰 Parsed budget: ${parsedBudget}`);
    intent.args.budgetChange = {
      type: 'specific',
      value: parsedBudget,
      rawInput: userInput
    };
  } else if (needsClarification) {
    // ❌ 모호한 예산 - 명확화 요청
    console.log(`   ⚠️  Budget is vague`);
    intent.tool = 'ASK_CLARIFICATION';
    intent.args = {
      clarificationQuestion: "최대 얼마까지 쓸 수 있을까요?",
      clarificationContext: 'budget'
    };
  }
}
```

---

## 예산 처리 메커니즘

### 예산 파싱 함수 (budgetAdjustment.ts:47-107)

**지원 패턴**:

| 입력 | 정규식 패턴 | 출력 BudgetRange |
|------|------------|------------------|
| "10만원 아래" | `(\d+)만원(이하\|아래\|까지\|미만\|이내)` | `"0-100000"` |
| "10만원" | `(\d+)만원` | `"0-100000"` |
| "최대 7만원" | `최대(\d+)만원` | `"0-70000"` |
| "15만원 이상" | `(\d+)만원이상` | `"150000+"` |
| "10만원 정도" | `(\d+)만원정도` | `"90000-110000"` |
| "5만원에서 10만원" | `(\d+)만원(에서\|~\|-)(\d+)만원` | `"50000-100000"` |
| "70000원" | `(\d+)원?$` | `"0-70000"` |

**모호성 체크 함수**:
```typescript
needsBudgetClarification(input: string): boolean {
  const vaguePhrases = [
    '더 저렴', '더 싸', '가격 낮', '예산 줄',
    '더 비싸', '더 좋은', '가격 높', '예산 늘'
  ];
  return vaguePhrases.some(phrase => input.includes(phrase));
}
```

### 예산 처리 흐름도

```
사용자 입력: "10만원 아래로"
    ↓
parseBudgetFromNaturalLanguage("10만원 아래로")
    ↓
정규식 매칭: /(\d+)만원(이하|아래|까지|미만|이내)/
    ↓
매칭 성공: match[1] = "10"
    ↓
변환: 10 * 10000 = 100000
    ↓
반환: "0-100000"
    ↓
needsBudgetClarification("10만원 아래로")
    ↓
vaguePhrases 체크: ❌ 해당 없음
    ↓
반환: false
    ↓
intent.args.budgetChange = {
  type: 'specific',
  value: '0-100000',
  rawInput: '10만원 아래로'
}
```

---

## Intent 분류 규칙

### 6가지 Intent Types

| Intent | 트리거 조건 | 예시 | 실행 Tool |
|--------|-----------|------|----------|
| **REFILTER_WITH_ANCHOR** | "2번 제품 기반으로..." | "2번 제품 비슷한데 더 저렴한 걸로" | `executeRefilterWithAnchor()` |
| **REFILTER** | 조건 변경 (예산/태그) | "10만원 아래로 다시 보여줘" | `executeRefilterWithAnchor()` (anchor 유지) |
| **PRODUCT_QA** | "1번 제품 ~해?" | "1번 제품 세척 편해?" | `executeProductQA()` |
| **COMPARE** | "1번이랑 2번 비교" | "1번이랑 2번 중에 뭐가 더 좋아?" | `executeCompare()` |
| **ASK_CLARIFICATION** | 모호한 예산/기능 | "더 저렴한 걸로" | clarification 메시지 반환 |
| **GENERAL** | 범위 밖 질문 | "요즘 육아 너무 힘들다" | `executeGeneral()` |

### Intent 분류 우선순위

```
1. anchorProductId 존재? → REFILTER_WITH_ANCHOR 강제
2. 예산 모호? → ASK_CLARIFICATION
3. 제품 번호 언급? (1번, 2번) → PRODUCT_QA / COMPARE
4. 예산/태그 변경? → REFILTER
5. 그 외 → GENERAL
```

---

## SSE 이벤트 처리

### SSE 이벤트 타입 (7가지)

| 이벤트 타입 | 데이터 | 클라이언트 처리 |
|-----------|-------|---------------|
| **thinking** | `"Analyzing your request..."` | 로그만 출력 (로딩 인디케이터 표시 중) |
| **intent** | `{ tool: "REFILTER", confidence: 85 }` | 콘솔 로그: `Intent: REFILTER (85%)` |
| **message** | `"10만원 이하로 다시 찾아봤어요!"` | 어시스턴트 메시지 추가 + 타이핑 애니메이션 |
| **clarification** | `"최대 얼마까지 쓸 수 있을까요?"` | 어시스턴트 메시지 추가 + **로딩 종료** |
| **recommendations** | `{ recommendations: [...], updatedSession: {...} }` | 세션 업데이트 + Summary 생성 + 추천 프리뷰 |
| **error** | `"Failed to refilter"` | 에러 메시지 추가 + 로딩 종료 |
| **done** | `{}` | 스트림 종료 확인 (로그만) |

### SSE 스트림 예시

**입력**: "10만원 아래로 다시 보여줘"

```
data: {"type":"thinking","data":"Analyzing your request..."}

data: {"type":"intent","data":{"tool":"REFILTER","confidence":90}}

data: {"type":"thinking","data":"Processing..."}

data: {"type":"message","data":"**10만원 이하**로 다시 찾아봤어요!\n\n💰 **예산 조정**: 0-15만원 → 0-10만원\n\n---\n\n### 🎯 새로운 Top 3 추천\n\n**1. 보르르 분유포트** (92.5점)\n   온도 조절이 정확하고 세척이 간편해요\n   💰 78,000원\n\n..."}

data: {"type":"recommendations","data":{"recommendations":[...],"updatedSession":{...}}}

data: {"type":"done","data":{}}
```

---

## 세션 업데이트

### 업데이트 타이밍

1. **Intent 실행 후** (`executeRefilterWithAnchor` 등)
   - 새로운 `recommendations` 배열
   - 업데이트된 `selectedProsTags` / `selectedConsTags`
   - 변경된 `budget`
   - 새로운 `anchorProduct`

2. **클라이언트 수신 시** (SSE `recommendations` 이벤트)
   ```typescript
   const updatedSessionData = loadSession();
   updatedSessionData.recommendations = newRecs;
   if (updatedSession.selectedProsTags) updatedSessionData.selectedProsTags = updatedSession.selectedProsTags;
   if (updatedSession.selectedConsTags) updatedSessionData.selectedConsTags = updatedSession.selectedConsTags;
   if (updatedSession.budget) updatedSessionData.budget = updatedSession.budget;
   if (updatedSession.anchorProduct) updatedSessionData.anchorProduct = updatedSession.anchorProduct;
   saveSession(updatedSessionData);
   ```

3. **Summary 업데이트**
   - API: `POST /api/chat` with `action: 'update_priority_summary'`
   - 입력: `previousSummary` + `userInputs[]` + `prioritySettings` + `budget`
   - 출력: 업데이트된 Summary 텍스트
   - UI: 하늘색 조건 컨테이너에 표시

---

## 에러 처리

### 1. Intent 분류 실패
```typescript
catch (error) {
  return {
    tool: 'GENERAL',
    confidence: 0,
    args: { message: '죄송해요, 잘 이해하지 못했어요.' },
    reasoning: 'Error fallback'
  };
}
```

### 2. Tool 실행 실패
```typescript
if (!result.success) {
  sendSSE('error', result.error || 'Failed to refilter');
  sendSSE('done', {});
  controller.close();
}
```

### 3. SSE 스트림 에러
```typescript
try {
  // SSE 처리
} catch (error) {
  console.error('Agent API error:', error);
  const errorMessage = { type: 'error', data: String(error) };
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
  controller.close();
}
```

### 4. 클라이언트 에러 처리
```typescript
try {
  // handleSendMessage 로직
} catch (error) {
  const errorMessage: ChatMessage = {
    id: `error-${Date.now()}`,
    role: 'assistant',
    content: '죄송합니다. 재추천 중 오류가 발생했습니다.'
  };
  setMessages(prev => [...prev, errorMessage]);
  setIsLoading(false);
}
```

### 5. Summary 업데이트 실패 (Fallback)
```typescript
catch (error) {
  // Fallback: 간단한 Summary
  const fallbackSummary = `${previousContextSummary}\n\n**추가 요청**\n${userInputs.map(i => `- ${i}`).join('\n')}`;
  // 계속 진행 (추천은 성공했으므로)
}
```

---

## 핵심 개선 사항 (최근 적용)

### ✅ 1. 예산 루프 버그 수정

**문제**: "10만원 아래"라고 해도 계속 "최대 얼마까지?"라고 물어봄

**원인**:
- 예산 파싱이 "아래" 키워드 미지원 (이하, 까지만 지원)
- Intent 분류가 모호함 (SPECIFIC vs VAGUE 기준 불명확)
- Gemini가 예산 파싱 담당 (비효율적)

**해결**:
1. 예산 파싱 패턴 확장: `이하|아래|까지|미만|이내`
2. Intent 분류 규칙 명확화 (systemPrompt + intentRouter)
3. 자동 예산 파싱 추가 (후처리 단계)

**결과**:
- "10만원 아래" → 즉시 `"0-100000"` 변환
- "더 저렴한 걸로" → ASK_CLARIFICATION (올바름)

### ✅ 2. 카테고리 범용화

**문제**: 분유포트 전용 시스템 프롬프트

**해결**:
- System prompt: 모든 아기용품 전문가로 변경
- General tool: 카테고리 자동 인식 (`inferCategoryName()`)
- 모든 tool: 제품명 직접 사용 (rank 번호 제거)

### ✅ 3. 로딩 상태 버그 수정

**문제**: SSE 스트림 종료 후에도 "처리 중..." 유지

**해결**:
- SSE while 루프 종료 시 `setIsLoading(false)` 추가
- PDP 자동 처리 플로우도 동일 적용

---

## 테스트 시나리오

### ✅ 정상 동작 시나리오

#### 1. 구체적 예산 변경
```
입력: "10만원 아래로 다시 보여줘"
→ Intent: REFILTER
→ budgetChange: { type: 'specific', value: '0-100000' }
→ 새 추천 3개 생성
→ Summary 업데이트
```

#### 2. 모호한 예산
```
입력: "더 저렴한 걸로 다시 보여줘"
→ Intent: ASK_CLARIFICATION
→ 응답: "최대 얼마까지 쓸 수 있을까요?"
→ 로딩 종료 (사용자 입력 대기)
```

#### 3. 제품 Q&A
```
입력: "1번 제품 세척 편해?"
→ Intent: PRODUCT_QA
→ RAG 기반 답변 생성 (reviews + specs)
→ 자연스러운 응답 (리뷰 번호 인용 없음)
```

#### 4. 제품 비교
```
입력: "1번이랑 2번 비교해줘"
→ Intent: COMPARE
→ 2개 제품 비교 표 생성
→ 장단점 분석
```

#### 5. 범위 밖 질문
```
입력: "요즘 육아 너무 힘들다"
→ Intent: GENERAL
→ 공감 응답 + 제품 추천으로 유도
→ 카테고리별 맞춤 응답 (분유포트/베이비모니터/등)
```

### ❌ 에러 처리 시나리오

#### 1. 제품 없음
```
입력: "5번 제품은 어때?"
→ Intent: PRODUCT_QA (rank: 5)
→ 에러: "죄송해요, 해당 제품을 찾을 수 없어요."
```

#### 2. API 실패
```
recommend-v2 API 에러 발생
→ SSE: { type: 'error', data: 'Recommendation API failed: 500' }
→ 클라이언트: "재추천 중 오류가 발생했습니다"
```

#### 3. Gemini 파싱 실패
```
Intent JSON 파싱 에러
→ Fallback to GENERAL
→ "죄송해요, 잘 이해하지 못했어요"
```

---

## 성능 최적화

### 1. SSE 스트리밍
- 청크 단위 전송 (전체 대기 X)
- 클라이언트 즉시 반응 (thinking → intent → message)

### 2. 예산 파싱 캐싱
- 정규식 컴파일 최적화
- 불필요한 LLM 호출 제거 (예산은 프로그래밍적으로 파싱)

### 3. 세션 저장 최적화
- sessionStorage 사용 (localStorage보다 빠름)
- 필요한 필드만 업데이트

---

## 디버깅 로그

### 콘솔 로그 구조

```
🤖 Agent Re-recommendation request: {
  userInput: "10만원 아래로",
  allUserInputs: ["더 저렴한 걸로", "10만원 아래로"],
  currentTags: { pros: 2, cons: 1 },
  budget: "0-150000"
}

🎯 Intent Router: Analyzing user input...
   Input: "10만원 아래로"
   Clicked Anchor: none

   ✅ Intent: REFILTER (90% confidence)
   Reasoning: User wants to change budget to 100,000 won or less
   💰 Parsed budget: 0-100000 from "10만원 아래로"

🔄 REFILTER_WITH_ANCHOR: Starting...
   Loading new anchor: 6962086794
   ✅ New anchor: 보르르 분유포트
   Current tags - Pros: 2, Cons: 1
   Updated budget: 0-100000
   Calling recommend-v2...
   ✅ Got 3 recommendations

   Agent SSE event: thinking
   Agent SSE event: intent
   Intent: REFILTER (90% confidence)
   Agent SSE event: message
   Agent SSE event: recommendations
   ✅ Agent done
   SSE stream finished
```

---

## 추가 개선 아이디어

### 1. 태그 자동 추출
- 현재: Gemini가 수동으로 태그 ID 매핑
- 개선: 자연어 → 태그 ID 자동 매핑 함수 추가

### 2. 다중 예산 파싱
- 현재: 첫 번째 예산만 파싱
- 개선: "7만원에서 10만원으로 올려줘" 같은 범위 변경 지원

### 3. 대화 히스토리 활용
- 현재: 각 입력 독립적으로 처리
- 개선: 이전 대화 맥락 고려 (예: "더 저렴하게" = 현재 예산의 70%)

### 4. 프리뷰 성능 최적화
- 현재: 추천 컨테이너 클릭 시 Result 페이지 업데이트
- 개선: Optimistic UI 업데이트 (즉시 반영)

---

## 참고 파일

### Core Files
- `components/ReRecommendationBottomSheet.tsx` - UI 컴포넌트
- `app/api/agent/route.ts` - SSE 스트리밍 엔드포인트
- `lib/agents/intentRouter.ts` - Intent 분류 + 예산 파싱
- `lib/agents/systemPrompt.ts` - Agent 시스템 프롬프트

### Tool Implementations
- `lib/agents/tools/refilterWithAnchor.ts` - 재추천 로직
- `lib/agents/tools/productQA.ts` - 제품 Q&A (RAG)
- `lib/agents/tools/compare.ts` - 제품 비교
- `lib/agents/tools/general.ts` - 범용 응답 (카테고리 인식)

### Utilities
- `lib/agents/utils/budgetAdjustment.ts` - 예산 파싱 유틸
- `lib/agents/types.ts` - TypeScript 타입 정의
