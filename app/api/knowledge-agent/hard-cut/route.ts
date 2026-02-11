/**
 * Knowledge Agent - Hard Cut API v2 (Hybrid)
 *
 * 하이브리드 스펙 매칭 기반 하드컷팅
 * - 1단계: 규칙 기반 필터링 (명확한 조건)
 * - 2단계: LLM으로 애매한 조건 해석
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
  source: 'rule' | 'llm';  // 조건 출처
}

// ============================================================================
// 규칙 기반 필터 조건 추출 (1단계)
// ============================================================================

/**
 * 명확한 패턴을 규칙 기반으로 추출
 * - 숫자 + 단위 (용량, 무게, 크기 등)
 * - 키워드 매칭 (무선/유선, 형태 등)
 * - "상관없어요" 답변은 건너뜀
 */
function extractRuleBasedConditions(
  collectedInfo: Record<string, string>
): { conditions: FilterCondition[]; processedKeys: string[] } {
  const conditions: FilterCondition[] = [];
  const processedKeys: string[] = [];

  // 건너뛸 답변 패턴
  const SKIP_PATTERNS = ['skip', '상관없', '건너뛰기', '모르겠', '아무거나'];

  for (const [questionId, answer] of Object.entries(collectedInfo)) {
    // "상관없어요" 등 건너뛰기 답변은 제외
    if (SKIP_PATTERNS.some(p => answer.toLowerCase().includes(p))) {
      processedKeys.push(questionId);
      console.log(`[RuleFilter] Skipping "${questionId}": "${answer}" (skip pattern)`);
      continue;
    }

    // 1. 숫자 + 단위 패턴 추출 (예: "3L 이상", "5kg 미만", "10~20만원")
    const numericPatterns = [
      // "3L 이상", "5kg 이상"
      { regex: /(\d+(?:\.\d+)?)\s*(L|ml|kg|g|W|인치|mm|cm|만원|원)\s*(이상|이하|미만|초과)?/i, type: 'range' },
      // "10~20만원", "5-10L"
      { regex: /(\d+(?:\.\d+)?)\s*[~\-]\s*(\d+(?:\.\d+)?)\s*(L|ml|kg|g|W|인치|mm|cm|만원|원)?/i, type: 'between' },
    ];

    for (const pattern of numericPatterns) {
      const match = answer.match(pattern.regex);
      if (match) {
        const unit = match[2] || match[3] || '';
        let specKey = '';
        let matchValue: string | { min?: number; max?: number } = '';

        // 단위에 따른 스펙 키 매핑
        if (['L', 'ml', '리터'].includes(unit)) specKey = '용량';
        else if (['kg', 'g'].includes(unit)) specKey = '무게';
        else if (['W', '와트'].includes(unit)) specKey = '소비전력';
        else if (['인치'].includes(unit)) specKey = '화면크기';
        else if (['mm', 'cm'].includes(unit)) specKey = '크기';
        else if (['만원', '원'].includes(unit)) specKey = '가격';

        if (specKey) {
          if (pattern.type === 'between' && match[2]) {
            matchValue = { min: parseFloat(match[1]), max: parseFloat(match[2]) };
          } else if (match[3] === '이상' || match[3] === '초과') {
            matchValue = { min: parseFloat(match[1]) };
          } else if (match[3] === '이하' || match[3] === '미만') {
            matchValue = { max: parseFloat(match[1]) };
          } else {
            matchValue = match[1] + unit;
          }

          conditions.push({
            specKey,
            matchType: typeof matchValue === 'object' ? 'range' : 'contains',
            matchValue,
            weight: 0.8,
            mandatory: false,
            reason: `${specKey} ${answer} 조건 반영`,
            source: 'rule',
          });
          processedKeys.push(questionId);
          console.log(`[RuleFilter] Extracted: ${specKey} = ${JSON.stringify(matchValue)} from "${answer}"`);
          break;
        }
      }
    }

    // 2. 키워드 매칭 (무선/유선, 형태 등)
    const keywordMappings: Array<{ keywords: string[]; specKey: string; matchValue: string }> = [
      { keywords: ['무선', '코드리스', '배터리'], specKey: '연결방식', matchValue: '무선' },
      { keywords: ['유선', '코드'], specKey: '연결방식', matchValue: '유선' },
      { keywords: ['디지털', '전자식'], specKey: '타입', matchValue: '디지털' },
      { keywords: ['아날로그', '기계식'], specKey: '타입', matchValue: '아날로그' },
      { keywords: ['스테인리스', '스텐'], specKey: '재질', matchValue: '스테인리스' },
      { keywords: ['플라스틱', 'PP', 'ABS'], specKey: '재질', matchValue: '플라스틱' },
      { keywords: ['가열식', '스팀'], specKey: '방식', matchValue: '가열식' },
      { keywords: ['초음파'], specKey: '방식', matchValue: '초음파' },
      { keywords: ['자연기화'], specKey: '방식', matchValue: '자연기화' },
    ];

    if (!processedKeys.includes(questionId)) {
      for (const mapping of keywordMappings) {
        if (mapping.keywords.some(kw => answer.includes(kw))) {
          conditions.push({
            specKey: mapping.specKey,
            matchType: 'contains',
            matchValue: mapping.matchValue,
            weight: 0.9,
            mandatory: true,
            reason: `${mapping.matchValue} ${mapping.specKey} 선호 반영`,
            source: 'rule',
          });
          processedKeys.push(questionId);
          console.log(`[RuleFilter] Keyword match: ${mapping.specKey} = "${mapping.matchValue}" from "${answer}"`);
          break;
        }
      }
    }
  }

  return { conditions, processedKeys };
}

