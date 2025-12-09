# V2 추천 플로우 리디자인 계획

## 목표
현재 파편화된 6개 섹션 UI를 **하나의 채팅형 플로우**로 통합하고, 고정된 밸런스게임/단점필터를 **후보군 기반 동적 생성**으로 개선

---

## 현재 문제점

### 1. UI/UX 파편화
- 6개 step이 독립적인 섹션으로 분리
- `/tags` 페이지처럼 메시지가 쌓이는 자연스러운 대화 흐름이 아님
- 사용자 선택이 대화에 녹아들지 않음

### 2. 고정된 밸런스게임/단점필터
- `balance_game.json`, `negative_filter.json`에 하드코딩된 질문들
- 후보군과 무관하게 항상 동일한 질문 노출
- 예: 해당 카테고리에 "유리 재질" 상품이 없어도 관련 질문 노출

### 3. 버그/기술적 이슈
- 밸런스 게임 중복 선택 버그 (같은 선택지 여러 번 클릭 시 점수 중복)
- 하드필터 실효성 없음 (100개 → 100개 그대로)
- 예산 미선택 검증 없음

---

## 새로운 플로우 설계

### 0/5: 트렌드 브리핑 + 가이드 (변경)
```
[스캔 애니메이션]
"최근 3개월간 맘카페, 블로그 등의 {카테고리} 실제 사용기를 분석 중입니다..."

[가이드 카드 노출]
- 카테고리별 최신 트렌드
- 필수 체크 포인트
- 용어 설명

[AI 메시지]
"복잡한 용어, 스펙 비교는 제가 이미 끝냈어요.
고객님의 상황만 편하게 알려주세요. 딱 맞는 제품을 찾아드릴게요."
```

### 1/5: 하드 필터 (추가/강화)
```
[AI 메시지]
"간단한 질문 몇 가지만 할게요."

[질문들 - 채팅 형태로]
- 아이 월령/발달 단계
- 주거 환경 (아파트/빌라/주택)
- 사용 패턴 (외출 빈도 등)
- 카테고리별 필수 환경 조건

[사용자 선택 후 AI 응답]
"네, 알겠어요!"  (사용자 말풍선 없이 AI가 정리)
```

### 2/5: 중간 점검 (추가)
```
[AI 메시지 + 시각적 요소]
"입력 정보를 기준으로 전체 {N}개 제품을 분석했어요."

[후보군 압축 시각화]
전체 150개 → 후보군 42개
━━━━━━━━━━━━━━━━━ 72% 제외

[조건 요약 태그들]
#신생아 #PPSU선호 #아파트

[자연어 수정 입력 (옵션)]
"혹시 조건을 수정하고 싶으시면 말씀해주세요."
(입력 시 → 1단계 재분석)
```

### 3/5: 밸런스 게임 (변경 - 동적 생성)
```
[AI 메시지]
"이제 남은 후보들 중에서 최적의 제품을 골라볼게요."
"어떤 게 더 끌리세요?"

[동적 A vs B 카드]
- 후보군 상품들의 스펙을 분석
- 해당 카테고리의 체감속성 중 후보군에 해당하는 것만 필터링
- A vs B trade-off 형태로 제시

[선택 후 AI 응답]
"{선택한 특성}을 중요하게 생각하시는군요. 반영할게요."
```

### 4/5: 단점 필터 (유지 - 동적 생성)
```
[AI 메시지]
"실제 리뷰에서 발견된 주요 단점들이에요."
"'이것만큼은 절대 참을 수 없다' 하는 것을 골라주세요."

[동적 단점 옵션]
- 후보군 상품들의 스펙 기반으로 관련 단점만 노출
- 해당되지 않는 단점은 자동 숨김

[스킵 버튼]
"다 괜찮아요"
```

### 5/5: 예산 선택 + 추천 (유지)
```
[AI 메시지]
"마지막이에요. 생각해 둔 예산이 있나요?"

[예산 슬라이더 또는 버튼]
- 카테고리별 예산 범위

[추천 결과]
TOP 3 제품 카드
```

---

## 기술 구현 계획

### Phase 1: 채팅형 UI 리팩토링

