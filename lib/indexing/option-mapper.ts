/**
 * 옵션 매핑 모듈
 * - 제품 정보를 맞춤질문 옵션에 매핑
 * - 규칙 기반 (예산, 브랜드) + LLM 기반 (나머지)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  QuestionTodo,
  QuestionMapping,
  QuestionOptionMapping,
  WebEnrichedData,
} from './types';
import { callGeminiWithRetry, parseJSONResponse } from '../ai/gemini';

// Gemini API 초기화
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

// ============================================================================
// 메인 매핑 함수
// ============================================================================

/**
 * 제품을 모든 질문의 옵션에 매핑
 */
export async function mapProductToOptions(
  product: {
    pcode: string;
    name: string;
    brand: string | null;
    price: number | null;
    specs: Record<string, string>;
    specSummary: string;
  },
  questions: QuestionTodo[],
  webEnriched: WebEnrichedData | null
): Promise<QuestionMapping> {
  const mapping: QuestionMapping = {};

  // 규칙 기반으로 먼저 매핑 가능한 것들 처리
  const ruleMappedIds: string[] = [];

  for (const question of questions) {
    // 예산 질문
    if (question.id.toLowerCase().includes('budget') || question.id.toLowerCase().includes('price')) {
      mapping[question.id] = mapBudgetOption(product.price, question);
      ruleMappedIds.push(question.id);
      continue;
    }

    // 브랜드 질문
    if (question.id.toLowerCase().includes('brand')) {
      mapping[question.id] = mapBrandOption(product.brand, question);
      ruleMappedIds.push(question.id);
      continue;
    }

    // 소재 질문 - 제품명 키워드로 추론
    if (question.id.toLowerCase().includes('material')) {
      const materialMapping = mapMaterialFromName(product.name, question);
      if (materialMapping.matchedOption !== 'unknown') {
        mapping[question.id] = materialMapping;
        ruleMappedIds.push(question.id);
        continue;
      }
    }

    // 조리방식 질문 - 제품명 키워드로 추론
    if (question.id.toLowerCase().includes('cooking') || question.id.toLowerCase().includes('method')) {
      const cookingMapping = mapCookingMethodFromName(product.name, question);
      if (cookingMapping.matchedOption !== 'unknown') {
        mapping[question.id] = cookingMapping;
        ruleMappedIds.push(question.id);
        continue;
      }
    }
  }

  // 나머지 질문은 LLM으로 매핑
  const remainingQuestions = questions.filter(q => !ruleMappedIds.includes(q.id));

  if (remainingQuestions.length > 0) {
    const llmMapping = await mapWithLLM(product, remainingQuestions, webEnriched);
    Object.assign(mapping, llmMapping);
  }

  return mapping;
}

// ============================================================================
// 규칙 기반 매핑
// ============================================================================

/**
 * 예산 옵션 매핑
 */
function mapBudgetOption(
  price: number | null,
  question: QuestionTodo
): QuestionOptionMapping {
  if (!price) {
    return {
      matchedOption: 'unknown',
      confidence: 'low',
      evidence: '가격 정보 없음',
    };
  }

  // 옵션에서 가격 범위 추출 시도
  const priceRanges = question.options.map(opt => {
    const match = opt.label.match(/(\d+)(?:만)?원?/);
    const threshold = match ? parseInt(match[1]) * 10000 : null;
    return { value: opt.value, threshold, label: opt.label };
  });

  // 가격 매칭
  let matchedOption = question.options[question.options.length - 1]?.value || 'skip';
  let matchedLabel = '';

  for (const range of priceRanges) {
    if (range.threshold && price <= range.threshold) {
      matchedOption = range.value;
      matchedLabel = range.label;
      break;
    }
  }

  // "상관없어요" 옵션 제외하고 매칭
  if (matchedOption === 'skip' || matchedOption === 'any') {
    // 가격 기반으로 가장 적절한 옵션 찾기
    const sortedRanges = priceRanges
      .filter(r => r.threshold && r.value !== 'skip' && r.value !== 'any')
      .sort((a, b) => (a.threshold || 0) - (b.threshold || 0));

    for (const range of sortedRanges) {
      if (range.threshold && price <= range.threshold) {
        matchedOption = range.value;
        matchedLabel = range.label;
        break;
      }
    }

    // 가장 비싼 옵션
    if (matchedOption === 'skip' && sortedRanges.length > 0) {
      matchedOption = sortedRanges[sortedRanges.length - 1].value;
      matchedLabel = sortedRanges[sortedRanges.length - 1].label;
    }
  }

  return {
    matchedOption,
    confidence: 'high',
    evidence: `${price.toLocaleString()}원 → ${matchedLabel || matchedOption}`,
  };
}

/**
 * 브랜드 옵션 매핑
 */