// ============================================================================
// 조건 reason 자연스럽게 정제 (flash-lite 사용)
// ============================================================================

/**
 * 규칙 기반 조건들의 reason을 자연스러운 문장으로 정제
 * - "용량 3L 이상 조건 반영" → "넉넉한 3L 용량 선호"
 * - "무선 연결방식 선호 반영" → "자유로운 무선 사용"
 */
async function refineConditionReasons(
  categoryName: string,
  conditions: FilterCondition[]
): Promise<FilterCondition[]> {
  // 정제할 조건이 없으면 스킵
  const ruleConditions = conditions.filter(c => c.source === 'rule');
  if (ruleConditions.length === 0) {
    return conditions;
  }

  if (!ai) {
    console.log('[RefineReasons] No AI available, keeping original reasons');
    return conditions;
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 400,
    },
  });

  const reasonsToRefine = ruleConditions.map((c, i) => `${i}: ${c.reason}`).join('\n');

  const prompt = `## 역할
${categoryName} 상품 필터링 조건의 설명을 자연스러운 선호도 문장으로 다듬어주세요.

## 원본 조건 설명
${reasonsToRefine}

## 변환 규칙
1. 딱딱한 조건 설명을 부드러운 선호도 표현으로 변환
2. 4~10자 내외의 간결한 태그 형태로 작성
3. "~ 선호", "~ 중시", "~ 스타일" 등 사용자 관점 표현 사용
4. 구체적인 스펙 정보는 유지하되 자연스럽게 표현

## 예시
- "용량 3L 이상 조건 반영" → "넉넉한 3L+ 용량"
- "무선 연결방식 선호 반영" → "무선 사용 선호"
- "가격 10~20만원 조건 반영" → "10~20만원대 예산"
- "스테인리스 재질 선호 반영" → "스테인리스 소재"
- "소비전력 1000W 이상 조건 반영" → "강력한 1000W+"

## 응답 형식 (JSON만)
{"0":"변환된문장","1":"변환된문장",...}

⚠️ JSON만 응답. 원본 인덱스를 키로 사용.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const refinedMap = JSON.parse(jsonMatch[0]) as Record<string, string>;
      
      // 정제된 reason으로 업데이트
      let ruleIndex = 0;
      return conditions.map(c => {
        if (c.source === 'rule') {
          const refined = refinedMap[String(ruleIndex)];
          ruleIndex++;
          if (refined) {
            return { ...c, reason: refined };
          }
        }
        return c;
      });
    }
  } catch (error) {
    console.error('[RefineReasons] Refinement failed:', error);
  }

  return conditions;
}

// ============================================================================
// LLM 기반 필터 조건 추출 (2단계 - 애매한 조건만)
// ============================================================================

/**
 * 규칙으로 처리되지 않은 답변에서 필터 조건 추출 (LLM)
 */
async function extractLLMConditions(
  categoryName: string,
  remainingInfo: Record<string, string>,
  availableSpecs: string[]
): Promise<FilterCondition[]> {
  // 처리할 답변이 없으면 스킵
  if (Object.keys(remainingInfo).length === 0) {
    console.log('[LLMFilter] No remaining info to process');
    return [];
  }

  if (!ai) {
    console.log('[LLMFilter] No AI available, using fallback');
    return [];
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 800,
    },
  });

  const prompt = `## 역할
