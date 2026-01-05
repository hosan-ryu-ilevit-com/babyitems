/**
 * Knowledge Agent V3 - 상품 데이터 강화
 *
 * 기존 다나와 크롤러를 활용하여 상세 스펙과 리뷰를 가져오고 AI로 요약
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { DanawaSearchListItem } from '@/lib/danawa/search-crawler';
import type { ProductKnowledge } from './types';

// 다나와 크롤러 (존재하는 경우)
let crawlDanawaProduct: ((pcode: string) => Promise<unknown>) | null = null;
let fetchDanawaReviews: ((pcode: string, maxPages?: number) => Promise<unknown>) | null = null;

// 동적 import로 크롤러 로드 (없으면 무시)
async function loadCrawlers() {
  try {
    const crawlerModule = await import('@/lib/danawa/crawler');
    crawlDanawaProduct = crawlerModule.crawlDanawaProduct;
  } catch {
    console.log('[ProductEnricher] Crawler module not available');
  }

  try {
    const reviewModule = await import('@/lib/danawa/review-crawler');
    fetchDanawaReviews = reviewModule.fetchDanawaReviews;
  } catch {
    console.log('[ProductEnricher] Review crawler module not available');
  }
}

// 초기화
loadCrawlers();

// Gemini - GEMINI_API_KEY 또는 GOOGLE_GENERATIVE_AI_API_KEY 둘 다 지원
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// ============================================================================
// 스펙 파싱
// ============================================================================

/**
 * specSummary 문자열을 구조화된 스펙 객체로 파싱
 * 예: "용량: 5L | 소비전력: 1400W | 소재: 스테인리스"
 */
export function parseSpecSummary(specSummary: string): Record<string, string> {
  const specs: Record<string, string> = {};
  if (!specSummary) return specs;

  // 구분자: |, /, ,
  const parts = specSummary.split(/[|\/,]/).map(s => s.trim()).filter(Boolean);

  for (const part of parts) {
    // "키: 값" 또는 "키 값" 형식
    const colonMatch = part.match(/^(.+?):\s*(.+)$/);
    if (colonMatch) {
      specs[colonMatch[1].trim()] = colonMatch[2].trim();
      continue;
    }

    // 특정 패턴 매칭 (단위가 있는 경우)
    const patterns: [RegExp, string][] = [
      [/(\d+(?:\.\d+)?)\s*L/, '용량'],
      [/(\d+(?:\.\d+)?)\s*W/, '소비전력'],
      [/(\d+(?:\.\d+)?)\s*kg/, '무게'],
      [/(\d+(?:\.\d+)?)\s*mm/, '크기'],
    ];

    for (const [pattern, key] of patterns) {
      const match = part.match(pattern);
      if (match) {
        specs[key] = match[0];
        break;
      }
    }
  }

  return specs;
}

/**
 * 크롤링된 상세 스펙을 정규화
 */
export function normalizeSpecs(rawSpecs: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(rawSpecs)) {
    if (value === null || value === undefined) continue;

    // 배열인 경우 join
    if (Array.isArray(value)) {
      normalized[key] = value.join(', ');
    } else {
      normalized[key] = String(value);
    }
  }

  return normalized;
}

// ============================================================================
// 리뷰 요약
// ============================================================================

interface ReviewForSummary {
  rating: number;
  content: string;
  author?: string;
  date?: string;
}

/**
 * 리뷰 목록을 AI로 요약
 */
