/**
 * A/B 테스트 사용 예시
 */

'use client';

import { useEffect, useState } from 'react';
import { assignVariant, trackConversion, getVariant, type Variant } from './ab-test';

/**
 * 예시 1: AI 도우미 버튼 레이블 테스트
 */
export function AIHelperButtonTest() {
  const [variant, setVariant] = useState<Variant | null>(null);

  useEffect(() => {
    assignVariant({
      name: 'ai-helper-label-test',
      variants: ['A', 'B', 'C'],
      // weights: [0.33, 0.33, 0.34] // 선택적: 가중치
    }).then(setVariant);
  }, []);

  if (!variant) return null;

  const labels: Record<Variant, string> = {
    A: '뭘 골라야 할지 모르겠어요',
    B: 'AI에게 물어보기',
    C: '선택 도움받기'
  };

  const handleClick = async () => {
    // 클릭 = 전환으로 간주
    await trackConversion('ai-helper-label-test', {
      label: labels[variant],
      clicked_at: new Date().toISOString()
    });

    // 실제 기능 실행
    console.log('AI 도우미 실행');
  };

  return (
    <button onClick={handleClick} className="btn-primary">
      {labels[variant]}
    </button>
  );
}

/**
 * 예시 2: 추천 플로우 순서 테스트
 */
export function RecommendFlowOrderTest() {
  const [variant, setVariant] = useState<Variant | null>(null);

  useEffect(() => {
    assignVariant({
      name: 'flow-order-test',
      variants: ['A', 'B']
    }).then(setVariant);
  }, []);

  if (!variant) return null;

  // A: 기존 순서 (하드필터 -> 밸런스 게임)
  // B: 새로운 순서 (밸런스 게임 -> 하드필터)

  const flowOrder = variant === 'A'
    ? ['hard-filter', 'balance-game', 'negative-filter']
    : ['balance-game', 'hard-filter', 'negative-filter'];

  return <div data-flow-order={flowOrder.join(',')} />;
}

/**
 * 예시 3: 가격 표시 방식 테스트
 */
export function PriceDisplayTest({ price }: { price: number }) {
  const [variant, setVariant] = useState<Variant | null>(null);

  useEffect(() => {
    assignVariant('price-display-test').then(setVariant);
  }, []);

  if (!variant) return <span>{price.toLocaleString()}원</span>;

  // A: 기본 (123,456원)
  // B: 강조 (₩123,456)
  const display = variant === 'A'
    ? `${price.toLocaleString()}원`
    : `₩${price.toLocaleString()}`;

  return <span className={variant === 'B' ? 'font-bold text-primary' : ''}>{display}</span>;
}

/**
 * 예시 4: 서버 컴포넌트에서 사용 (쿠키 기반)
 */
export async function getServerSideVariant(testName: string): Promise<Variant> {
  // 서버에서는 쿠키를 사용해야 함
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const key = `ab-test-${testName}`;

  const existing = cookieStore.get(key)?.value as Variant;
  if (existing) return existing;

  // 새로운 할당
  const variants: Variant[] = ['A', 'B'];
  const variant = variants[Math.floor(Math.random() * variants.length)];

  // 쿠키에 저장 (30일)
  cookieStore.set(key, variant, {
    maxAge: 30 * 24 * 60 * 60,
    path: '/'
  });

  return variant;
}
