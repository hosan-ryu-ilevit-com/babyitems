# A/B 테스트 사용 가이드

## 빠른 시작

### 1. Supabase 테이블 생성

Supabase SQL Editor에서 실행:

```sql
CREATE TABLE ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  session_id text NOT NULL,
  test_name text NOT NULL,
  variant text NOT NULL,
  user_agent text,
  converted boolean DEFAULT false,
  conversion_at timestamptz,
  metadata jsonb
);

CREATE INDEX idx_ab_tests_test_name ON ab_tests(test_name);
CREATE INDEX idx_ab_tests_session_id ON ab_tests(session_id);
```

### 2. 컴포넌트에서 사용

#### 기본 사용법

```tsx
'use client';

import { useEffect, useState } from 'react';
import { assignVariant, trackConversion } from '@/lib/ab-test';

export function MyButton() {
  const [variant, setVariant] = useState(null);

  useEffect(() => {
    assignVariant('my-button-test').then(setVariant);
  }, []);

  if (!variant) return null;

  const handleClick = async () => {
    // 전환 추적
    await trackConversion('my-button-test');

    // 실제 기능 실행
    console.log('Button clicked');
  };

  return (
    <button onClick={handleClick}>
      {variant === 'A' ? '클릭하세요' : '여기를 눌러주세요'}
    </button>
  );
}
```

#### 3개 변형 테스트

```tsx
useEffect(() => {
  assignVariant({
    name: 'three-way-test',
    variants: ['A', 'B', 'C']
  }).then(setVariant);
}, []);

const labels = {
  A: '첫 번째 레이블',
  B: '두 번째 레이블',
  C: '세 번째 레이블'
};

return <button>{labels[variant]}</button>;
```

#### 가중치 적용

```tsx
useEffect(() => {
  assignVariant({
    name: 'weighted-test',
    variants: ['A', 'B', 'C'],
    weights: [0.5, 0.3, 0.2] // A: 50%, B: 30%, C: 20%
  }).then(setVariant);
}, []);
```

### 3. 전환 추적

버튼 클릭, 페이지 이동, 구매 등 중요한 액션에서 호출:

```tsx
import { trackConversion } from '@/lib/ab-test';

// 기본
await trackConversion('my-test');

// 메타데이터 포함
await trackConversion('my-test', {
  productId: '123',
  price: 29000,
  timestamp: new Date().toISOString()
});
```

### 4. 결과 확인

1. 브라우저에서 `/admin/ab-tests` 접속
2. 테스트 선택하여 상세 결과 확인
3. 전환율 비교

## 실전 예시

### 예시 1: AI 도우미 버튼 레이블 테스트

```tsx
// components/AIHelperButton.tsx
'use client';

import { useEffect, useState } from 'react';
import { assignVariant, trackConversion } from '@/lib/ab-test';

export function AIHelperButton() {
  const [variant, setVariant] = useState(null);

  useEffect(() => {
    assignVariant({
      name: 'ai-helper-label',
      variants: ['A', 'B', 'C']
    }).then(setVariant);
  }, []);

  if (!variant) return null;

  const labels = {
    A: '뭘 골라야 할지 모르겠어요',
    B: 'AI에게 물어보기',
    C: '선택 도움받기'
  };

  const handleClick = async () => {
    await trackConversion('ai-helper-label', {
      label: labels[variant]
    });

    // AI 도우미 열기
    openAIHelper();
  };

  return (
    <button onClick={handleClick} className="btn-primary">
      {labels[variant]}
    </button>
  );
}
```

### 예시 2: 제품 카드 레이아웃 테스트

