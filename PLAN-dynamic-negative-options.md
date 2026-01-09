# 동적 단점 옵션 생성 구현 계획

## 문제 상황

현재 "피하고 싶은 단점" 옵션이 Init 시점에 생성되어 다음 문제 발생:
- 물티슈 같은 비전자제품에 "작동 소리가 커서" 같은 관계없는 옵션 표시
- `defaultNegativeOptions`가 가전제품 중심으로 하드코딩됨
- 사용자 맥락 (앞선 답변들)을 반영하지 못함

## 제안 솔루션

**Init 시점**: 질문 placeholder만 생성 (옵션 없이)
**런타임**: 사용자가 해당 질문에 도달했을 때 동적으로 옵션 생성

### 장점
1. 카테고리별 맞춤 옵션 생성
2. 앞선 답변을 반영한 맥락 기반 옵션
3. Init 로딩 시간 단축 (LLM 호출 1회 감소)
4. 실제 제품 데이터 기반 단점 추출 가능

---

## 구현 계획

### Step 1: Init API 수정 (`/app/api/knowledge-agent/init/route.ts`)

**변경 대상**: `generateAvoidNegativesQuestion()` 함수 (Lines 918-1003)

**변경 내용**:
```typescript
// Before: 옵션까지 생성
function generateAvoidNegativesQuestion(trendAnalysis: TrendAnalysis) {
  // LLM 호출로 옵션 생성
  const options = await generateNegativeOptionsWithLLM(trendAnalysis);
  return { id: 'avoid_negatives', question: '...', options, ... };
}

// After: placeholder만 반환
function generateAvoidNegativesQuestion() {
  return {
    id: 'avoid_negatives',
    question: '혹시 꼭 피하고 싶은 단점이 있으신가요?',
    reason: '💡 선택하신 단점이 있는 상품은 추천에서 제외하거나 순위를 낮출게요.',
    options: [],  // 빈 배열 - 런타임에 채워짐
    type: 'multi' as const,
    priority: 100,
    dataSource: '맞춤 분석',
    completed: false,
    dynamicOptions: true,  // 플래그 추가 - 동적 옵션 필요
  };
}
```

**삭제할 코드**:
- `defaultNegativeOptions` 상수 (Lines 922-928)
- LLM 호출 부분

---

### Step 2: 새 API 엔드포인트 생성

**경로**: `/app/api/knowledge-agent/generate-negative-options/route.ts`

**요청 형식**:
```typescript
interface GenerateNegativeOptionsRequest {
  categoryKey: string;
  categoryName: string;
  collectedInfo: Record<string, string>;  // 앞선 답변들
  balanceSelections: Array<{
    questionId: string;
    selection: 'A' | 'B' | 'skip';
    selectedLabel: string;
  }>;
  trendAnalysis?: {
    cons?: string[];  // Init에서 저장해둔 트렌드 단점
  };
  hardcutProducts?: Array<{
    name: string;
    specs: Record<string, string>;
  }>;  // 현재 필터링된 제품들
}
```

**응답 형식**:
```typescript
interface GenerateNegativeOptionsResponse {
  options: Array<{
    value: string;
    label: string;
    description: string;
  }>;
}
```

**LLM 프롬프트 설계**:
```
당신은 ${categoryName} 전문가입니다.

## 사용자 정보
${collectedInfo를 자연어로 변환}

## 사용자가 중요하게 생각하는 것
${balanceSelections에서 선택한 항목들}

## 이 카테고리에서 흔한 단점
${trendAnalysis.cons || 카테고리별 기본 지식}

## 현재 후보 제품들의 특징
${hardcutProducts 요약}

위 정보를 바탕으로, 이 사용자가 피하고 싶어할 수 있는 단점 4-5개를 생성하세요.
각 단점은:
- 해당 카테고리에 실제로 해당되는 것
- 사용자 맥락에 맞는 것
- 구체적이고 이해하기 쉬운 표현

JSON 형식으로 응답:
[
  { "value": "internal_key", "label": "사용자에게 보여줄 문장", "description": "선택 시 도움말" }
]
```

