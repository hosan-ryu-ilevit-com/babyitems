# 추천 플로우 Thinking 과정 투명화 개선 기획안

## 📋 목차
1. [현황 분석](#현황-분석)
2. [문제점 및 개선 목표](#문제점-및-개선-목표)
3. [개선 방안](#개선-방안)
4. [구현 계획](#구현-계획)
5. [기대 효과](#기대-효과)

---

## 🔍 현황 분석

### 현재 추천 플로우 구조

#### V2 추천 시스템 (`app/recommend-v2/[categoryKey]/page.tsx`)

**현재 프로세스:**
```
사용자 선택 완료
  ↓
handleGetRecommendation() 호출
  ↓
1. 점수 계산 (3-12%)
   - 하드필터 점수
   - 밸런스 게임 점수
   - 단점 필터 점수
  ↓
2. LLM 추천 API 호출 (15-55%) ← 블랙박스!
   POST /api/v2/recommend-final
  ↓
3. 태그 정제 (60-95%)
   - 중복 제거
   - 한글화
  ↓
4. 결과 표시 (100%)
```

**현재 로딩 UI:**
- **비디오 애니메이션**: `recommendloading.MP4` (130x130px)
- **프로그레스 바**: 0-100% 숫자 표시
- **단계별 메시지** (7단계):
  ```
  0-3%:   상품 데이터 준비 중...
  3-8%:   상품 데이터 분석 중...
  8-12%:  적합도 점수 계산 중...
  12-15%: 후보 선정 중...
  15-55%: 최적의 제품 분석 중... ← 40% 차지, 너무 추상적!
  55-95%: 추천 이유 정리 중...
  95-100%: 최종 결과 준비 중...
  ```
- **스켈레톤 로딩**: 제품 카드 3개, 비교표

### LLM 추천 API 내부 프로세스 (`app/api/v2/recommend-final/route.ts`)

**실제 진행 단계:**
```javascript
1. 카테고리 인사이트 로드
   - loadCategoryInsights(categoryKey)
   - 장점/단점 데이터 가져오기

2. 후보 상품 리뷰 샘플링
   - getSampledReviewsFromSupabase(productIds, 10, 10)
   - 각 제품당 긍정/부정 리뷰 10개씩

3. LLM 프롬프트 생성
   - 사용자 상황 요약 (하드필터, 밸런스, 단점, 예산)
   - 후보 상품 정보 포맷팅 (스펙 + 리뷰)
   - 카테고리 인사이트 추가

4. Gemini API 호출
   - 모델: getProModel(0.4)
   - 프롬프트 전송 + 응답 대기

5. 응답 파싱
   - JSON 파싱 (top3, recommendationReason, matchedPreferences)
   - 중복 제거 (normalizeTitle로 그룹핑)

6. Variants 정보 추가
   - 같은 제품의 다른 옵션 찾기
   - 가격 범위 계산
```

**문제점:**
- 이 과정이 전혀 사용자에게 노출되지 않음
- 프론트엔드는 단순히 15%에서 55%까지 타이머로 증가시킬 뿐
- 실제 API가 5초 걸리든 20초 걸리든 같은 경험

---

## ❌ 문제점 및 개선 목표

### 주요 문제점

1. **블랙박스 문제**
   - LLM API 호출 중 (15-55%, 약 40% 구간) 무슨 일이 일어나는지 알 수 없음
   - "최적의 제품 분석 중..."이라는 추상적 메시지만 표시
   - 실제 진행 상황과 프로그레스 바가 연동되지 않음

2. **신뢰도 부족**
   - 타이머 기반 프로그레스는 실제 작업과 무관
   - 사용자가 "정말 분석하고 있나?"라는 의구심 가질 수 있음
   - AI가 리뷰를 분석한다는 것이 보이지 않음

3. **단조로운 경험**
   - 단순히 % 숫자만 증가
   - 각 단계의 중요성이나 차별점이 느껴지지 않음
   - 대기 시간이 지루하게 느껴짐

4. **정보 부족**
   - "10개 제품 분석 중" 같은 구체적 정보 없음
   - 어떤 리뷰를 보고 있는지 모름
   - 왜 이렇게 오래 걸리는지 이해하기 어려움

### 개선 목표

✅ **투명성**: AI가 무엇을 하고 있는지 구체적으로 보여주기
✅ **신뢰성**: 실제 진행 상황과 UI를 동기화
✅ **흥미로움**: 지루하지 않은 시각적 경험
✅ **정보성**: 사용자가 프로세스를 이해하고 학습할 수 있도록

---

## 💡 개선 방안

### 방안 A: SSE 스트리밍 (추천 ⭐⭐⭐⭐⭐)

**개요:**
LLM API를 SSE(Server-Sent Events) 방식으로 변경하여 실시간으로 진행 상황 전달

**장점:**
- ✅ 실제 진행 상황과 UI 완벽 동기화
- ✅ 각 단계별 상세 정보 전달 가능
- ✅ 구체적인 메시지 (예: "15개 리뷰 분석 완료")
- ✅ 기술적으로 가장 정확함

**단점:**
- ⚠️ API 코드 수정 필요 (복잡도 중간)
- ⚠️ Gemini API 응답을 기다리는 동안에도 중간 업데이트 필요

**구현:**
```typescript
// app/api/v2/recommend-final/route.ts
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1단계: 인사이트 로드
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            progress: 15,
            stage: 'insights',
            message: '카테고리 전문 지식 로드 중...'
          })}\n\n`
        ));

        const insights = await loadCategoryInsights(categoryKey);

        // 2단계: 리뷰 로드
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            progress: 20,
            stage: 'reviews',
            message: `${candidateProducts.length}개 제품의 리뷰 수집 중...`
          })}\n\n`
        ));

        const reviewsMap = await getSampledReviewsFromSupabase(productIds, 10, 10);
        const reviewCount = Array.from(reviewsMap.values())
          .reduce((sum, r) => sum + r.positiveReviews.length + r.negativeReviews.length, 0);

        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            progress: 30,
            stage: 'reviews_done',
            message: `${reviewCount}개 실사용 리뷰 분석 준비 완료`
          })}\n\n`
        ));

        // 3단계: LLM 분석
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            progress: 35,
            stage: 'llm_analyzing',
            message: 'AI가 리뷰와 스펙을 종합 분석 중...'
          })}\n\n`
        ));

        // LLM 호출 (시간이 걸리는 부분)
        const result = await model.generateContent(prompt);

        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            progress: 50,
            stage: 'llm_done',
            message: 'AI 분석 완료, Top 3 선정 중...'
          })}\n\n`
        ));

        // 4단계: 결과 처리
        // ...

        // 최종 결과
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({
            progress: 100,
            stage: 'done',
            data: { top3Products, selectionReason, generated_by }
          })}\n\n`
        ));

        controller.close();
      } catch (error) {
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ error: error.message })}\n\n`
        ));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

