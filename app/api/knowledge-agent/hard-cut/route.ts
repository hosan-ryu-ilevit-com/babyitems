/**
 * Knowledge Agent - Hard Cut API
 *
 * 스펙 매칭 기반 하드컷팅
 * - 질문 답변에서 필터 조건 추출 (LLM)
 * - 스펙 매칭 점수 계산
 * - 상위 N개 선별 (기본 15개)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DanawaSearchListItem } from '@/lib/danawa/search-crawler';
import type { HardCutProduct, HardCutResult } from '@/lib/knowledge-agent/types';

export const maxDuration = 30;

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

interface HardCutRequest {
  categoryName: string;
  products: DanawaSearchListItem[];
  collectedInfo: Record<string, string>;
  targetCount?: number;
}

interface FilterCondition {
  specKey: string;
  matchType: 'contains' | 'range' | 'exact';
  matchValue: string | { min?: number; max?: number };
  weight: number;
  mandatory: boolean;
  reason: string;
}

/**
 * 질문 답변에서 필터 조건 추출 (LLM)
 */
async function extractFilterConditions(
  categoryName: string,
  collectedInfo: Record<string, string>,
  availableSpecs: string[]
): Promise<FilterCondition[]> {
  if (!ai) {
    console.log('[HardCut] No AI available, using fallback');
    return [];
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1000,
    },
  });

  const prompt = `## 역할
사용자의 ${categoryName} 구매 조건을 분석하여 스펙 필터링 조건을 추출하세요.

## 사용자 답변
${Object.entries(collectedInfo).map(([q, a]) => `- ${q}: ${a}`).join('\n')}

## 상품에서 발견된 스펙 키워드
${availableSpecs.slice(0, 30).join(', ')}

## 추출 규칙
1. 사용자 답변에서 스펙 관련 조건만 추출
2. 각 조건의 중요도(weight)를 0.3~1.0 사이로 설정
3. 필수 조건(mandatory)은 미충족 시 제외됨
4. matchType: "contains"(포함), "range"(범위), "exact"(정확)

## 응답 형식 (JSON 배열)
[
  {
    "specKey": "스펙 키워드 (예: 용량, 크기, 무선)",
    "matchType": "contains",
    "matchValue": "찾을 값 또는 {min:숫자, max:숫자}",
    "weight": 0.8,
    "mandatory": false,
    "reason": "조건 설명"
  }
]

⚠️ JSON 배열만 응답하세요. 다른 텍스트 없이.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // JSON 추출
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[HardCut] LLM extraction failed:', error);
  }

  return [];
}

/**
 * 스펙 문자열에서 값 추출
 */
function extractSpecValue(specSummary: string, specKey: string): string | number | null {
  if (!specSummary) return null;

  // 숫자 + 단위 패턴 (예: "용량: 5L", "10L 용량", "용량 5리터")
  const patterns = [
    new RegExp(`${specKey}\\s*[:]?\\s*([\\d.]+)\\s*(L|ml|kg|g|W|인치|mm|cm)?`, 'i'),
    new RegExp(`([\\d.]+)\\s*(L|ml|kg|g|W|인치|mm|cm)?\\s*${specKey}`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = specSummary.match(pattern);
    if (match) {
      return parseFloat(match[1]);
    }
  }

  // 텍스트 매칭 (예: "무선", "유선", "디지털")
  if (specSummary.toLowerCase().includes(specKey.toLowerCase())) {
    return specKey;
  }

  return null;
}

/**
 * 단일 조건 매칭 점수 계산 (OR 기반 - 매칭되면 가산)
 */
function calculateConditionMatch(
  specSummary: string,
  condition: FilterCondition
): number {
  if (!specSummary) return 0;

  const specLower = specSummary.toLowerCase();
  const value = extractSpecValue(specSummary, condition.specKey);

  switch (condition.matchType) {
    case 'contains': {
      const matchStr = typeof condition.matchValue === 'string'
        ? condition.matchValue
        : String(condition.matchValue);
      // 키워드가 포함되면 1, 아니면 0 (제외 없음)
      return specLower.includes(matchStr.toLowerCase()) ? 1 : 0;
    }

    case 'range': {
      if (typeof value !== 'number') return 0;
      const range = condition.matchValue as { min?: number; max?: number };
      const inRange = (range.min === undefined || value >= range.min) &&
                      (range.max === undefined || value <= range.max);
      return inRange ? 1 : 0;
    }

    case 'exact': {
      const matchStr = String(condition.matchValue);
      return String(value).toLowerCase() === matchStr.toLowerCase() ? 1 : 0;
    }

    default:
      return 0;
  }
}

/**
 * 상품 스펙 매칭 점수 계산 (OR 기반 - 제외 없이 모두 점수화)
 * - 조건 충족 개수에 비례한 점수
 * - 리뷰/평점 기반 기본 점수
 * - 절대 제외하지 않음 (최소 15개 보장을 위해)
 */
function calculateProductScore(
  product: DanawaSearchListItem,
  conditions: FilterCondition[]
): { score: number; matchedConditions: string[] } {
  // 기본 점수: 리뷰수 + 평점 (최대 50점)
  const reviewBonus = Math.min(product.reviewCount / 100, 1) * 25;
  const ratingBonus = (product.rating || 4) / 5 * 25;
  const baseScore = reviewBonus + ratingBonus;

  if (conditions.length === 0) {
    return {
      score: Math.round(baseScore),
      matchedConditions: [],
    };
  }

  // 조건 매칭 점수 (OR 기반: 많이 충족할수록 높은 점수)
  const matchedConditions: string[] = [];
  let matchCount = 0;
  let totalWeight = 0;
  let weightedMatchSum = 0;

  for (const condition of conditions) {
    const matchScore = calculateConditionMatch(product.specSummary || '', condition);
    totalWeight += condition.weight;

    if (matchScore > 0) {
      matchedConditions.push(condition.reason);
      matchCount++;
      weightedMatchSum += condition.weight;
    }
  }

  // 조건 매칭 점수: 가중치 기반 (최대 50점)
  const conditionScore = totalWeight > 0
    ? (weightedMatchSum / totalWeight) * 50
    : 0;

  // 매칭 개수 보너스: 많이 충족할수록 추가 점수 (최대 20점)
  const matchCountBonus = conditions.length > 0
    ? (matchCount / conditions.length) * 20
    : 0;

  return {
    score: Math.round(baseScore + conditionScore + matchCountBonus),
    matchedConditions,
  };
}

/**
 * 상품 스펙에서 고유 키워드 추출
 */
function extractAvailableSpecs(products: DanawaSearchListItem[]): string[] {
  const specSet = new Set<string>();

  for (const product of products.slice(0, 50)) {
    if (!product.specSummary) continue;

    // 슬래시, 쉼표, 파이프로 분리
    const parts = product.specSummary.split(/[\/,|]/);
    for (const part of parts) {
      const cleaned = part.trim();
      if (cleaned.length > 1 && cleaned.length < 20) {
        // 숫자만 있는 것 제외
        if (!/^\d+$/.test(cleaned)) {
          specSet.add(cleaned);
        }
      }
    }
  }

  return Array.from(specSet);
}

export async function POST(request: NextRequest) {
  try {
    const body: HardCutRequest = await request.json();
    const { categoryName, products, collectedInfo, targetCount = 15 } = body;

    if (!products || products.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No products provided',
      });
    }

    console.log(`\n🔪 [HardCut] Starting: ${products.length}개 → ${targetCount}개`);
    const startTime = Date.now();

    // 1. 상품에서 사용 가능한 스펙 키워드 추출
    const availableSpecs = extractAvailableSpecs(products);
    console.log(`   Found ${availableSpecs.length} spec keywords`);

    // 2. LLM으로 필터 조건 추출
    const conditions = await extractFilterConditions(
      categoryName,
      collectedInfo,
      availableSpecs
    );
    console.log(`   Extracted ${conditions.length} filter conditions`);

    // 3. 각 상품 점수 계산 (OR 기반 - 모든 상품 점수화, 제외 없음)
    const scoredProducts: HardCutProduct[] = products.map(product => {
      const { score, matchedConditions } = calculateProductScore(product, conditions);
      return {
        pcode: product.pcode,
        name: product.name,
        brand: product.brand || '',
        price: product.price || 0,
        rating: product.rating || 0,
        reviewCount: product.reviewCount,
        specs: {},
        specSummary: product.specSummary,
        thumbnail: product.thumbnail,
        productUrl: product.productUrl,
        matchScore: score,
        matchedConditions,
      };
    });

    // 조건별 통계 (매칭된 상품 수)
    const appliedRules: HardCutResult['appliedRules'] = conditions.map(condition => {
      const matched = scoredProducts.filter(p =>
        p.matchedConditions.includes(condition.reason)
      ).length;
      return {
        rule: condition.reason,
        matchedCount: matched,
        filteredCount: products.length - matched,
      };
    });

    // 4. 점수순 정렬 후 상위 N개 선별 (항상 targetCount개 보장)
    scoredProducts.sort((a, b) => b.matchScore - a.matchScore);
    const filteredProducts = scoredProducts.slice(0, targetCount);

    console.log(`   Top scores: ${filteredProducts.slice(0, 3).map(p => `${p.matchScore}점`).join(', ')}`);

    const elapsedMs = Date.now() - startTime;
    console.log(`✅ [HardCut] 완료: ${products.length}개 → ${filteredProducts.length}개 (${(elapsedMs / 1000).toFixed(1)}초)`);

    const result: HardCutResult = {
      success: true,
      filteredProducts,
      totalBefore: products.length,
      totalAfter: filteredProducts.length,
      appliedRules,
    };

    return NextResponse.json(result);

  } catch (error) {
    console.error('[HardCut] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