#### 1.1 메시지 타입 정의
```typescript
type ChatMessage = {
  id: string;
  role: 'assistant' | 'system';
  content: string;
  componentType?:
    | 'guide-cards'        // 가이드 카드들
    | 'hard-filter'        // 하드 필터 질문
    | 'checkpoint'         // 중간 점검 시각화
    | 'balance-game'       // 밸런스 게임 A vs B
    | 'negative-filter'    // 단점 필터 체크박스
    | 'budget-selector'    // 예산 선택
    | 'result-cards';      // 추천 결과
  data?: unknown;          // 컴포넌트별 데이터
  typing?: boolean;        // 타이핑 애니메이션
  stepTag?: string;        // "1/5", "2/5" 등
};
```

#### 1.2 상태 관리 구조
```typescript
interface RecommendV2State {
  // 메시지 흐름
  messages: ChatMessage[];
  currentStep: 0 | 1 | 2 | 3 | 4 | 5;

  // 데이터
  products: ProductItem[];
  filteredProducts: ProductItem[];

  // 사용자 선택
  hardFilterAnswers: Record<string, string>;
  balanceSelections: string[];  // Set으로 변경 필요 (중복 방지)
  negativeSelections: string[];
  budget: string;

  // 동적 생성 데이터
  dynamicBalanceQuestions: BalanceQuestion[];
  dynamicNegativeOptions: NegativeFilterOption[];

  // UI
  typingMessageId: string | null;
}
```

### Phase 2: 동적 질문 생성 로직

#### 2.1 후보군 기반 체감속성 필터링
```typescript
function filterRelevantRules(
  filteredProducts: ProductItem[],
  logicMap: Record<string, RuleDefinition>
): string[] {
  const relevantRuleKeys: string[] = [];

  for (const [ruleKey, ruleDef] of Object.entries(logicMap)) {
    // 후보군 중 하나라도 이 규칙에 매칭되는 상품이 있는지 확인
    const hasMatchingProduct = filteredProducts.some(product =>
      evaluateRule(product, ruleDef.logic) > 0
    );

    if (hasMatchingProduct) {
      relevantRuleKeys.push(ruleKey);
    }
  }

  return relevantRuleKeys;
}
```

#### 2.2 동적 밸런스 게임 질문 생성
```typescript
function generateDynamicBalanceQuestions(
  relevantRuleKeys: string[],
  balanceGameConfig: BalanceQuestion[]
): BalanceQuestion[] {
  return balanceGameConfig.filter(question =>
    relevantRuleKeys.includes(question.option_A.target_rule_key) ||
    relevantRuleKeys.includes(question.option_B.target_rule_key)
  );
}
```

#### 2.3 동적 단점 필터 옵션 생성
```typescript
function generateDynamicNegativeOptions(
  relevantRuleKeys: string[],
  negativeFilterConfig: NegativeFilterOption[]
): NegativeFilterOption[] {
  return negativeFilterConfig.filter(option =>
    relevantRuleKeys.includes(option.target_rule_key)
  );
}
```

### Phase 3: 하드필터 실효성 개선

#### 3.1 실제 필터 적용
```typescript
function applyHardFilters(
  products: ProductItem[],
  answers: Record<string, string>,
  config: HardFilterConfig
): ProductItem[] {
  let filtered = [...products];

  for (const [questionId, answerValue] of Object.entries(answers)) {
    const question = config.questions.find(q => q.id === questionId);
    const option = question?.options.find(o => o.value === answerValue);

    if (option?.category_code) {
      filtered = filtered.filter(p => p.category_code === option.category_code);
    }

    if (option?.filter) {
      filtered = applySpecFilter(filtered, option.filter);
    }
  }

  return filtered;
}
```

### Phase 4: UI 컴포넌트 구현

#### 4.1 새로운 컴포넌트 구조
```
components/recommend-v2/
├── ChatContainer.tsx        # 메시지 목록 컨테이너
├── AssistantMessage.tsx     # AI 메시지 버블
├── GuideCards.tsx           # 가이드 카드 컴포넌트
├── HardFilterQuestion.tsx   # 하드필터 질문 UI
├── CheckpointVisual.tsx     # 중간점검 시각화
├── BalanceGameCard.tsx      # A vs B 선택 카드
├── NegativeFilterList.tsx   # 단점 체크박스 목록
├── BudgetSelector.tsx       # 예산 선택 (슬라이더/버튼)
├── ResultCards.tsx          # TOP 3 결과 카드
└── NaturalLanguageInput.tsx # 자연어 수정 입력
```

