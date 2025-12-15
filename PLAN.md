# 하드필터 질문 동적 설명(Tip) 생성 기능 구현 계획

## 현재 상태

### Static Tip 구조
- **위치**: `data/rules/filter_tips.json`
- **형식**: `{ "formula_pot": { "재질": "유리는 환경호르몬 걱정 없고...", ... }, "_default": { ... } }`
- **렌더링**: `HardFilterQuestion.tsx`에서 `question.tip`으로 표시

### 활용 가능한 데이터
1. **선택 % 통계**: `/api/v2/hard-filter-stats` API (14일간 집계, 1시간 TTL 캐시)
2. **카테고리 인사이트**: `data/category-insights/*.json` (pros, cons, trend, guide)
3. **질문 + 옵션**: `HardFilterQuestion` 타입 (`question`, `options[]`)

---

## 구현 계획

### Step 1: API 엔드포인트 생성
**파일**: `app/api/v2/generate-tip/route.ts`

```typescript
// Input
{
  categoryKey: string;           // "baby_bottle"
  questionId: string;            // "brand"
  questionText: string;          // "어떤 브랜드를 선호하세요?"
  options: Array<{               // 선택지 목록
    value: string;
    label: string;
  }>;
  popularOptions?: Array<{       // 선택 % 통계 (상위 N개)
    value: string;
    label: string;
    percentage: number;
  }>;
}

// Output
{
  tip: string;                   // "더블하트가 52%로 가장 인기 있어요..."
  cached: boolean;               // 캐시 hit 여부
}
```

### Step 2: 프롬프트 설계
```
당신은 육아용품 전문가입니다. 사용자가 {category_name}을(를) 선택할 때 도움이 되는 짧은 팁을 작성해주세요.

[질문]
{question_text}

[선택지]
{options_list}

[인기 선택 통계]
{popular_stats}  // "더블하트: 52%, 모윰: 28%, 코멧: 12%"

[카테고리 인사이트]
{category_guide_summary}
{relevant_pros_cons}

위 정보를 바탕으로 1-2문장의 간결한 팁을 작성해주세요.
- 인기 선택지가 있다면 언급하되, 단순 나열이 아닌 의미 있는 인사이트 제공
- 초보 부모가 이해하기 쉬운 친근한 어투
- 특정 브랜드/옵션을 강요하지 않고 정보 제공 위주
```

### Step 3: 캐싱 전략
**방식**: 파일 시스템 캐시 + 메모리 캐시 (2단계)

1. **메모리 캐시** (1차): 빠른 응답, 서버 재시작 시 초기화
2. **파일 캐시** (2차): `data/cache/tips/{categoryKey}_{questionId}.json`
   - 선택 % 변동이 크지 않으므로 **24시간 TTL**
   - 캐시 키: `${categoryKey}_${questionId}`

```typescript
// 캐시 구조
interface CachedTip {
  tip: string;
  generatedAt: string;        // ISO timestamp
  inputs: {                   // 캐시 무효화 판단용
    popularOptionsHash: string;
  };
}
```

### Step 4: 페이지에서 동적 tip 로드
**파일**: `app/recommend-v2/[categoryKey]/page.tsx`

```typescript
// 질문 로드 시 동적 tip도 함께 로드
const [dynamicTips, setDynamicTips] = useState<Record<string, string>>({});

// 각 질문에 대해 tip 생성 요청 (병렬 호출)
useEffect(() => {
  const fetchTips = async () => {
    const tipPromises = questions.map(q =>
      fetch('/api/v2/generate-tip', {
        method: 'POST',
        body: JSON.stringify({
          categoryKey,
          questionId: q.id,
          questionText: q.question,
          options: q.options.map(o => ({ value: o.value, label: o.label })),
          popularOptions: popularHardFilterOptions
            .filter(p => p.questionId === q.id && p.isPopular)
            .map(p => ({ value: p.value, label: p.label, percentage: p.percentage }))
        })
      }).then(r => r.json())
    );

    const results = await Promise.all(tipPromises);
    const tips: Record<string, string> = {};
    results.forEach((r, i) => {
      if (r.tip) tips[questions[i].id] = r.tip;
    });
    setDynamicTips(tips);
  };

  if (questions.length > 0) fetchTips();
}, [questions, popularHardFilterOptions]);
```

### Step 5: HardFilterQuestion에 동적 tip 전달
**파일**: `components/recommend-v2/HardFilterQuestion.tsx`

기존 `question.tip`을 `dynamicTip || question.tip`으로 교체하거나,
`HardFilterData` 인터페이스에 `dynamicTip?: string` 추가

---

## 파일 변경 목록

| 작업 | 파일 | 설명 |
|------|------|------|
| **신규** | `app/api/v2/generate-tip/route.ts` | LLM tip 생성 API |
| **수정** | `lib/cache/simple.ts` | Tip 캐싱 로직 추가 (기존 캐시 모듈 활용) |
| **수정** | `app/recommend-v2/[categoryKey]/page.tsx` | 동적 tip 로드 로직 추가 |
| **수정** | `components/recommend-v2/HardFilterQuestion.tsx` | dynamicTip 표시 |
| **수정** | `types/recommend-v2.ts` | HardFilterData에 dynamicTip 추가 |
| **신규** | `data/cache/tips/` | 캐시 파일 디렉토리 |
| **수정** | `.gitignore` | 캐시 디렉토리 추가 |

---

## 고려사항

### 성능
- 질문당 1회 LLM 호출 (flash-lite: 빠르고 저렴)
- 캐시 hit 시 LLM 호출 없음
- 병렬 요청으로 latency 최소화

### 캐시 무효화
- **24시간 TTL**: 선택 % 통계가 크게 변하지 않으므로 충분
- **수동 무효화**: Admin에서 캐시 클리어 기능 추가 (선택적)

### Fallback
- LLM 호출 실패 시 → 기존 static tip 사용 (`filter_tips.json`)
- 캐시 읽기 실패 시 → LLM 재생성

---

## 예상 결과

**Before (Static)**:
```
질문: 어떤 브랜드를 선호하세요?
팁: "아기 피부에 닿는 제품은 브랜드 신뢰도가 중요해요"
```

**After (Dynamic)**:
```
질문: 어떤 브랜드를 선호하세요?
팁: "더블하트가 52%로 가장 많이 선택됐어요. 모유실감 젖꼭지로 유두혼동 걱정이 적은 게 인기 비결이에요."
```

---

## 구현 순서

1. [x] 현재 구조 파악 완료
2. [ ] `app/api/v2/generate-tip/route.ts` - API 엔드포인트 구현
3. [ ] `lib/cache/simple.ts` - Tip 캐싱 로직 추가
4. [ ] `types/recommend-v2.ts` - HardFilterData 타입 수정
5. [ ] `app/recommend-v2/[categoryKey]/page.tsx` - 동적 tip 로드 로직
6. [ ] `components/recommend-v2/HardFilterQuestion.tsx` - dynamicTip 표시
7. [ ] `.gitignore` - 캐시 디렉토리 추가
8. [ ] 테스트 및 검증
