/**
 * 간단한 A/B(C) 테스트 라이브러리
 *
 * 사용법:
 * 1. assignVariant() - 사용자에게 변형 할당
 * 2. trackConversion() - 전환 추적
 * 3. getVariant() - 현재 할당된 변형 조회
 */

'use client';

import React from 'react';
import { createClient } from '@/lib/supabase/client';

export type Variant = 'A' | 'B' | 'C';

interface ABTestConfig {
  name: string;
  variants: Variant[];
  weights?: number[]; // 선택적: 가중치 [0.5, 0.3, 0.2] 같은 형식
}

/**
 * 세션 ID 생성 또는 조회
 */
function getSessionId(): string {
  const key = 'ab-test-session-id';
  let sessionId = sessionStorage.getItem(key);

  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(key, sessionId);
  }

  return sessionId;
}

/**
 * 가중치 기반 랜덤 선택
 */
function weightedRandom(variants: Variant[], weights?: number[]): Variant {
  if (!weights || weights.length !== variants.length) {
    // 균등 분포
    const randomIndex = Math.floor(Math.random() * variants.length);
    return variants[randomIndex];
  }

  // 가중치 기반 선택
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < variants.length; i++) {
    random -= weights[i];
    if (random <= 0) return variants[i];
  }

  return variants[variants.length - 1];
}

/**
 * 변형 할당 및 로깅
 */
export async function assignVariant(config: ABTestConfig | string): Promise<Variant> {
  const testConfig: ABTestConfig = typeof config === 'string'
    ? { name: config, variants: ['A', 'B'] }
    : config;

  const storageKey = `ab-test-${testConfig.name}`;
  const sessionId = getSessionId();

  // 기존 할당이 있으면 재사용
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing as Variant;

  // 새로운 변형 할당
  const variant = weightedRandom(testConfig.variants, testConfig.weights);
  sessionStorage.setItem(storageKey, variant);

  // Supabase에 로깅
  try {
    const supabase = createClient();
    await supabase.from('ab_tests').insert({
      session_id: sessionId,
      test_name: testConfig.name,
      variant,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      metadata: {
        timestamp: new Date().toISOString(),
        pathname: typeof window !== 'undefined' ? window.location.pathname : null,
      }
    });
  } catch (error) {
    console.error('AB test logging failed:', error);
    // 로깅 실패해도 변형은 반환
  }

  return variant;
}

/**
 * 기존 할당된 변형 조회 (로깅 없음)
 */
export function getVariant(testName: string): Variant | null {
  const storageKey = `ab-test-${testName}`;
  const existing = sessionStorage.getItem(storageKey);
  return existing as Variant | null;
}

/**
 * 전환 추적
 */
export async function trackConversion(testName: string, metadata?: Record<string, any>): Promise<void> {
  const variant = getVariant(testName);
  if (!variant) {
    console.warn(`No variant assigned for test: ${testName}`);
    return;
  }

  const sessionId = getSessionId();

  try {
    const supabase = createClient();

    // 해당 세션의 테스트를 찾아서 업데이트
    const { error } = await supabase
      .from('ab_tests')
      .update({
        converted: true,
        conversion_at: new Date().toISOString(),
        metadata: metadata || {}
      })
      .eq('session_id', sessionId)
      .eq('test_name', testName)
      .eq('variant', variant)
      .is('converted', false) // 중복 전환 방지
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;
  } catch (error) {
    console.error('Conversion tracking failed:', error);
  }
}

/**
 * React Hook (선택적)
 */
export function useABTest(config: ABTestConfig | string): {
  variant: Variant | null;
  isLoading: boolean;
} {
  const [variant, setVariant] = React.useState<Variant | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    assignVariant(config).then(v => {
      setVariant(v);
      setIsLoading(false);
    });
  }, []);

  return { variant, isLoading };
}