#### 4.2 메시지 렌더링 로직
```typescript
function renderMessage(message: ChatMessage) {
  if (message.role === 'assistant') {
    return (
      <AssistantMessage
        content={message.content}
        typing={message.typing}
        stepTag={message.stepTag}
      />
    );
  }

  if (message.componentType) {
    switch (message.componentType) {
      case 'guide-cards':
        return <GuideCards data={message.data} />;
      case 'hard-filter':
        return <HardFilterQuestion data={message.data} onSelect={...} />;
      case 'checkpoint':
        return <CheckpointVisual data={message.data} />;
      case 'balance-game':
        return <BalanceGameCard data={message.data} onSelect={...} />;
      case 'negative-filter':
        return <NegativeFilterList data={message.data} onToggle={...} />;
      case 'budget-selector':
        return <BudgetSelector onSelect={...} />;
      case 'result-cards':
        return <ResultCards products={message.data} />;
    }
  }
}
```

---

## 파일 수정 계획

### 신규 파일
1. `app/recommend-v2/[categoryKey]/page.tsx` - 전체 리팩토링
2. `components/recommend-v2/*.tsx` - 새 컴포넌트들
3. `lib/recommend-v2/dynamicQuestions.ts` - 동적 질문 생성 로직

### 수정 파일
1. `data/rules/hard_filters.json` - filter 조건 보강 (선택적)
2. `app/api/v2/score/route.ts` - 중복 선택 버그 수정

### 유지 파일 (구조 변경 없음)
1. `data/rules/balance_game.json` - 기존 질문 풀로 활용
2. `data/rules/negative_filter.json` - 기존 옵션 풀로 활용
3. `data/rules/logic_map.json` - 체감속성 규칙 유지

---

## 작업 순서

### Step 1: 기반 작업
- [ ] 메시지 타입 정의 (`types/recommend-v2.ts`)
- [ ] 동적 질문 생성 유틸 (`lib/recommend-v2/dynamicQuestions.ts`)
- [ ] 밸런스게임 중복선택 버그 수정

### Step 2: 컴포넌트 분리
- [ ] ChatContainer 구현
- [ ] AssistantMessage 구현 (타이핑 애니메이션 포함)
- [ ] 각 step별 컴포넌트 구현

### Step 3: 페이지 리팩토링
- [ ] 기존 recommend-v2 페이지 백업
- [ ] 새로운 채팅형 UI로 전환
- [ ] 상태 관리 로직 통합

### Step 4: 동적 질문 연동
- [ ] Step 2 완료 후 후보군 기반 질문 필터링
- [ ] Step 3, 4에서 동적 질문 노출

### Step 5: 테스트 및 마무리
- [ ] 전체 플로우 테스트
- [ ] 버그 수정
- [ ] 로깅 연동

---

## 예상 결과

### Before (현재)
```
[Step 0: 독립된 가이드 섹션]
     ↓
[Step 1: 독립된 하드필터 섹션]
     ↓
[Step 2: 독립된 체크포인트 섹션]
     ↓
...
```

### After (개선 후)
```
[메시지 1: AI] "분석 중..." (스캔 애니메이션)
[메시지 2: AI] 가이드 카드들
[메시지 3: AI] "간단한 질문 몇 가지만 할게요."
[메시지 4: Component] 하드필터 질문
[메시지 5: AI] "네, {월령}에 {환경}에서 사용하시는군요!"
[메시지 6: Component] 후보군 압축 시각화
[메시지 7: AI] "어떤 게 더 끌리세요?"
[메시지 8: Component] 밸런스 게임 (동적)
[메시지 9: AI] "{선택}을 중요하게 생각하시는군요."
...
```

---

## 질문/확인 필요 사항

1. **자연어 수정 기능 (Step 2)**: Gemini API 호출해서 자연어 → 하드필터 조건 파싱 필요. 구현 범위에 포함?

2. **예산 슬라이더**: 버튼 형태 유지 vs 실제 슬라이더 UI로 변경?

3. **밸런스 게임 질문 수**: 동적 필터링 시 질문이 0개가 될 수도 있음. 최소 질문 수 보장 필요?

4. **기존 v2 페이지 대체**: 새 페이지로 완전 대체 vs 별도 경로로 A/B 테스트?