```typescript
// app/recommend-v2/[categoryKey]/page.tsx
const handleGetRecommendation = async () => {
  setIsCalculating(true);

  const response = await fetch('/api/v2/recommend-final', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ /* ... */ }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n\n');

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));

        if (data.progress) {
          setProgress(data.progress);
        }

        if (data.message) {
          setLoadingMessage(data.message);
        }

        if (data.stage) {
          setCurrentStage(data.stage);
        }

        if (data.data) {
          // 최종 결과
          setScoredProducts(data.data.top3Products);
          setSelectionReason(data.data.selectionReason);
        }
      }
    }
  }

  setIsCalculating(false);
};
```

---

### 방안 B: 단계별 폴링 (대안 ⭐⭐⭐)

**개요:**
API를 여러 단계로 분리하고, 각 단계를 순차적으로 호출하면서 진행 상황 업데이트

**장점:**
- ✅ 구현이 상대적으로 간단
- ✅ 각 단계별로 명확한 진행 상황 표시
- ✅ 에러 핸들링 쉬움

**단점:**
- ⚠️ API 호출 횟수 증가 (네트워크 오버헤드)
- ⚠️ LLM 분석 중에는 여전히 대기
- ⚠️ 실시간성 떨어짐

**구현:**
```typescript
// API 분리
// /api/v2/recommend-final/step1 - 인사이트 + 리뷰 로드
// /api/v2/recommend-final/step2 - LLM 분석
// /api/v2/recommend-final/step3 - 결과 정제

// 순차 호출
const step1 = await fetch('/api/v2/recommend-final/step1', ...);
setProgress(30);

const step2 = await fetch('/api/v2/recommend-final/step2', ...);
setProgress(70);

const step3 = await fetch('/api/v2/recommend-final/step3', ...);
setProgress(100);
```

---

### 방안 C: 향상된 프론트엔드 시뮬레이션 (간단 ⭐⭐⭐⭐)

**개요:**
백엔드 수정 없이, 프론트엔드만 개선하여 더 구체적이고 흥미로운 로딩 경험 제공

**장점:**
- ✅ 백엔드 수정 불필요
- ✅ 빠른 구현 가능
- ✅ 리스크 최소화

