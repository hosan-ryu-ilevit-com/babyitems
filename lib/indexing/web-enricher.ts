/**
 * 웹검색 보강 모듈
 * - Gemini Grounding API를 사용하여 상품 정보 보강
 * - 장점, 단점, 추천 대상, 핵심 특징 추출
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { WebEnrichedData, ProductAnalysis, QuestionMapping } from './types';
import { callGeminiWithRetry, parseJSONResponse } from '../ai/gemini';

// Lazy initialization - 함수 호출 시점에 환경 변수 확인
let genAI: GoogleGenerativeAI | null = null;
let initialized = false;

function getGenAI(): GoogleGenerativeAI | null {
  if (!initialized) {
    initialized = true;
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      genAI = new GoogleGenerativeAI(apiKey);
    }
  }
  return genAI;
}

// ============================================================================
// 웹검색 보강 함수
// ============================================================================

/**
 * 상품명으로 웹검색하여 정보 보강
 * @param questionOptions - 맞춤질문 옵션들 (제공 시 직접 매핑도 수행)
 */
export async function enrichProductWithWebSearch(
  productName: string,
  brand: string | null,
  categoryName: string,
  questionOptions?: Array<{ questionId: string; question: string; options: Array<{ value: string; label: string }> }>
): Promise<WebEnrichedData | null> {
  if (!getGenAI()) {
    console.warn('Gemini API not available, skipping web enrichment');
    return null;
  }

  try {
    const productQuery = brand ? `${brand} ${productName}` : productName;

    // 맞춤질문 기반 검색 쿼리 생성
    const searchQueries = generateSearchQueries(productQuery, questionOptions);

    // 병렬로 여러 검색 수행
    const searchResults = await Promise.allSettled(
      searchQueries.map(sq => runSingleSearch(
        productQuery,
        sq.query,
        sq.focus,
        categoryName,
        sq.focus === 'general' ? questionOptions : undefined  // 일반 검색에만 질문 옵션 전달
      ))
    );

    // 결과 병합
    const mergedPros: string[] = [];
    const mergedCons: string[] = [];
    const mergedTargetUsers: string[] = [];
    const mergedKeyFeatures: string[] = [];
    const mergedMapping: QuestionMapping = {};
    let mergedAnalysis: { oneLiner: string; buyingPoint: string; cautions: string[] } | undefined;

    for (const result of searchResults) {
      if (result.status === 'fulfilled' && result.value) {
        const r = result.value;
        mergedPros.push(...(r.pros || []));
        mergedCons.push(...(r.cons || []));
        mergedTargetUsers.push(...(r.targetUsers || []));
        mergedKeyFeatures.push(...(r.keyFeatures || []));

        // 매핑 결과 병합 (더 높은 confidence 우선)
        if (r.questionMapping) {
          for (const [qId, mapping] of Object.entries(r.questionMapping)) {
            const existing = mergedMapping[qId];
            if (!existing || existing.matchedOption === 'unknown' ||
                (existing.confidence === 'low' && mapping.confidence !== 'low')) {
              mergedMapping[qId] = mapping;
            }
          }
        }

        // 분석 결과 (첫 번째 유효한 결과 사용)
        if (!mergedAnalysis && r.analysis) {
          mergedAnalysis = r.analysis;
        }
      }
    }

    // 중복 제거
    const uniquePros = [...new Set(mergedPros)].slice(0, 5);
    const uniqueCons = [...new Set(mergedCons)].slice(0, 4);
    const uniqueTargetUsers = [...new Set(mergedTargetUsers)].slice(0, 3);
    const uniqueKeyFeatures = [...new Set(mergedKeyFeatures)].slice(0, 5);

    return {
      searchedAt: new Date().toISOString(),
      pros: uniquePros,
      cons: uniqueCons,
      targetUsers: uniqueTargetUsers,
      keyFeatures: uniqueKeyFeatures,
      questionMapping: Object.keys(mergedMapping).length > 0 ? mergedMapping : undefined,
      analysis: mergedAnalysis,
    };
  } catch (error) {
    console.error(`Web enrichment failed for ${productName}:`, error);
    return null;
  }
}

/**
 * 맞춤질문 기반 검색 쿼리 생성
 */