function mapBrandOption(
  brand: string | null,
  question: QuestionTodo
): QuestionOptionMapping {
  if (!brand) {
    return {
      matchedOption: 'unknown',
      confidence: 'low',
      evidence: '브랜드 정보 없음',
    };
  }

  const brandLower = brand.toLowerCase();

  // 옵션에서 브랜드 매칭
  for (const opt of question.options) {
    const optLower = opt.label.toLowerCase();
    if (optLower.includes(brandLower) || brandLower.includes(optLower.split(' ')[0])) {
      return {
        matchedOption: opt.value,
        confidence: 'high',
        evidence: `브랜드: ${brand}`,
      };
    }
  }

  // "기타" 또는 "상관없어요" 옵션 찾기
  const otherOption = question.options.find(
    opt => opt.value === 'other' || opt.value === 'skip' || opt.label.includes('기타')
  );

  return {
    matchedOption: otherOption?.value || 'unknown',
    confidence: 'medium',
    evidence: `브랜드 "${brand}"는 옵션 목록에 없음`,
  };
}

// ============================================================================
// 제품명 키워드 기반 매핑
// ============================================================================

/**
 * 제품명에서 소재 추론
 */
function mapMaterialFromName(
  productName: string,
  question: QuestionTodo
): QuestionOptionMapping {
  const nameLower = productName.toLowerCase();

  // 소재 키워드 매핑
  const materialKeywords: Array<{ keywords: string[]; optionValues: string[]; label: string }> = [
    { keywords: ['실리콘', 'silicone'], optionValues: ['silicone', 'silicon'], label: '실리콘' },
    { keywords: ['스텐', '스테인리스', 'stainless', '스틸'], optionValues: ['stainless', 'stainless_steel', 'steel'], label: '스테인리스' },
    { keywords: ['도자기', '세라믹', 'ceramic', '자기'], optionValues: ['ceramic', 'porcelain'], label: '도자기/세라믹' },
    { keywords: ['유리', 'glass', '글라스'], optionValues: ['glass'], label: '유리' },
    { keywords: ['플라스틱', 'plastic', 'pp', 'abs'], optionValues: ['plastic', 'bpa_free_plastic', 'bpa_free'], label: '플라스틱' },
    { keywords: ['나무', '원목', 'wood', '대나무', '뱀부'], optionValues: ['wood', 'bamboo'], label: '나무/대나무' },
  ];

  for (const { keywords, optionValues, label } of materialKeywords) {
    const hasKeyword = keywords.some(kw => nameLower.includes(kw));
    if (hasKeyword) {
      // 질문의 옵션에서 매칭되는 값 찾기
      const matchedOption = question.options.find(opt =>
        optionValues.some(ov => opt.value.toLowerCase().includes(ov))
      );
      if (matchedOption) {
        return {
          matchedOption: matchedOption.value,
          confidence: 'high',
          evidence: `제품명에 "${label}" 키워드 포함`,
        };
      }
    }
  }

  return {
    matchedOption: 'unknown',
    confidence: 'low',
    evidence: '제품명에서 소재 정보 없음',
  };
}

/**
 * 제품명에서 조리방식 추론
 */
function mapCookingMethodFromName(
  productName: string,
  question: QuestionTodo
): QuestionOptionMapping {
  const nameLower = productName.toLowerCase();

  // 조리방식 키워드 매핑
  const cookingKeywords: Array<{ keywords: string[]; optionValues: string[]; label: string }> = [
    { keywords: ['마스터기', '올인원', '블렌더', '믹서'], optionValues: ['steam_and_blend', 'all_in_one', 'blend'], label: '스팀+블렌딩' },
    { keywords: ['찜기', '스팀', 'steam'], optionValues: ['steam', 'steam_only'], label: '스팀' },
    { keywords: ['블렌더', '믹서', '갈기'], optionValues: ['blend', 'blend_only'], label: '블렌딩' },
    { keywords: ['냄비', '솥', '조리기'], optionValues: ['manual', 'pot', 'traditional'], label: '수동 조리' },
    { keywords: ['큐브', '보관용기', '용기'], optionValues: ['storage', 'container', 'none'], label: '보관용' },
  ];

  for (const { keywords, optionValues, label } of cookingKeywords) {
    const hasKeyword = keywords.some(kw => nameLower.includes(kw));
    if (hasKeyword) {
      const matchedOption = question.options.find(opt =>
        optionValues.some(ov => opt.value.toLowerCase().includes(ov))
      );
      if (matchedOption) {
        return {
          matchedOption: matchedOption.value,
          confidence: 'medium',
          evidence: `제품명에 "${label}" 키워드 포함`,
        };
      }
    }
  }

  return {
    matchedOption: 'unknown',
    confidence: 'low',
    evidence: '제품명에서 조리방식 정보 없음',
  };
}

// ============================================================================
// LLM 기반 매핑
// ============================================================================

/**
 * LLM을 사용하여 여러 질문에 대해 한 번에 매핑
 */