**단점:**
- ⚠️ 실제 진행 상황과 완벽히 동기화되지 않음
- ⚠️ 여전히 타이머 기반

**구현:**
```typescript
// 더 세분화된 메시지 + 시각적 개선
const stages = [
  { progress: 0, message: '추천 시스템 준비 중...', icon: '⚙️' },
  { progress: 3, message: '상품 데이터 준비 중...', icon: '📦' },
  { progress: 8, message: '적합도 점수 계산 중...', icon: '🧮' },
  { progress: 12, message: `${candidateCount}개 후보 제품 선정 완료`, icon: '✅' },
  { progress: 15, message: '카테고리 전문 지식 로드 중...', icon: '📚' },
  { progress: 22, message: `${candidateCount}개 제품의 리뷰 수집 중...`, icon: '📝', subtext: '실사용 후기 분석' },
  { progress: 30, message: '긍정 리뷰 분석 중...', icon: '👍', subtext: '장점 파악' },
  { progress: 38, message: '부정 리뷰 분석 중...', icon: '🔍', subtext: '단점 파악' },
  { progress: 45, message: 'AI가 사용자 니즈와 비교 중...', icon: '🤖' },
  { progress: 55, message: 'Top 3 제품 선정 완료', icon: '🏆' },
  { progress: 65, message: '추천 이유 작성 중...', icon: '✍️' },
  { progress: 75, message: '제품별 장단점 정리 중...', icon: '📊' },
  { progress: 85, message: '구매 팁 생성 중...', icon: '💡' },
  { progress: 95, message: '최종 점검 중...', icon: '🔬' },
  { progress: 100, message: '추천 완료!', icon: '✨' },
];
```

**시각적 개선:**
1. **단계별 아이콘**: 각 단계를 시각적으로 구분
2. **서브텍스트**: 추가 설명으로 구체성 향상
3. **진행 바 색상**: 단계별로 색상 변화 (파란색 → 보라색 → 초록색)
4. **미니 체크리스트**: 완료된 단계에 체크 표시
5. **리뷰 카운터 애니메이션**: "15/120 리뷰 분석 완료" 같은 카운터

---

## 🎯 추천 구현 계획

### Phase 1: 빠른 개선 (1-2일, 방안 C)

**목표:** 백엔드 수정 없이 프론트엔드만으로 사용자 경험 대폭 개선

**변경 사항:**

1. **`app/recommend-v2/[categoryKey]/page.tsx` 개선**

```typescript
// 새로운 Stage 타입
interface LoadingStage {
  progress: number;
  message: string;
  icon: string;
  subtext?: string;
  color?: string; // 프로그레스 바 색상
}

// 세분화된 단계
const LOADING_STAGES: LoadingStage[] = [
  { progress: 0, message: '추천 시스템 준비 중...', icon: '⚙️', color: 'blue' },
  { progress: 5, message: '상품 데이터 불러오는 중...', icon: '📦', color: 'blue' },
  { progress: 10, message: '적합도 점수 계산 중...', icon: '🧮', subtext: '밸런스 게임 선택 반영', color: 'blue' },
  { progress: 15, message: `후보 ${candidateCount}개 제품 선정`, icon: '✅', color: 'blue' },
  { progress: 20, message: '카테고리 전문 지식 로드', icon: '📚', subtext: '리뷰 분석 준비', color: 'indigo' },
  { progress: 25, message: `${candidateCount}개 제품 리뷰 수집`, icon: '📝', subtext: '실사용 후기 가져오기', color: 'indigo' },
  { progress: 32, message: '긍정 리뷰 분석 중...', icon: '👍', subtext: '각 제품의 장점 파악', color: 'purple' },
  { progress: 40, message: '부정 리뷰 분석 중...', icon: '🔍', subtext: '단점과 주의사항 파악', color: 'purple' },
  { progress: 48, message: 'AI가 사용자 선택과 비교 중', icon: '��', subtext: '맞춤 추천 계산', color: 'violet' },
  { progress: 58, message: 'Top 3 제품 선정 완료', icon: '🏆', color: 'green' },
  { progress: 65, message: '추천 이유 작성 중...', icon: '✍️', subtext: '왜 이 제품인지 설명', color: 'green' },
  { progress: 75, message: '제품별 장단점 정리', icon: '📊', color: 'green' },
  { progress: 85, message: '구매 팁 생성 중...', icon: '💡', color: 'emerald' },
  { progress: 95, message: '최종 점검 중...', icon: '🔬', color: 'emerald' },
  { progress: 100, message: '추천 완료!', icon: '✨', color: 'emerald' },
];

// 현재 단계 찾기
const getCurrentStage = (progress: number): LoadingStage => {
  for (let i = LOADING_STAGES.length - 1; i >= 0; i--) {
    if (progress >= LOADING_STAGES[i].progress) {
      return LOADING_STAGES[i];
    }
  }
  return LOADING_STAGES[0];
};
```