---

### Step 3: Frontend 수정 (`/app/knowledge-agent/[categoryKey]/page.tsx`)

**3.1 Init 응답 처리 수정** (Lines 1187-1199)

```typescript
// Before: Init에서 받은 옵션 바로 저장
const avoidNegativesQuestion = questionTodosFromQuestions.find(
  (q: any) => q.id === 'avoid_negatives'
);
if (avoidNegativesQuestion?.options?.length > 0) {
  setNegativeOptions(...);
}

// After: dynamicOptions 플래그 확인
const avoidNegativesQuestion = questionTodosFromQuestions.find(
  (q: any) => q.id === 'avoid_negatives'
);
if (avoidNegativesQuestion?.dynamicOptions) {
  // 나중에 생성 필요 - 플래그만 저장
  setNeedsDynamicNegativeOptions(true);
} else if (avoidNegativesQuestion?.options?.length > 0) {
  setNegativeOptions(...);  // 기존 방식 (폴백)
}
```

**3.2 Phase 전환 시 동적 옵션 생성** (negative_filter phase 진입 시)

```typescript
// useEffect 또는 phase 전환 핸들러에 추가
const fetchDynamicNegativeOptions = async () => {
  if (!needsDynamicNegativeOptions) return;

  setIsLoadingNegativeOptions(true);

  try {
    const response = await fetch('/api/knowledge-agent/generate-negative-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        categoryKey,
        categoryName,
        collectedInfo,
        balanceSelections: savedBalanceSelections,
        trendAnalysis: trendAnalysisData,  // Init에서 저장해둔 것
        hardcutProducts: filteredProducts?.slice(0, 10),
      }),
    });

    const data = await response.json();

    const negativeOpts = data.options.map((opt, idx) => ({
      id: `neg_${idx}`,
      label: opt.label,
      target_rule_key: opt.value,
    }));

    setNegativeOptions(negativeOpts);
  } catch (error) {
    // 폴백: 카테고리별 기본 옵션 사용
    setNegativeOptions(getCategoryDefaultNegatives(categoryKey));
  } finally {
    setIsLoadingNegativeOptions(false);
  }
};

// Phase 전환 시 호출
useEffect(() => {
  if (phase === 'negative_filter' && needsDynamicNegativeOptions) {
    fetchDynamicNegativeOptions();
  }
}, [phase]);
```

**3.3 로딩 상태 UI**

```tsx
{phase === 'negative_filter' && isLoadingNegativeOptions && (
  <div className="flex items-center gap-2 text-gray-500">
    <Spinner size="sm" />
    <span>맞춤 단점 옵션을 준비하고 있어요...</span>
  </div>
)}
```

---

### Step 4: 카테고리별 폴백 옵션 정의

**파일**: `/lib/knowledge-agent/categoryNegatives.ts`

```typescript
export const CATEGORY_NEGATIVE_DEFAULTS: Record<string, NegativeOption[]> = {
  // 전자제품 계열
  '선풍기': [
    { value: 'noise', label: '작동 소리가 커서 잠자리에서 쓰기 어려워요' },
    { value: 'wind_quality', label: '바람이 너무 세거나 약해서 조절이 안 돼요' },
    { value: 'size', label: '부피가 커서 수납이 어려워요' },
    { value: 'cleaning', label: '청소하기 번거로워요' },
  ],
  '무선청소기': [
    { value: 'battery', label: '배터리가 빨리 닳아서 청소 중간에 멈춰요' },
    { value: 'suction', label: '흡입력이 약해서 청소가 잘 안 돼요' },
    { value: 'weight', label: '무거워서 오래 들고 있기 힘들어요' },
    { value: 'noise', label: '소음이 커서 사용하기 불편해요' },
  ],
  // 비전자제품 계열
  '물티슈': [
    { value: 'moisture', label: '너무 물기가 많거나 적어서 불편해요' },
    { value: 'thickness', label: '너무 얇아서 쉽게 찢어져요' },
    { value: 'scent', label: '향이 너무 강하거나 불쾌해요' },
    { value: 'residue', label: '닦은 후 잔여물이 남아요' },
  ],
  '기저귀': [
    { value: 'leak', label: '샘이 자주 발생해요' },
    { value: 'rash', label: '피부 트러블이 생길 것 같아요' },
    { value: 'fit', label: '사이즈가 잘 안 맞아요' },
    { value: 'absorption', label: '흡수력이 부족해요' },
  ],
  // ... 카테고리별 추가
};

export function getCategoryDefaultNegatives(categoryKey: string): NegativeOption[] {
  return CATEGORY_NEGATIVE_DEFAULTS[categoryKey] || [
    { value: 'quality', label: '품질이 기대에 못 미칠 것 같아요' },
    { value: 'price_value', label: '가격 대비 만족도가 낮을 것 같아요' },
    { value: 'durability', label: '내구성이 걱정돼요' },
    { value: 'inconvenience', label: '사용하기 불편할 것 같아요' },
  ];
}
```