async function mapWithLLM(
  product: {
    pcode: string;
    name: string;
    brand: string | null;
    price: number | null;
    specs: Record<string, string>;
    specSummary: string;
  },
  questions: QuestionTodo[],
  webEnriched: WebEnrichedData | null
): Promise<QuestionMapping> {
  if (!genAI || questions.length === 0) {
    return {};
  }

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.2,  // 낮은 temperature로 일관성 확보
        maxOutputTokens: 2000,
      },
    });

    // 제품 정보 컨텍스트 구성
    const productContext = buildProductContext(product, webEnriched);

    // 질문별 매핑 요청 구성
    const questionsContext = questions.map((q, idx) => {
      const optionsText = q.options
        .map(opt => `  - "${opt.value}": ${opt.label}${opt.description ? ` (${opt.description})` : ''}`)
        .join('\n');
      return `
### 질문 ${idx + 1}: ${q.id}
**"${q.question}"**

옵션:
${optionsText}
`;
    }).join('\n');

    const prompt = `
다음 제품 정보를 분석하여 각 질문에 가장 적합한 옵션을 선택해주세요.

## 제품 정보
${productContext}

## 질문 목록
${questionsContext}

## 응답 형식 (JSON만 출력)

각 질문 ID를 키로, 매핑 결과를 값으로 하는 객체를 반환하세요:

{
  "질문ID1": {
    "matchedOption": "선택한 옵션의 value",
    "confidence": "high" | "medium" | "low",
    "evidence": "선택 근거 (제품 정보에서 발견한 증거)"
  },
  "질문ID2": { ... }
}

**매핑 원칙:**
1. 제품 정보에서 명확히 확인되면 "high"
2. 부분적으로 추론 가능하면 "medium"
3. 정보 부족으로 추측하면 "low"
4. evidence는 반드시 제품 정보에 기반 (추측 금지)
5. 정보가 전혀 없으면 "unknown"을 matchedOption으로
`;

    const result = await callGeminiWithRetry(
      () => model.generateContent(prompt),
      3,
      1500
    );

    const responseText = result.response.text();
    return parseJSONResponse<QuestionMapping>(responseText);
  } catch (error) {
    console.error(`LLM mapping failed for ${product.name}:`, error);

    // 실패 시 기본값 반환
    const fallback: QuestionMapping = {};
    for (const q of questions) {
      fallback[q.id] = {
        matchedOption: 'unknown',
        confidence: 'low',
        evidence: 'LLM 매핑 실패',
      };
    }
    return fallback;
  }
}

/**
 * 제품 컨텍스트 문자열 생성
 */
function buildProductContext(
  product: {
    name: string;
    brand: string | null;
    price: number | null;
    specs: Record<string, string>;
    specSummary: string;
  },
  webEnriched: WebEnrichedData | null
): string {
  const lines: string[] = [];

  lines.push(`- 제품명: ${product.name}`);
  if (product.brand) lines.push(`- 브랜드: ${product.brand}`);
  if (product.price) lines.push(`- 가격: ${product.price.toLocaleString()}원`);

  // 파싱된 스펙
  if (Object.keys(product.specs).length > 0) {
    lines.push('\n**스펙:**');
    for (const [key, value] of Object.entries(product.specs)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  // 원본 스펙 요약
  if (product.specSummary) {
    lines.push(`\n**스펙 요약:** ${product.specSummary}`);
  }

  // 웹검색 정보
  if (webEnriched) {
    if (webEnriched.keyFeatures.length > 0) {
      lines.push(`\n**핵심 특징:** ${webEnriched.keyFeatures.join(', ')}`);
    }
    if (webEnriched.pros.length > 0) {
      lines.push(`**장점:** ${webEnriched.pros.join(', ')}`);
    }
    if (webEnriched.targetUsers.length > 0) {
      lines.push(`**추천 대상:** ${webEnriched.targetUsers.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// 스펙 파싱 유틸리티
// ============================================================================

/**
 * spec_summary 문자열을 Record<string, string>으로 파싱
 */
export function parseSpecSummary(specSummary: string): Record<string, string> {
  const specs: Record<string, string> = {};

  if (!specSummary) return specs;

  // 공통 패턴들
  const patterns = [
    // "용량: 1L" 형식
    /([가-힣a-zA-Z]+)\s*[:：]\s*([^,\n]+)/g,
    // "용량 1L" 형식 (콜론 없음)
    /([가-힣]+)\s+(\d+(?:\.\d+)?(?:L|ml|W|kg|g|cm|mm|인치)?)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(specSummary)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim();
      if (key && value && !specs[key]) {
        specs[key] = value;
      }
    }
  }

  // 파싱 실패 시 원본 저장
  if (Object.keys(specs).length === 0 && specSummary.trim()) {
    specs['원본'] = specSummary.trim();
  }

  return specs;
}

/**
 * 스펙에서 핵심 하이라이트 추출
 */
export function extractSpecHighlights(
  specs: Record<string, string>,
  maxCount: number = 5
): string[] {
  const highlights: string[] = [];
  const priorityKeys = ['용량', '소비전력', '크기', '무게', '재질', '기능', '모터'];

  // 우선순위 키 먼저
  for (const key of priorityKeys) {
    if (specs[key] && highlights.length < maxCount) {
      highlights.push(`${key}: ${specs[key]}`);
    }
  }

  // 나머지
  for (const [key, value] of Object.entries(specs)) {
    if (!priorityKeys.includes(key) && highlights.length < maxCount) {
      highlights.push(`${key}: ${value}`);
    }
  }

  return highlights;
}