function generateSearchQueries(
  productQuery: string,
  questionOptions?: Array<{ questionId: string; question: string; options: Array<{ value: string; label: string }> }>
): Array<{ query: string; focus: string; questionIds: string[] }> {
  const queries: Array<{ query: string; focus: string; questionIds: string[] }> = [];

  // 기본 검색 (장단점, 후기)
  queries.push({
    query: `${productQuery} 후기 장단점`,
    focus: 'general',
    questionIds: [],
  });

  if (!questionOptions || questionOptions.length === 0) {
    return queries;
  }

  // 질문별 키워드 그룹
  const questionKeywords: Record<string, { keywords: string[]; ids: string[] }> = {};

  for (const q of questionOptions) {
    const qLower = q.questionId.toLowerCase();

    if (qLower.includes('material') || qLower.includes('소재')) {
      if (!questionKeywords['material']) {
        questionKeywords['material'] = { keywords: ['소재', '재질', '재료'], ids: [] };
      }
      questionKeywords['material'].ids.push(q.questionId);
    } else if (qLower.includes('cooking') || qLower.includes('method') || qLower.includes('조리')) {
      if (!questionKeywords['cooking']) {
        questionKeywords['cooking'] = { keywords: ['조리 방식', '스팀', '블렌딩', '기능'], ids: [] };
      }
      questionKeywords['cooking'].ids.push(q.questionId);
    } else if (qLower.includes('capacity') || qLower.includes('size') || qLower.includes('용량')) {
      if (!questionKeywords['capacity']) {
        questionKeywords['capacity'] = { keywords: ['용량', '크기', '사이즈'], ids: [] };
      }
      questionKeywords['capacity'].ids.push(q.questionId);
    } else if (qLower.includes('convenience') || qLower.includes('feature') || qLower.includes('편의')) {
      if (!questionKeywords['convenience']) {
        questionKeywords['convenience'] = { keywords: ['편의 기능', '세척', '사용법'], ids: [] };
      }
      questionKeywords['convenience'].ids.push(q.questionId);
    }
  }

  // 각 그룹별 검색 쿼리 생성
  for (const [focus, { keywords, ids }] of Object.entries(questionKeywords)) {
    queries.push({
      query: `${productQuery} ${keywords[0]}`,
      focus,
      questionIds: ids,
    });
  }

  return queries;
}

/**
 * 단일 검색 수행
 */
async function runSingleSearch(
  productQuery: string,
  searchQuery: string,
  focus: string,
  categoryName: string,
  questionOptions?: Array<{ questionId: string; question: string; options: Array<{ value: string; label: string }> }>
): Promise<{
  pros: string[];
  cons: string[];
  targetUsers: string[];
  keyFeatures: string[];
  questionMapping?: QuestionMapping;
  analysis?: { oneLiner: string; buyingPoint: string; cautions: string[] };
} | null> {
  if (!getGenAI()) return null;

  try {
    const model = getGenAI()!.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: questionOptions ? 2500 : 1200,
      },
      // @ts-expect-error - Google Search Grounding
      tools: [{ google_search: {} }],
    });

    const isGeneralSearch = focus === 'general';

    // 질문 옵션 매핑 섹션 (일반 검색에만)
    const questionMappingSection = questionOptions && questionOptions.length > 0
      ? `
## 맞춤질문 옵션 매핑
${questionOptions.map((q, i) => `Q${i + 1}. ${q.question} (${q.questionId})
옵션: ${q.options.map(o => `"${o.value}"=${o.label}`).join(' / ')}`).join('\n')}

questionMapping 필드에 각 질문별로:
- matchedOption: 옵션 value
- confidence: "high"|"medium"|"low"
- evidence: 근거
`
      : '';

    const prompt = isGeneralSearch
      ? `
"${searchQuery}" 제품에 대해 웹검색하여 정보를 추출해주세요.
카테고리: ${categoryName}

## 추출할 정보
1. pros: 장점 3-5개
2. cons: 단점 2-4개
3. targetUsers: 추천 대상 2-3개
4. keyFeatures: 핵심 특징 3-5개
5. analysis: { oneLiner: "15-25자", buyingPoint: "20-40자", cautions: [] }
${questionMappingSection}

JSON만 출력:
{"pros":[],"cons":[],"targetUsers":[],"keyFeatures":[],"analysis":{}${questionOptions ? ',"questionMapping":{}' : ''}}
`
      : `
"${searchQuery}" 제품의 ${focus === 'material' ? '소재/재질' : focus === 'cooking' ? '조리 방식/기능' : focus === 'capacity' ? '용량/크기' : '편의 기능'} 정보를 웹검색해주세요.
카테고리: ${categoryName}

찾은 정보를 JSON으로 출력:
- keyFeatures: 해당 특성 관련 정보 2-3개 (구체적으로: 소재명, 기능명, 용량 수치 등)
- pros: 관련 장점 1-2개
- cons: 관련 단점 1개

JSON만 출력: {"keyFeatures":[],"pros":[],"cons":[]}
`;

    const result = await callGeminiWithRetry(
      () => model.generateContent(prompt),
      2,
      1000
    );

    const responseText = result.response.text();
    return parseJSONResponse(responseText);
  } catch (error) {
    // 개별 검색 실패는 무시 (다른 검색 결과로 보완)
    return null;
  }
}

// ============================================================================
// 제품 분석 함수 (웹검색 없이 LLM 분석)
// ============================================================================

/**
 * 제품 정보와 웹검색 결과를 기반으로 분석 생성
 */