---

### Step 5: trendAnalysis 데이터 보존

Init에서 생성된 trendAnalysis를 Frontend에 전달하여 저장:

**Init 응답에 추가**:
```typescript
// SSE event로 전송
encoder.encode(`data: ${JSON.stringify({
  type: 'trend_analysis',
  data: trendAnalysis,  // cons 포함
})}\n\n`)
```

**Frontend에서 저장**:
```typescript
const [trendAnalysisData, setTrendAnalysisData] = useState<TrendAnalysis | null>(null);

// SSE 처리 부분
if (data.type === 'trend_analysis') {
  setTrendAnalysisData(data.data);
}
```

---

## 구현 순서

1. **Step 1**: Init API에서 `generateAvoidNegativesQuestion()` 수정
   - 옵션 생성 로직 제거
   - `dynamicOptions: true` 플래그 추가

2. **Step 4**: 카테고리별 폴백 옵션 파일 생성
   - 에러 시 사용할 기본 옵션 준비

3. **Step 2**: 새 API 엔드포인트 생성
   - `/api/knowledge-agent/generate-negative-options`
   - LLM 기반 동적 옵션 생성

4. **Step 3**: Frontend 수정
   - `needsDynamicNegativeOptions` 상태 추가
   - Phase 전환 시 API 호출
   - 로딩 UI 추가

5. **Step 5**: trendAnalysis 데이터 보존 구현
   - Init → Frontend 전달
   - 새 API 호출 시 활용

---

## 예상 사용자 경험

### Before (현재)
```
Init 시작 → [LLM 단점 옵션 생성 2-3초] → 질문들 표시 → ... → 단점 질문 (잘못된 옵션)
```

### After (개선 후)
```
Init 시작 → [옵션 생성 스킵] → 질문들 표시 → ... → 단점 질문 도달 →
[맞춤 옵션 로딩 1-2초] → 맥락에 맞는 옵션 표시
```

**체감 개선**:
- Init 로딩 시간 2-3초 단축
- 단점 질문에서 1-2초 추가 로딩 (자연스러운 전환 구간)
- 훨씬 관련성 높은 옵션 제공

---

## 테스트 케이스

1. **물티슈 카테고리**: 비전자제품 관련 옵션만 표시되는지
2. **선풍기 카테고리**: 전자제품 관련 옵션 (소음, 바람 등) 표시
3. **LLM 실패 시**: 카테고리별 폴백 옵션 정상 표시
4. **빠른 스킵**: 단점 질문 로딩 중 스킵해도 문제없는지
5. **맥락 반영**: 앞서 "조용한 거 원해요" 선택 시 소음 관련 옵션 우선 표시

---

## 예상 작업 시간

- Step 1 (Init 수정): 15분
- Step 2 (새 API): 30분
- Step 3 (Frontend): 45분
- Step 4 (폴백 옵션): 20분
- Step 5 (데이터 보존): 15분
- 테스트 및 디버깅: 30분

**총: 약 2.5시간**