사용자의 ${categoryName} 구매 조건을 분석하여 스펙 필터링 조건을 추출하세요.

## 사용자 답변 (아직 처리되지 않은 것들)
${Object.entries(remainingInfo).map(([q, a]) => `- ${q}: ${a}`).join('\n')}

## 상품에서 발견된 스펙 키워드
${availableSpecs.slice(0, 25).join(', ')}

## 추출 규칙
1. 사용자 답변에서 스펙 관련 조건만 추출
2. "상관없어요", "건너뛰기" 등은 빈 배열 반환
3. 각 조건의 중요도(weight)를 0.3~1.0 사이로 설정
4. mandatory=true: 명시적으로 요청한 핵심 조건
5. mandatory=false: 있으면 좋지만 필수는 아닌 조건
6. reason(설명) 작성 시 주의사항:
   - "사용자가 ~을 언급했습니다" 같이 메타적으로 설명하지 마세요.
   - "실리콘 소재 선호 반영", "6개월 아기용 조건 적용" 처럼 구체적인 선택 내용과 결과를 자연스럽게 기술하세요.
   - "~ 조건 반영", "~ 선호 적용" 등의 문구로 끝내세요.

## 응답 형식 (JSON 배열만)
[{"specKey":"키워드","matchType":"contains","matchValue":"값","weight":0.7,"mandatory":false,"reason":"실리콘 소재 선호 반영"}]

⚠️ JSON 배열만 응답. 조건 없으면 빈 배열 []`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<Omit<FilterCondition, 'source'>>;
      // source: 'llm' 추가
      return parsed.map(c => ({ ...c, source: 'llm' as const }));
    }
  } catch (error) {
    console.error('[LLMFilter] Extraction failed:', error);
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
 * 상품 스펙 매칭 점수 계산 (OR 기반 + mandatory 페널티)
 * - 조건 충족 개수에 비례한 점수
 * - 리뷰/평점 기반 기본 점수
 * - mandatory 미충족 시 큰 감점 (순위 하락)
 * - 절대 제외하지 않음 (최소 30개 보장을 위해)
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
  let mandatoryPenalty = 0;

  for (const condition of conditions) {
    const matchScore = calculateConditionMatch(product.specSummary || '', condition);
    totalWeight += condition.weight;

    if (matchScore > 0) {
      matchedConditions.push(condition.reason);
      matchCount++;
      weightedMatchSum += condition.weight;
    } else if (condition.mandatory) {
      // mandatory 조건 미충족 시 페널티 (-30점 * weight)
      mandatoryPenalty += 30 * condition.weight;
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

  // 최종 점수 (mandatory 페널티 적용, 최소 0점)
  const finalScore = Math.max(0, Math.round(baseScore + conditionScore + matchCountBonus - mandatoryPenalty));

  return {
    score: finalScore,
    matchedConditions,
  };
}

// ============================================================================
// LLM 카테고리 필터 (다른 카테고리 제품 제거)
// - 소풍가방, 포대기 등 해당 카테고리가 아닌 제품을 빠르게 걸러냄
// ============================================================================
async function filterByCategoryLLM(
  categoryName: string,
  products: HardCutProduct[]
): Promise<HardCutProduct[]> {
  if (!ai || products.length === 0) return products;

  const startTime = Date.now();
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 800,
      responseMimeType: 'application/json',
    },
  });

  // 배치 처리 (20개씩)
  const BATCH_SIZE = 20;
  const batches: HardCutProduct[][] = [];
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    batches.push(products.slice(i, i + BATCH_SIZE));
  }

  const validPcodes = new Set<string>();

  await Promise.all(batches.map(async (batch, idx) => {
    const productList = batch.map((p, i) =>
      `${i + 1}. [${p.pcode}] ${p.brand || ''} ${p.name}`
    ).join('\n');

    const prompt = `## "${categoryName}" 카테고리 제품 분류

제품 목록:
${productList}

## 판단 기준
- **Y**: "${categoryName}" 카테고리에 해당하는 제품 (본품)
- **N**: 다른 카테고리 제품 (포대기, 가방, 수면벨트, 보호대, 방한용품 등) 또는 액세서리/소모품 (커버, 부품, 리필 등)