2. **UI 컴포넌트 개선**

```tsx
// 새로운 LoadingStageDisplay 컴포넌트
<div className="w-full max-w-md">
  {/* 메인 아이콘 + 메시지 */}
  <div className="flex items-center gap-4 mb-6">
    <motion.div
      key={currentStage.icon}
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 200 }}
      className="text-4xl"
    >
      {currentStage.icon}
    </motion.div>

    <div className="flex-1">
      <AnimatePresence mode="wait">
        <motion.p
          key={currentStage.message}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="text-lg font-semibold text-gray-900"
        >
          {currentStage.message}
        </motion.p>
      </AnimatePresence>

      {currentStage.subtext && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-gray-500 mt-1"
        >
          {currentStage.subtext}
        </motion.p>
      )}
    </div>
  </div>

  {/* 프로그레스 바 (색상 변화) */}
  <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
    <motion.div
      className="absolute inset-y-0 left-0 rounded-full"
      animate={{
        width: `${progress}%`,
        backgroundColor: getColorByStage(currentStage.color),
      }}
      transition={{ width: { duration: 0.3 }, backgroundColor: { duration: 0.5 } }}
    />
  </div>

  <div className="flex justify-between mt-2 text-sm">
    <span className="text-gray-500">분석 중</span>
    <span className="font-mono font-bold text-gray-900">{progress}%</span>
  </div>

  {/* 완료된 단계 체크리스트 (컴팩트) */}
  <div className="mt-6 space-y-2">
    {LOADING_STAGES.filter(s => s.progress <= progress && s.progress % 20 === 0).map((stage) => (
      <motion.div
        key={stage.progress}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 text-sm"
      >
        <span className="text-green-500">✓</span>
        <span className="text-gray-600">{stage.message}</span>
      </motion.div>
    ))}
  </div>
</div>
```

3. **프로그레스 타이밍 조정**

```typescript
// 단계별 딜레이 조정 (API 호출 전후로 밀집)
await new Promise(resolve => setTimeout(resolve, 100));
setProgressSafe(5);

await new Promise(resolve => setTimeout(resolve, 150));
setProgressSafe(10);

// 점수 계산 (실제 작업)
const scored = /* ... */;

setProgressSafe(15);

// LLM API 호출 직전
setProgressSafe(20);

// API 호출 중에는 천천히 증가 (15초 가정)
const llmStartTime = Date.now();
const llmProgressInterval = setInterval(() => {
  const elapsed = Date.now() - llmStartTime;
  const estimatedProgress = 20 + Math.min(35, (elapsed / 15000) * 35); // 20% → 55%
  setProgressSafe(Math.floor(estimatedProgress));
}, 500);

const recommendResponse = await fetch('/api/v2/recommend-final', /* ... */);

clearInterval(llmProgressInterval);
setProgressSafe(58); // LLM 완료
```

**예상 효과:**
- 🎨 시각적으로 훨씬 풍부한 경험
- 📖 사용자가 프로세스를 이해하고 신뢰
- ⏱️ 대기 시간이 지루하지 않음
- 🚀 빠른 구현 (1-2일)

---

### Phase 2: 완전한 투명성 (3-5일, 방안 A)

**목표:** SSE 스트리밍으로 실제 진행 상황을 실시간 반영

**변경 사항:**

1. **`app/api/v2/recommend-final/route.ts` SSE 전환**
   - Response를 ReadableStream으로 변경
   - 각 단계마다 `controller.enqueue()` 호출
   - 진행 상황과 메시지를 JSON으로 스트리밍

2. **프론트엔드 EventSource 구현**
   - `fetch()` 대신 `EventSource` 또는 `fetch().body.getReader()` 사용
   - 스트림 데이터를 파싱하여 UI 업데이트

3. **에러 핸들링 강화**
   - 연결 끊김 시 재시도 로직
   - Fallback UI

**기대 효과:**
- ✅ 실제 진행 상황과 100% 동기화
- ✅ API가 느려지면 사용자도 인지
- ✅ 가장 신뢰성 높은 경험

---

### Phase 3: 추가 개선 아이디어 (선택사항)