export async function analyzeProduct(
  productName: string,
  brand: string | null,
  specs: Record<string, string>,
  webEnriched: WebEnrichedData | null,
  categoryName: string
): Promise<ProductAnalysis | null> {
  if (!getGenAI()) {
    console.warn('Gemini API not available, skipping product analysis');
    return null;
  }

  try {
    const model = getGenAI()!.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1000,
      },
    });

    const specsText = Object.entries(specs)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join('\n');

    const webInfoText = webEnriched
      ? `
## 웹검색 정보
- 장점: ${webEnriched.pros.join(', ')}
- 단점: ${webEnriched.cons.join(', ')}
- 추천 대상: ${webEnriched.targetUsers.join(', ')}
- 핵심 특징: ${webEnriched.keyFeatures.join(', ')}
`
      : '(웹검색 정보 없음)';

    const prompt = `
다음 제품에 대해 간결한 분석을 작성해주세요.

## 제품 정보
- 이름: ${productName}
- 브랜드: ${brand || '미상'}
- 카테고리: ${categoryName}

## 스펙
${specsText || '(스펙 정보 없음)'}

${webInfoText}

## 작성할 내용

1. **oneLiner**: 이 제품의 핵심을 한 문장으로 (15-25자)
   - 예: "시간 없는 부모를 위한 올인원 솔루션"
   - 예: "가성비 좋은 입문용 제품"

2. **buyingPoint**: 구매 포인트 한 줄 (20-40자)
   - 이 제품을 사야 하는 핵심 이유

3. **cautions**: 구매 전 주의사항 1-3개
   - 실제 단점이나 고려해야 할 점

## 응답 형식 (JSON만 출력)

{
  "oneLiner": "...",
  "buyingPoint": "...",
  "cautions": ["주의1", "주의2"]
}
`;

    const result = await callGeminiWithRetry(
      () => model.generateContent(prompt),
      3,
      1500
    );

    const responseText = result.response.text();
    const parsed = parseJSONResponse<ProductAnalysis>(responseText);

    return {
      oneLiner: parsed.oneLiner || '',
      buyingPoint: parsed.buyingPoint || '',
      cautions: parsed.cautions || [],
    };
  } catch (error) {
    console.error(`Product analysis failed for ${productName}:`, error);
    return null;
  }
}

// ============================================================================
// 카테고리 트렌드 분석 (맞춤질문 생성용)
// ============================================================================

/**
 * 카테고리 트렌드 웹검색 분석
 */
export async function analyzeCategoryTrends(
  categoryName: string
): Promise<{
  trends: string[];
  buyingFactors: string[];
  commonConcerns: string[];
} | null> {
  if (!getGenAI()) {
    console.warn('Gemini API not available, skipping category trends');
    return null;
  }

  try {
    const model = getGenAI()!.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      // @ts-expect-error - Google Search Grounding
      tools: [{ google_search: {} }],
    });

    const year = new Date().getFullYear();
    const prompt = `
"${categoryName} ${year}년 트렌드 구매 가이드"에 대해 웹검색하여 다음 정보를 추출해주세요.

## 추출할 정보

1. **trends**: ${year}년 ${categoryName} 시장 트렌드 3-5개
2. **buyingFactors**: 구매 시 핵심 고려사항 4-6개 (질문 생성의 핵심!)
3. **commonConcerns**: 구매자들이 흔히 걱정하는 점 2-4개

## 응답 형식 (JSON만 출력)

{
  "trends": ["트렌드1", "트렌드2", ...],
  "buyingFactors": ["고려사항1", "고려사항2", ...],
  "commonConcerns": ["걱정1", "걱정2", ...]
}

**주의사항:**
- 실제 웹검색 결과에 기반
- ${categoryName}에 특화된 내용만
- 추상적인 내용 금지 (예: "좋은 품질" X → "스테인리스 재질 여부" O)
`;

    const result = await callGeminiWithRetry(
      () => model.generateContent(prompt),
      3,
      2000
    );

    const responseText = result.response.text();
    return parseJSONResponse<{
      trends: string[];
      buyingFactors: string[];
      commonConcerns: string[];
    }>(responseText);
  } catch (error) {
    console.error(`Category trends analysis failed for ${categoryName}:`, error);
    return null;
  }
}

// ============================================================================
// 배치 처리 유틸리티
// ============================================================================

/**
 * 배치로 웹검색 보강 처리
 */
export async function enrichProductsBatch(
  products: Array<{
    pcode: string;
    name: string;
    brand: string | null;
  }>,
  categoryName: string,
  options: {
    concurrency?: number;
    delayMs?: number;
  } = {}
): Promise<Map<string, WebEnrichedData | null>> {
  const { concurrency = 3, delayMs = 1500 } = options;
  const results = new Map<string, WebEnrichedData | null>();

  // 배치 처리
  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);

    console.log(`[WebEnrich] Processing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(products.length / concurrency)}`);

    const batchResults = await Promise.allSettled(
      batch.map(p => enrichProductWithWebSearch(p.name, p.brand, categoryName))
    );

    batch.forEach((product, idx) => {
      const result = batchResults[idx];
      if (result.status === 'fulfilled') {
        results.set(product.pcode, result.value);
      } else {
        console.error(`Failed to enrich ${product.name}:`, result.reason);
        results.set(product.pcode, null);
      }
    });

    // Rate limit 방지 딜레이
    if (i + concurrency < products.length) {
      await sleep(delayMs);
    }
  }

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