핵심: "${categoryName}"으로 검색했을 때 나올 법한 본품만 Y.

## 응답 (JSON만)
{"results":[{"pcode":"코드","y":true/false}]}

⚠️ 애매하면 N으로 판단`;

    try {
      const result = await model.generateContent(prompt);
      let text = result.response.text().trim();
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { results: Array<{ pcode: string; y: boolean }> };
        if (parsed.results && Array.isArray(parsed.results)) {
          for (const r of parsed.results) {
            if (r.y === true) validPcodes.add(String(r.pcode).trim());
          }
        }
      }
    } catch (error) {
      console.error(`[HardCut CategoryFilter] Batch ${idx + 1} error:`, error);
      // 실패 시 해당 배치 제외 (안전하게)
    }
  }));

  const filtered = products.filter(p => validPcodes.has(p.pcode));
  const removedCount = products.length - filtered.length;
  console.log(`[HardCut CategoryFilter] ✅ ${removedCount}개 제외 (${products.length} → ${filtered.length}) in ${Date.now() - startTime}ms`);

  return filtered;
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

    console.log(`\n🔪 [HardCut v2 Hybrid] Starting: ${products.length}개 → ${targetCount}개`);
    const startTime = Date.now();

    // 1. 상품에서 사용 가능한 스펙 키워드 추출
    const availableSpecs = extractAvailableSpecs(products);
    console.log(`   Found ${availableSpecs.length} spec keywords`);

    // 2. 하이브리드 필터 조건 추출
    // 2-1. 규칙 기반 필터링 (명확한 조건: 숫자+단위, 키워드)
    const { conditions: ruleConditions, processedKeys } = extractRuleBasedConditions(collectedInfo);
    console.log(`   [Rule] ${ruleConditions.length} conditions from ${processedKeys.length} answers`);

    // 2-2. 규칙으로 처리 안된 답변만 LLM에 전달
    const remainingInfo: Record<string, string> = {};
    for (const [key, value] of Object.entries(collectedInfo)) {
      if (!processedKeys.includes(key)) {
        remainingInfo[key] = value;
      }
    }

    const llmConditions = await extractLLMConditions(categoryName, remainingInfo, availableSpecs);
    console.log(`   [LLM] ${llmConditions.length} conditions from ${Object.keys(remainingInfo).length} remaining answers`);

    // 2-3. 조건 통합
    const rawConditions: FilterCondition[] = [...ruleConditions, ...llmConditions];
    
    // 2-4. 규칙 기반 조건들의 reason을 자연스럽게 정제 (flash-lite)
    const conditions = await refineConditionReasons(categoryName, rawConditions);
    console.log(`   [Refine] Refined ${ruleConditions.length} rule-based reasons`);
    
    const mandatoryConditions = conditions.filter((c: FilterCondition) => c.mandatory);
    console.log(`   [Total] ${conditions.length} conditions (${mandatoryConditions.length} mandatory)`);
    if (mandatoryConditions.length > 0) {
      console.log(`   Mandatory: ${mandatoryConditions.map((c: FilterCondition) => c.reason).join(', ')}`);
    }

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
    const appliedRules: HardCutResult['appliedRules'] = conditions.map((condition: FilterCondition) => {
      const matched = scoredProducts.filter(p =>
        p.matchedConditions.includes(condition.reason)
      ).length;
      return {
        rule: condition.reason,
        matchedCount: matched,
        filteredCount: products.length - matched,
      };
    });

    // 4. 카테고리 필터링 + 점수순 정렬 후 상위 N개 선별
    scoredProducts.sort((a, b) => b.matchScore - a.matchScore);

    // 4-1. LLM 카테고리 필터 (다른 카테고리 제품 제거)
    const categoryFiltered = await filterByCategoryLLM(categoryName, scoredProducts);
    // 필터 후 너무 적으면 원본 사용
    const effectiveProducts = categoryFiltered.length >= targetCount ? categoryFiltered : scoredProducts;
    const filteredProducts = effectiveProducts.slice(0, targetCount);

    // 점수 분포 로그
    const lowScoreCount = scoredProducts.filter(p => p.matchScore < 30).length;
    console.log(`   Score distribution: Top3=${filteredProducts.slice(0, 3).map(p => p.matchScore).join(',')} | LowScore(<30)=${lowScoreCount}개`);

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