export async function summarizeReviews(reviews: ReviewForSummary[]): Promise<{
  pros: string[];
  cons: string[];
  recommendedFor: string;
}> {
  if (!ai || reviews.length === 0) {
    return {
      pros: [],
      cons: [],
      recommendedFor: '',
    };
  }

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3 },
    });

    // 리뷰 텍스트 준비 (최대 20개)
    const reviewTexts = reviews.slice(0, 20).map((r, i) =>
      `[리뷰${i + 1}] ⭐${r.rating}: ${r.content.slice(0, 200)}`
    ).join('\n');

    const prompt = `
다음 실제 구매자 리뷰들을 분석하여 장단점을 요약해주세요.

## 리뷰 데이터
${reviewTexts}

## 분석 결과를 JSON으로 응답:
{
  "pros": ["장점1 (간결하게)", "장점2", "장점3"],
  "cons": ["단점1 (간결하게)", "단점2"],
  "recommendedFor": "이 제품은 [어떤 사용자]에게 추천합니다 (1문장)"
}

- 실제 리뷰에서 자주 언급되는 내용 위주로
- 각 항목은 10단어 이내로 간결하게
- 최대 장점 5개, 단점 3개
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        pros: parsed.pros || [],
        cons: parsed.cons || [],
        recommendedFor: parsed.recommendedFor || '',
      };
    }
  } catch (e) {
    console.error('[ProductEnricher] Review summarization failed:', e);
  }

  return {
    pros: [],
    cons: [],
    recommendedFor: '',
  };
}

// ============================================================================
// 상품 강화
// ============================================================================

/**
 * 검색 결과 상품을 ProductKnowledge로 변환 (기본 정보만)
 */
export function convertToProductKnowledge(
  item: DanawaSearchListItem,
  rank: number
): ProductKnowledge {
  return {
    rank,
    pcode: item.pcode,
    name: item.name,
    brand: item.brand || '',
    price: item.price || 0,
    rating: item.rating || 0,
    reviewCount: item.reviewCount || 0,
    specs: parseSpecSummary(item.specSummary),
    specSummary: item.specSummary,
    prosFromReviews: [],
    consFromReviews: [],
    recommendedFor: '',
    productUrl: item.productUrl || `https://prod.danawa.com/info/?pcode=${item.pcode}`,
    thumbnail: item.thumbnail,
  };
}

/**
 * 단일 상품 상세 정보 강화 (스펙 + 리뷰)
 */
export async function enrichProduct(
  product: ProductKnowledge,
  options?: {
    includeSpecs?: boolean;
    includeReviews?: boolean;
    maxReviewPages?: number;
  }
): Promise<ProductKnowledge> {
  const {
    includeSpecs = true,
    includeReviews = true,
    maxReviewPages = 2,
  } = options || {};

  const enriched = { ...product };

  // 상세 스펙 크롤링
  if (includeSpecs && crawlDanawaProduct && product.pcode) {
    try {
      const detailed = await crawlDanawaProduct(product.pcode) as {
        success?: boolean;
        spec?: Record<string, unknown>;
      };

      if (detailed?.success && detailed.spec) {
        const parsedSpecs = normalizeSpecs(detailed.spec);
        enriched.specs = { ...enriched.specs, ...parsedSpecs };
      }
    } catch (e) {
      console.error(`[ProductEnricher] Failed to enrich specs for ${product.pcode}:`, e);
    }
  }

  // 리뷰 크롤링 및 요약
  if (includeReviews && fetchDanawaReviews && product.pcode) {
    try {
      const reviewData = await fetchDanawaReviews(product.pcode, maxReviewPages) as {
        success?: boolean;
        reviews?: ReviewForSummary[];
      };

      if (reviewData?.success && reviewData.reviews?.length) {
        const summary = await summarizeReviews(reviewData.reviews);
        enriched.prosFromReviews = summary.pros;
        enriched.consFromReviews = summary.cons;
        enriched.recommendedFor = summary.recommendedFor;
      }
    } catch (e) {
      console.error(`[ProductEnricher] Failed to enrich reviews for ${product.pcode}:`, e);
    }
  }

  return enriched;
}

/**
 * 여러 상품 배치 강화 (병렬 처리, 속도 제한)
 */