```tsx
// components/ProductCard.tsx
export function ProductCard({ product }) {
  const [variant, setVariant] = useState(null);

  useEffect(() => {
    assignVariant('product-card-layout').then(setVariant);
  }, []);

  const handleAddToCart = async () => {
    await trackConversion('product-card-layout', {
      productId: product.id,
      layout: variant
    });

    addToCart(product);
  };

  if (variant === 'A') {
    // 기존 레이아웃
    return <StandardLayout product={product} onAddToCart={handleAddToCart} />;
  } else {
    // 새로운 레이아웃
    return <NewLayout product={product} onAddToCart={handleAddToCart} />;
  }
}
```

### 예시 3: 추천 플로우 순서 테스트

```tsx
// app/recommend-v2/[categoryKey]/page.tsx
export default function RecommendPage() {
  const [variant, setVariant] = useState(null);

  useEffect(() => {
    assignVariant('flow-order-test').then(setVariant);
  }, []);

  const steps = variant === 'A'
    ? [0, 1, 2, 3, 4, 5] // 기존 순서
    : [0, 3, 1, 2, 4, 5]; // 밸런스 게임 먼저

  const handleComplete = async () => {
    await trackConversion('flow-order-test', {
      completedSteps: steps.length
    });
  };

  return <RecommendFlow steps={steps} onComplete={handleComplete} />;
}
```

## 베스트 프랙티스

### 1. 테스트 명명 규칙

- **명확하고 설명적으로**: `ai-helper-label-test` (O), `test1` (X)
- **kebab-case 사용**: `product-card-layout` (O), `ProductCardLayout` (X)
- **버전 포함 가능**: `checkout-flow-v2`

### 2. 전환 정의

- **명확한 전환 기준**: 버튼 클릭 vs 실제 구매 완료
- **의미 있는 액션**: 페이지 뷰보다는 실제 행동
- **일관된 추적**: 모든 변형에서 동일한 방식으로 추적

### 3. 샘플 크기

- **최소 샘플**: 각 변형당 100-200 세션 이상
- **통계적 유의성**: 95% 신뢰도 필요시 더 많은 샘플
- **시간 고려**: 최소 1-2주 이상 운영

### 4. 테스트 종료

```tsx
// 승자가 결정되면 코드에서 테스트 제거
export function MyButton() {
  // A/B 테스트 코드 제거하고 승자 버전만 남김
  return <button>승자 레이블</button>;
}
```

## API 레퍼런스

### `assignVariant(config)`

사용자에게 변형 할당. 이미 할당된 경우 기존 변형 반환.

```typescript
type Variant = 'A' | 'B' | 'C';

interface ABTestConfig {
  name: string;
  variants: Variant[];
  weights?: number[]; // 선택적
}

// 사용법
const variant = await assignVariant('test-name');
// 또는
const variant = await assignVariant({
  name: 'test-name',
  variants: ['A', 'B', 'C'],
  weights: [0.5, 0.3, 0.2]
});
```

### `getVariant(testName)`

현재 할당된 변형 조회 (로깅 없음).

```typescript
const variant = getVariant('test-name'); // 'A' | 'B' | 'C' | null
```

### `trackConversion(testName, metadata?)`

전환 추적.

```typescript
await trackConversion('test-name');
// 또는
await trackConversion('test-name', {
  productId: '123',
  price: 29000
});
```

## 문제 해결

### 변형이 할당되지 않음

1. Supabase 연결 확인
2. 브라우저 콘솔에서 에러 확인
3. `sessionStorage` 접근 가능 여부 확인

### 전환이 추적되지 않음

1. `trackConversion()` 호출 확인
2. Supabase `ab_tests` 테이블 확인
3. 네트워크 탭에서 API 호출 확인

### 결과가 대시보드에 안 뜸

1. `/api/admin/ab-tests` 직접 호출해보기
2. Supabase RLS 정책 확인
3. 테이블 이름 확인 (`ab_tests`)

## 다음 단계

- [ ] 통계적 유의성 계산 추가
- [ ] 실시간 대시보드 업데이트
- [ ] 이메일 알림 (유의미한 결과 시)
- [ ] 다변량 테스트 (MVT) 지원