1. **리뷰 미리보기**
   - LLM 분석 중 일부 리뷰 텍스트를 화면에 표시
   - "이 리뷰를 분석했어요: '새벽 수유 때 빨리 데워져서 좋아요'"
   - 사용자가 실제로 리뷰를 분석한다는 것을 체감

2. **제품 이미지 프리로드**
   - 추천 진행 중 Top 3 제품의 썸네일을 미리 로드
   - 완료 시 즉시 표시되어 빠른 느낌

3. **사운드 효과** (선택사항)
   - 각 단계 완료 시 미세한 사운드 (OFF 가능)
   - 최종 완료 시 축하 사운드

4. **통계 표시**
   - "평균 3분 소요됩니다" → "평균보다 20% 빠릅니다!"
   - "120개 리뷰 중 85개 분석 완료"

---

## 📊 기대 효과

### 정량적 효과

1. **이탈률 감소**
   - 현재: 로딩 중 5-10% 이탈 예상
   - 개선 후: 2-3% 이탈 예상
   - 지루함 감소로 대기 인내심 향상

2. **신뢰도 향상**
   - 설문조사: "AI가 정말 리뷰를 분석했다고 생각하시나요?"
   - 현재: 60-70% 신뢰
   - 개선 후: 85-90% 신뢰 예상

3. **추천 수용률 증가**
   - 프로세스를 이해한 사용자가 추천을 더 신뢰
   - 구매 전환율 5-10% 향상 예상

### 정성적 효과

1. **브랜드 이미지**
   - "정직하고 투명한 서비스"라는 인식
   - 경쟁사 대비 차별화 포인트

2. **사용자 경험**
   - 대기 시간이 "학습 시간"으로 전환
   - AI 추천 시스템에 대한 이해도 향상

3. **재방문 의도**
   - "이 서비스는 진짜 분석한다"는 입소문
   - 신뢰 기반의 재방문

---

## 🔧 구현 우선순위

### 1순위: Phase 1 (방안 C) - 빠른 개선
- **기간**: 1-2일
- **리스크**: 낮음
- **효과**: 높음
- **의존성**: 없음

**추천 이유:**
- 백엔드 수정 없이 큰 효과
- 빠른 검증 및 사용자 피드백 수집 가능
- Phase 2의 기반이 됨

### 2순위: Phase 2 (방안 A) - SSE 스트리밍
- **기간**: 3-5일
- **리스크**: 중간
- **효과**: 매우 높음
- **의존성**: Phase 1 완료

**추천 이유:**
- 완벽한 투명성 제공
- 기술적으로 가장 정확
- 장기적으로 유지보수 쉬움

### 3순위: Phase 3 - 추가 개선
- **기간**: 2-3일
- **리스크**: 낮음
- **효과**: 중간
- **의존성**: Phase 1-2 완료

**추천 이유:**
- Nice-to-have 기능들
- 사용자 피드백 기반으로 선택 구현

---

## 📝 참고 사항

### 현재 코드 위치
- 추천 페이지: `app/recommend-v2/[categoryKey]/page.tsx`
- 추천 API: `app/api/v2/recommend-final/route.ts`
- 로딩 컴포넌트: `components/recommend-v2/ScanAnimation.tsx` (현재는 초기 스캔용)

### 기존 유사 구현
- `ScanAnimation` 컴포넌트에 이미 단계별 메시지 로직 존재:
  - 리뷰 수집 중... (0-30%)
  - 스펙 분석 중... (30-60%)
  - 가격 비교 중... (60-85%)
  - 분석 완료! (85-100%)
- 이 패턴을 추천 로딩에도 적용 가능

### 주의사항
1. **프로그레스 일관성**: 뒤로 가지 않도록 `setProgressSafe` 사용
2. **애니메이션 성능**: 너무 많은 애니메이션은 오히려 느려보임
3. **메시지 길이**: 모바일에서 잘 보이도록 간결하게
4. **색상 접근성**: 색맹 사용자도 구분 가능하도록

---

## ✅ 다음 단계

1. **기획 검토 및 승인**
   - 이 기획안을 검토하고 피드백 받기
   - 우선순위 조정

2. **Phase 1 구현 시작**
   - `app/recommend-v2/[categoryKey]/page.tsx` 수정
   - 새로운 LOADING_STAGES 정의
   - UI 컴포넌트 개선

3. **사용자 테스트**
   - A/B 테스트로 효과 측정
   - 피드백 수집

4. **Phase 2 진행 여부 결정**
   - Phase 1 결과에 따라 SSE 전환 여부 결정