export async function batchEnrichProducts(
  products: ProductKnowledge[],
  options?: {
    includeSpecs?: boolean;
    includeReviews?: boolean;
    maxReviewPages?: number;
    concurrency?: number;
    delayMs?: number;
  }
): Promise<ProductKnowledge[]> {
  const {
    concurrency = 3,
    delayMs = 1000,
    ...enrichOptions
  } = options || {};

  const results: ProductKnowledge[] = [];

  // 청크 단위로 처리
  for (let i = 0; i < products.length; i += concurrency) {
    const chunk = products.slice(i, i + concurrency);

    const enrichedChunk = await Promise.all(
      chunk.map(p => enrichProduct(p, enrichOptions))
    );

    results.push(...enrichedChunk);

    // Rate limiting
    if (i + concurrency < products.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    console.log(`[ProductEnricher] Enriched ${results.length}/${products.length} products`);
  }

  return results;
}

// ============================================================================
// AI 기반 상품 분석
// ============================================================================

/**
 * 상품 목록에서 AI로 트렌드 및 인사이트 추출
 */
export async function analyzeProductTrends(
  products: ProductKnowledge[],
  categoryName: string
): Promise<{
  trends: string[];
  priceInsight: string;
  commonPros: string[];
  commonCons: string[];
}> {
  if (!ai || products.length === 0) {
    return {
      trends: [],
      priceInsight: '',
      commonPros: [],
      commonCons: [],
    };
  }

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3 },
    });

    // 상품 요약 데이터 준비
    const productSummaries = products.slice(0, 15).map((p, i) => ({
      rank: i + 1,
      name: p.name,
      brand: p.brand,
      price: p.price,
      rating: p.rating,
      reviewCount: p.reviewCount,
      specs: Object.entries(p.specs).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(', '),
      pros: p.prosFromReviews.slice(0, 3).join(', '),
      cons: p.consFromReviews.slice(0, 2).join(', '),
    }));

    const prompt = `
다음은 ${categoryName} 인기순 상위 ${products.length}개 상품 데이터입니다.

## 상품 데이터
${JSON.stringify(productSummaries, null, 2)}

## 분석 과제
1. 인기 제품들의 공통 트렌드 3-4개
2. 가격대 인사이트 (최저/최고/평균, 가성비 구간)
3. 자주 언급되는 장점 3-4개
4. 자주 언급되는 단점 2-3개

## JSON 응답:
{
  "trends": ["트렌드1 (예: 대용량화)", "트렌드2", "트렌드3"],
  "priceInsight": "가격대 인사이트 1-2문장",
  "commonPros": ["공통 장점1", "장점2", "장점3"],
  "commonCons": ["공통 단점1", "단점2"]
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        trends: parsed.trends || [],
        priceInsight: parsed.priceInsight || '',
        commonPros: parsed.commonPros || [],
        commonCons: parsed.commonCons || [],
      };
    }
  } catch (e) {
    console.error('[ProductEnricher] Trend analysis failed:', e);
  }

  return {
    trends: [],
    priceInsight: '',
    commonPros: [],
    commonCons: [],
  };
}

/**
 * 구매 가이드 생성
 */
export async function generateBuyingGuide(
  products: ProductKnowledge[],
  categoryName: string
): Promise<{
  byUserType: Record<string, string>;
  byBudget: Record<string, string>;
  commonMistakes: string[];
}> {
  if (!ai || products.length === 0) {
    return {
      byUserType: {},
      byBudget: {},
      commonMistakes: [],
    };
  }

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.5 },
    });

    // 가격대 분석
    const prices = products.map(p => p.price).filter(p => p > 0);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);

    const prompt = `
당신은 ${categoryName} 구매 전문가입니다.

## 시장 데이터
- 분석 상품: ${products.length}개
- 가격 범위: ${minPrice.toLocaleString()}원 ~ ${maxPrice.toLocaleString()}원
- 평균 가격: ${avgPrice.toLocaleString()}원
- 상위 브랜드: ${[...new Set(products.slice(0, 10).map(p => p.brand))].join(', ')}

## 과제
사용자 유형별, 예산별 구매 가이드를 작성하세요.

## JSON 응답:
{
  "byUserType": {
    "1-2인 가구": "추천 방향 1문장",
    "3-4인 가구": "추천 방향 1문장",
    "5인 이상 대가족": "추천 방향 1문장"
  },
  "byBudget": {
    "${Math.round(minPrice / 10000)}~${Math.round(avgPrice * 0.7 / 10000)}만원": "가성비 구간 특징",
    "${Math.round(avgPrice * 0.7 / 10000)}~${Math.round(avgPrice * 1.3 / 10000)}만원": "인기 구간 특징",
    "${Math.round(avgPrice * 1.3 / 10000)}만원 이상": "프리미엄 구간 특징"
  },
  "commonMistakes": [
    "흔한 구매 실수 1",
    "흔한 구매 실수 2",
    "흔한 구매 실수 3"
  ]
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        byUserType: parsed.byUserType || {},
        byBudget: parsed.byBudget || {},
        commonMistakes: parsed.commonMistakes || [],
      };
    }
  } catch (e) {
    console.error('[ProductEnricher] Buying guide generation failed:', e);
  }

  return {
    byUserType: {},
    byBudget: {},
    commonMistakes: [],
  };
}
