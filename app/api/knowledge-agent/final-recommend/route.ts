/**
 * Knowledge Agent - Final Recommend API (새 아키텍처)
 *
 * 120개 전체 후보에서 LLM으로 Top 3 직접 선정
 * - hard-cut 제거: LLM이 전체 후보에서 직접 선택
 * - 스펙 + 리뷰 + 사용자 선택 기반 평가
 * - 스펙 정규화 (비교표용)
 * - 장단점 리스트 생성 (Flash Lite)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import type {
  HardCutProduct,
  BalanceSelection,
  FinalRecommendation,
  FinalRecommendationRequest,
  ReviewLite,
  FilterTag,
} from '@/lib/knowledge-agent/types';

export const maxDuration = 60;

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Supabase 클라이언트
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 모델 상수
const FINAL_RECOMMEND_MODEL = 'gemini-3-flash-preview'; // 최종 추천용 (가장 똑똑한 모델)
const SPEC_NORMALIZE_MODEL = 'gemini-2.5-flash-lite'; // 스펙 정규화용
const PROS_CONS_MODEL = 'gemini-2.5-flash-lite'; // 장단점 생성용
const KEYWORD_EXPAND_MODEL = 'gemini-2.5-flash-lite'; // 키워드 확장용
const FILTER_TAG_MODEL = 'gemini-2.5-flash-lite'; // 필터 태그 생성용

// 추천 개수 상수
const RECOMMENDATION_COUNT = 5; // 추천 상품 개수 (기존 3 → 5)

// ============================================================================
// 선호 키워드 확장 (flash-lite) - prescreenCandidates에서 리뷰 검색용
// ============================================================================

interface ExpandedKeywords {
  preferKeywords: string[];
  avoidKeywords: string[];
}

/**
 * collectedInfo와 negativeSelections에서 리뷰 검색용 키워드 추출 + 동의어 확장
 * - "조용한 거 원해요" → ["조용", "소음", "정숙", "저소음", "시끄럽"]
 * - "세척 쉬운 거" → ["세척", "청소", "분해", "씻", "닦"]
 */
async function extractExpandedKeywords(
  categoryName: string,
  collectedInfo: Record<string, string>,
  negativeSelections: string[]
): Promise<ExpandedKeywords> {
  // 기본 키워드 (LLM 실패 시 fallback)
  const fallback: ExpandedKeywords = {
    preferKeywords: [],
    avoidKeywords: [],
  };

  // collectedInfo가 없으면 빈 결과 반환
  const infoEntries = Object.entries(collectedInfo).filter(
    ([key]) => !key.startsWith('__') // 내부 키 제외
  );
  if (infoEntries.length === 0 && negativeSelections.length === 0) {
    return fallback;
  }

  if (!ai) {
    console.log('[KeywordExpand] No AI available, using fallback');
    return fallback;
  }

  const model = ai.getGenerativeModel({
    model: KEYWORD_EXPAND_MODEL,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 600,
    },
  });

  const userConditions = infoEntries
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n') || '(없음)';

  const prompt = `## ${categoryName} 구매 조건에서 리뷰 검색용 키워드 추출

## 사용자 선호 조건
${userConditions}

## 피하고 싶은 단점
${negativeSelections.join(', ') || '없음'}

## 작업
1. 선호 조건에서 리뷰 검색용 핵심 키워드 추출 (동의어/유사어 포함)
2. 피할 단점에서 리뷰 검색용 핵심 키워드 추출 (동의어/유사어 포함)
3. 각 키워드는 2-4글자의 한글 단어로 (조사 제외)

## 예시
- "조용한 거 원해요" → ["조용", "소음", "정숙", "저소음", "시끄럽"]
- "세척 쉬운 거" → ["세척", "청소", "분해", "씻"]
- "무거워요" (피할 단점) → ["무거", "무게", "휴대"]
- "6개월 아기" → ["개월", "신생아", "아기"]

## 응답 (JSON만, 설명 없이)
{"preferKeywords":["키워드1","키워드2"],"avoidKeywords":["키워드1","키워드2"]}`;

  try {
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const elapsed = Date.now() - startTime;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ExpandedKeywords;
      console.log(`[KeywordExpand] Extracted ${parsed.preferKeywords?.length || 0} prefer, ${parsed.avoidKeywords?.length || 0} avoid keywords (${elapsed}ms)`);
      return {
        preferKeywords: parsed.preferKeywords || [],
        avoidKeywords: parsed.avoidKeywords || [],
      };
    }
  } catch (error) {
    console.error('[KeywordExpand] Failed:', error);
  }

  return fallback;
}

// ============================================================================
// JSON Repair - Flash Lite로 형식만 수정 (원본 내용 유지)
// ============================================================================

/**
 * 간단한 JSON 정리 함수
 * - 제어 문자 제거
 * - 따옴표 정리
 * - 줄바꿈 정리
 */
function repairJSON(brokenJSON: string): string {
  return brokenJSON
    // 제어 문자 제거 (탭, 줄바꿈 제외)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    // 문자열 내부 줄바꿈을 공백으로
    .replace(/(?<!\\)\\n/g, ' ')
    // 연속 공백을 하나로
    .replace(/\s+/g, ' ')
    // JSON 객체/배열 앞뒤 정리
    .trim();
}

/**
 * Flash Lite를 사용하여 잘못된 JSON 형식을 수정
 * 원본 내용은 그대로 유지하고 형식만 올바르게 변환
 */
async function repairJSONWithFlashLite(brokenJSON: string): Promise<any | null> {
  if (!ai) return null;

  const model = ai.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 2000,
    }
  });

  const prompt = `아래 JSON은 형식 오류가 있습니다. 원본 내용(pcode, reason, highlights 등)을 절대 변경하지 말고, 형식만 수정하여 유효한 JSON으로 만들어주세요.

잘못된 JSON:
${brokenJSON.slice(0, 4000)}

규칙:
1. 내용(텍스트, 숫자, pcode 등)은 절대 변경 금지
2. 잘린 부분은 적절히 닫아서 유효한 JSON으로
3. 불완전한 마지막 객체는 제거 가능
4. JSON만 출력 (설명 없이)

수정된 JSON:`;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[repairJSONWithFlashLite] Failed:', e);
  }
  return null;
}

// ============================================================================
// 자유 입력 분석 - 선호 속성 / 피할 단점 분류
// ============================================================================

interface FreeInputAnalysis {
  preferredAttributes: string[];  // 선호하는 속성
  avoidAttributes: string[];      // 피하고 싶은 단점
  usageContext: string | null;    // 사용 맥락 (예: 여행용, 신생아용)
  summary: string;                // 한 줄 요약
}

/**
 * 자유 입력을 분석하여 선호 속성과 피할 단점으로 분류
 * - flash-lite로 빠르게 분석
 * - 사용자의 숨은 니즈를 파악
 */
async function analyzeFreeInput(
  categoryName: string,
  freeInput: string
): Promise<FreeInputAnalysis> {
  const defaultResult: FreeInputAnalysis = {
    preferredAttributes: [],
    avoidAttributes: [],
    usageContext: null,
    summary: freeInput,
  };

  if (!freeInput || freeInput.trim().length < 2) {
    return defaultResult;
  }

  if (!ai) {
    console.log('[analyzeFreeInput] No AI available');
    return defaultResult;
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 500,
    },
  });

  const prompt = `## 역할
사용자가 ${categoryName} 구매 시 추가로 입력한 자유 조건을 분석합니다.

## 사용자 입력
"${freeInput}"

## 분석 규칙
1. **preferredAttributes**: 사용자가 원하는/선호하는 속성 추출
   - 예: "가벼운 게 좋겠어요" → ["경량"]
   - 예: "세척이 편했으면" → ["세척 용이"]
   - 예: "디자인 예쁜 거" → ["디자인 우수"]

2. **avoidAttributes**: 피하고 싶은 단점/특성 추출
   - 예: "소음 심한 건 싫어요" → ["소음"]
   - 예: "무겁지 않았으면" → ["무거움"]
   - 예: "복잡한 건 NO" → ["조작 복잡"]

3. **usageContext**: 특정 사용 맥락이 있다면 추출
   - 예: "여행갈 때 쓸 거예요" → "여행용"
   - 예: "신생아용으로" → "신생아용"
   - 예: "사무실에서" → "사무실용"

4. **summary**: 입력 내용을 자연스러운 한 문장으로 정리

## 응답 형식 (JSON만)
{"preferredAttributes":["속성1","속성2"],"avoidAttributes":["단점1"],"usageContext":"맥락"|null,"summary":"요약문장"}

⚠️ JSON만 응답. 빈 배열도 OK.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as FreeInputAnalysis;
      console.log(`[analyzeFreeInput] Analyzed: preferred=${parsed.preferredAttributes.length}, avoid=${parsed.avoidAttributes.length}, context=${parsed.usageContext}`);
      return {
        preferredAttributes: parsed.preferredAttributes || [],
        avoidAttributes: parsed.avoidAttributes || [],
        usageContext: parsed.usageContext || null,
        summary: parsed.summary || freeInput,
      };
    }
  } catch (error) {
    console.error('[analyzeFreeInput] Analysis failed:', error);
  }

  return defaultResult;
}

// ============================================================================
// 필터 태그 생성 (Flash Lite) - 사용자 응답 기반 태그 생성
// ============================================================================

/**
 * 사용자 응답(collectedInfo)을 필터 태그로 1:1 변환
 * - 각 조건을 개별 태그로 생성 (누락 없음)
 * - LLM은 label(키워드 요약) + keywords(동의어)만 생성
 * - originalCondition에 원본 보존 (평가 정확도 향상)
 */
async function generateFilterTags(
  categoryName: string,
  collectedInfo: Record<string, string>,
  _balanceSelections: BalanceSelection[],  // 현재 미사용 (밸런스 게임 제거됨)
  _negativeSelections: string[],           // PLP 필터 태그에서 제외
  _freeInputAnalysis?: FreeInputAnalysis | null  // TODO: 자유 입력도 태그화 필요시 활용
): Promise<FilterTag[]> {
  // 무의미한 답변 필터링 (입력 단계 - 완전히 의미 없는 응답만)
  const skipAnswers = ['상관없어요', 'skip', 'any', '', '기타', '없음', '모름', '잘 모르겠어요'];

  // 🆕 무의미한 태그 label 필터링 (출력 단계 - LLM이 그대로 출력한 무의미한 태그)
  const meaninglessLabels = [
    // 단순 긍정/부정 (질문 맥락 없이는 의미 없음)
    '네', '예', '응', '그래요', '맞아요', '좋아요', '괜찮아요',
    '아니요', '아니오', '아뇨', '별로요',
    '중요해요', '필요해요', '원해요', '있으면 좋겠어요',
    '매우 중요', '매우 중요해요', '중요함', '보통', '상관없음',
    '중요', '필요', '원함', '선호', '좋음',
    // 영문
    'yes', 'no', 'ok', 'okay', 'important',
  ];

  // 1. collectedInfo 필터링 (내부 키, 무의미한 응답 제외)
  const filteredEntries = Object.entries(collectedInfo).filter(([question, answer]) => {
    if (question.startsWith('__')) return false;
    if (skipAnswers.includes(answer.trim())) return false;
    return true;
  });

  // 2. 쉼표 답변 분리 (모든 질문에 적용)
  // - 상호배타적 질문(재질, 브랜드): 분리 + 후처리에서 full 1개만 허용
  // - 복수 선택 질문(기능, 특징): 분리 + full 여러 개 허용
  const validEntries: [string, string][] = [];
  for (const [question, answer] of filteredEntries) {
    // 쉼표로 분리 (쉼표, 슬래시 등)
    const parts = answer
      .split(/[,、\/]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !skipAnswers.includes(s));

    if (parts.length > 1) {
      // 분리된 각 항목을 별도 entry로 추가
      console.log(`[FilterTags] 🔀 "${question}" 답변 분리: "${answer}" → ${parts.length}개`);
      for (const part of parts) {
        validEntries.push([question, part]);
      }
    } else {
      validEntries.push([question, answer]);
    }
  }

  if (validEntries.length === 0) {
    console.warn('[FilterTags] ⚠️ No valid conditions to generate tags!');
    console.warn(`[FilterTags] 원본 collectedInfo: ${JSON.stringify(collectedInfo).slice(0, 500)}`);
    console.warn(`[FilterTags] 필터링 후 남은 항목: 0개 (모두 skipAnswers에 해당)`);
    return [];
  }

  // 🆕 무의미한 태그인지 체크하는 헬퍼 함수
  const isMeaninglessTag = (label: string): boolean => {
    const labelLower = label.toLowerCase().trim();
    return meaninglessLabels.some(m =>
      labelLower === m.toLowerCase() || labelLower === m.toLowerCase() + '요'
    );
  };

  // 2. LLM 없으면 fallback (쉼표 분리 없이 원본 그대로) - 무의미한 응답은 제외
  if (!ai) {
    console.log('[FilterTags] No AI available, using answer as label');
    const fallbackTags = validEntries
      .filter(([, answer]) => !isMeaninglessTag(answer))
      .map(([question, answer], i) => ({
        id: `tag_${i + 1}`,
        label: answer.slice(0, 50),
        category: 'feature' as const,
        keywords: [],
        priority: i + 1,
        sourceType: 'collected' as const,
        sourceQuestion: question,
        sourceAnswer: answer,
        originalCondition: `${question}: ${answer}`,
      }));
    console.log(`[FilterTags] Fallback: ${fallbackTags.length} tags (${validEntries.length - fallbackTags.length} filtered as meaningless)`);
    return fallbackTags;
  }

  const model = ai.getGenerativeModel({
    model: FILTER_TAG_MODEL,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2000,
      responseMimeType: 'application/json',
    },
  });

  // 조건 목록 (인덱스 포함) - 이미 분리된 validEntries 사용
  const conditionList = validEntries
    .map(([question, answer], i) => `${i}: "${question}" → "${answer}"`)
    .join('\n');

  const prompt = `## 역할
${categoryName} 구매 조건들을 **짧은 키워드 태그**로 요약합니다.
각 조건당 1개의 태그를 생성하세요. (이미 분리된 상태)

## 조건 목록 (인덱스: 질문 → 답변)
${conditionList}

## 핵심 규칙
1. **질문+답변 맥락을 파악**해서 의미 있는 태그 생성
   - "소음이 중요한가요?" → "매우 중요" = **"저소음 중시"** (O)
   - "소음이 중요한가요?" → "매우 중요" = "매우 중요" (X, 무의미)
   - "선호 브랜드?" → "삼성" = **"삼성"** (O, 브랜드명 그대로)
   - "재질?" → "실리콘" = **"실리콘 재질"** (O)
   - "용량?" → "3L 이상" = **"대용량 3L+"** (O)

2. label: 2~5단어, **최대 15자** 키워드 형태
   - 브랜드명,  재질/소재는 그대로 사용 (예: "삼성", "LG", "더블하트", "실리콘", "스테인리스")

3. keywords: 리뷰/스펙 검색용 동의어 2~4개
4. category: usage(용도), spec(스펙), feature(기능)
5. sourceIndex: 원본 조건의 인덱스 (각 조건당 1개)

## 응답 (JSON만)
{"results":[{"sourceIndex":0,"label":"저소음","keywords":["소음","조용","정숙"],"category":"feature"}]}`;

  try {
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.results && Array.isArray(parsed.results)) {
        // LLM 응답에서 직접 FilterTag[] 생성
        const rawTags: FilterTag[] = parsed.results.map((item: { sourceIndex?: number; label?: string; keywords?: string[]; category?: string }, i: number) => {
          const sourceIdx = item.sourceIndex ?? i;
          const [question, answer] = validEntries[sourceIdx] || ['', ''];
          return {
            id: `tag_${i + 1}`,
            label: item.label || answer.slice(0, 50),
            category: (item.category || 'feature') as FilterTag['category'],
            keywords: item.keywords || [],
            priority: i + 1,
            sourceType: 'collected' as const,
            sourceQuestion: question,  // 상호 배타성 체크용
            sourceAnswer: answer,
            originalCondition: `${question}: ${answer}`,
          };
        });

        // 🆕 무의미한 태그 필터링 (LLM이 단순 응답을 그대로 출력한 경우)
        const tags = rawTags.filter(tag => {
          if (isMeaninglessTag(tag.label)) {
            console.log(`[FilterTags] ⚠️ 무의미한 태그 제외: "${tag.label}" (원본: ${tag.originalCondition})`);
            return false;
          }
          return true;
        });

        // ID 재부여 (필터링 후)
        tags.forEach((tag, i) => {
          tag.id = `tag_${i + 1}`;
          tag.priority = i + 1;
        });

        console.log(`[FilterTags] Generated ${tags.length} tags (${rawTags.length - tags.length} filtered) from ${validEntries.length} conditions in ${Date.now() - startTime}ms`);
        return tags;
      }
    }
  } catch (error) {
    console.error('[FilterTags] ❌ LLM error, using fallback labels:', error);
    console.error(`[FilterTags] 입력 조건 수: ${validEntries.length}, 카테고리: ${categoryName}`);
  }

  // Fallback: 원본 그대로 - 무의미한 응답은 제외
  const fallbackTags = validEntries
    .filter(([, answer]) => !isMeaninglessTag(answer))
    .map(([question, answer], i) => ({
      id: `tag_${i + 1}`,
      label: answer.slice(0, 50),
      category: 'feature' as const,
      keywords: [],
      priority: i + 1,
      sourceType: 'collected' as const,
      sourceQuestion: question,
      sourceAnswer: answer,
      originalCondition: `${question}: ${answer}`,
    }));
  console.log(`[FilterTags] LLM fallback: ${fallbackTags.length} tags (${validEntries.length - fallbackTags.length} filtered as meaningless)`);
  return fallbackTags;
}

// ============================================================================
// 🆕 태그 충족도 평가 (LLM 기반)
// ============================================================================

import type { ProductTagScores, TagScore } from '@/lib/knowledge-agent/types';

/**
 * 리뷰에서 골고루 샘플링 (별점 높음/낮음/최신 순)
 */
function sampleReviewsForEvaluation(reviews: ReviewLite[], maxCount: number = 20): ReviewLite[] {
  if (reviews.length <= maxCount) return reviews;

  const sorted = [...reviews];
  
  // 별점 높은 순 상위 7개
  const highRated = [...sorted].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 7);
  
  // 별점 낮은 순 상위 7개
  const lowRated = [...sorted].sort((a, b) => (a.rating || 0) - (b.rating || 0)).slice(0, 7);
  
  // 최신순 6개 (날짜 없으면 마지막 6개)
  const recent = sorted.slice(-6);
  
  // 중복 제거하며 병합
  const seen = new Set<string>();
  const result: ReviewLite[] = [];
  
  for (const review of [...highRated, ...lowRated, ...recent]) {
    if (!seen.has(review.reviewId) && result.length < maxCount) {
      seen.add(review.reviewId);
      result.push(review);
    }
  }
  
  return result;
}

/**
 * 제품별 태그 충족도를 LLM으로 평가 (product-analysis 스타일)
 * - 스펙 + 리뷰 기반 상세 평가
 * - full/partial/null 3단계 + evidence 문장
 * - PDP에서 재사용 가능한 상세 근거 포함
 */
async function evaluateTagScoresForProducts(
  products: Array<{ pcode: string; product: HardCutProduct }>,
  tags: FilterTag[],
  reviews: Record<string, ReviewLite[]>,
  categoryName: string
): Promise<Record<string, ProductTagScores>> {
  if (!ai || tags.length === 0 || products.length === 0) {
    return {};
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 6000, // 5개 상품용 상향 (4000 → 6000)
      responseMimeType: 'application/json',
    },
  });

  // 각 제품에 대한 평가 데이터 구성
  const productInfos = products.map(({ pcode, product }) => {
    const productReviews = reviews[pcode] || [];
    const sampledReviews = sampleReviewsForEvaluation(productReviews, 15);

    // 리뷰 상세 포맷 (product-analysis 스타일)
    const reviewStr = sampledReviews.length > 0
      ? sampledReviews.map((r, i) =>
          `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 120)}${r.content.length > 120 ? '...' : ''}"`
        ).join('\n')
      : '리뷰 없음';

    return {
      pcode,
      name: product.name,
      brand: product.brand,
      price: product.price,
      specs: product.specs || {},
      specSummary: product.specSummary || '',
      reviewStr,
    };
  });

  // 태그를 조건 형태로 변환 (sourceType별로 구분)
  const tagConditions = tags.map(t => {
    const conditionType = t.sourceType === 'balance' ? 'balance' :
                          t.sourceType === 'negative' ? 'negative' : 'hardFilter';
    return `- ${t.id}: "${t.originalCondition || t.label}" (${conditionType})`;
  }).join('\n');

  const prompt = `당신은 ${categoryName} 전문 큐레이터입니다.
사용자가 선택한 조건들을 각 제품이 얼마나 충족하는지 분석해주세요.

## 평가할 조건 목록
${tagConditions}

## 제품 정보
${productInfos.map((p, i) => `
### 제품 ${i + 1}: ${p.pcode}
- 제품명: ${p.name}
- 브랜드: ${p.brand || '미상'}
- 가격: ${p.price ? `${p.price.toLocaleString()}원` : '미정'}
- 스펙: ${p.specSummary?.slice(0, 400) || JSON.stringify(p.specs).slice(0, 400)}

리뷰:
${p.reviewStr}
`).join('\n')}

## evidence 작성 규칙
evidence는 사용자에게 보여지는 핵심 문장입니다.

### Good Examples
- "저소음 설계로 조용한 사용 환경을 제공해요."
- "리뷰에서 '소음이 거의 없다'는 평가가 많아요."
- "3단계 온도 조절이 가능해 상황에 맞게 사용할 수 있어요."

### 근거 부족 시
- status: "partial" 또는 null
- evidence: "상세 스펙에서 확인이 어려워요."

## 평가 기준
- **"full"**: 스펙/리뷰에서 명확히 확인됨 → 충족/회피됨
- **"partial"**: 부분적으로 해당되거나 조건부
- **null**: 관련 없거나 충족 못함/회피 안됨

### ⚠️ 상호 배타적 조건 처리 (중요!)
같은 질문의 서로 다른 답변 값들은 **물리적으로 동시에 만족 불가능**합니다.

**핵심 규칙:**
- originalCondition의 질문 부분(콜론 앞)이 같으면 → 상호 배타적
- 하나의 제품이 여러 값을 동시에 가질 수 없는 속성 (크기, 재질, 용량 등)
- **하나만 "full"**, 나머지는 null

**예시 1: 재질 (물리적으로 동시 불가)**
- 조건: "재질: 실리콘", "재질: 원목"
- 제품: 실리콘 치발기
  • "재질: 실리콘" → "full" ✅ (스펙: 실리콘 소재)
  • "재질: 원목" → null ❌ (원목이 아님)
- ⚠️ 잘못된 평가: 둘 다 "full" (물리적으로 불가능!)

**예시 2: 크기/용량 (정확히 일치만)**
- 조건: "화면 크기: 27인치", "화면 크기: 32인치"
- 제품: 27인치 모니터
  • "화면 크기: 27인치" → "full" ✅
  • "화면 크기: 32인치" → null ❌ (32인치가 아님)

**예시 3: 용도 (복수 가능, 예외 케이스)**
- 조건: "사용 장소: 거실", "사용 장소: 안방"
- 제품: 이동식 가습기
  • "사용 장소: 거실" → "full" ✅ (이동 가능)
  • "사용 장소: 안방" → "full" ✅ (이동 가능)
- ✅ 용도/장소는 동시 만족 가능 (제품 자체 속성이 아님)

⚠️ negative(피할 단점) 조건의 경우:
- "full" = 해당 단점이 없음 (회피 성공)
- "partial" = 일부 있지만 심하지 않음
- null = 해당 단점이 있음 (회피 실패)

## 응답 형식 (JSON)
{
  "evaluations": {
    "제품pcode": {
      "태그id": { "score": "full" | "partial" | null, "evidence": "근거 문장" },
      ...
    },
    ...
  }
}

⚠️ 주의: 근거 없이 추측 금지, evidence에 이모티콘/볼드 금지`;

  try {
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const evaluations = parsed.evaluations || parsed;

      // 태그 ID → conditionType 매핑
      const tagTypeMap: Record<string, 'hardFilter' | 'balance' | 'negative'> = {};
      tags.forEach(t => {
        tagTypeMap[t.id] = t.sourceType === 'balance' ? 'balance' :
                          t.sourceType === 'negative' ? 'negative' : 'hardFilter';
      });

      // 결과를 ProductTagScores 형식으로 변환 (evidence 포함)
      const tagScoresMap: Record<string, ProductTagScores> = {};

      for (const [pcode, scores] of Object.entries(evaluations)) {
        tagScoresMap[pcode] = {};
        for (const [tagId, scoreData] of Object.entries(scores as Record<string, any>)) {
          // scoreData가 객체인 경우 (새 형식)
          if (typeof scoreData === 'object' && scoreData !== null) {
            const normalizedScore: TagScore =
              scoreData.score === 'full' ? 'full' :
              scoreData.score === 'partial' ? 'partial' :
              null;

            if (normalizedScore !== null) {
              tagScoresMap[pcode][tagId] = {
                score: normalizedScore,
                evidence: scoreData.evidence || undefined,
                conditionType: tagTypeMap[tagId] || 'hardFilter',
              };
            }
          }
          // scoreData가 문자열인 경우 (레거시 형식 호환)
          else if (typeof scoreData === 'string') {
            const normalizedScore: TagScore =
              scoreData === 'full' ? 'full' :
              scoreData === 'partial' ? 'partial' :
              null;

            if (normalizedScore !== null) {
              tagScoresMap[pcode][tagId] = {
                score: normalizedScore,
                conditionType: tagTypeMap[tagId] || 'hardFilter',
              };
            }
          }
        }
      }

      console.log(`[TagScores] ✅ 상세 평가 완료 (${Date.now() - startTime}ms): ${Object.keys(tagScoresMap).length}개 제품`);
      return tagScoresMap;
    }
  } catch (error) {
    console.error('[TagScores] 평가 실패:', error);
  }

  return {};
}

// ============================================================================
// 🆕 상호 배타적 태그 후처리 (같은 질문에서 나온 태그 중 full은 1개만 허용)
// ============================================================================

/**
 * 상호 배타적 조건인지 판단하는 키워드
 * - 이 키워드가 질문에 포함되면 상호 배타적 그룹으로 처리
 * - 용도/장소 관련 질문은 제외 (복수 선택 가능)
 */
const EXCLUSIVE_QUESTION_KEYWORDS = [
  '재질', '소재', '재료', '원단',  // 재질 관련
  '브랜드', '제조사', '메이커',    // 브랜드 관련
  '크기', '사이즈', '용량', '인치', // 크기/용량 관련
  '색상', '색깔', '컬러',          // 색상 관련
  '타입', '종류', '방식',          // 타입 관련
];

/**
 * 복수 선택 가능한 질문 키워드 (상호 배타성 제외)
 */
const NON_EXCLUSIVE_KEYWORDS = [
  '용도', '목적', '사용처',
  '장소', '공간', '어디',
  '기능', '특징',
];

/**
 * 질문이 상호 배타적 조건인지 판단
 */
function isExclusiveQuestion(question: string): boolean {
  const q = question.toLowerCase();

  // 복수 선택 가능 키워드가 있으면 제외
  if (NON_EXCLUSIVE_KEYWORDS.some(kw => q.includes(kw))) {
    return false;
  }

  // 상호 배타적 키워드가 있으면 true
  return EXCLUSIVE_QUESTION_KEYWORDS.some(kw => q.includes(kw));
}

/**
 * 제품 정보에서 특정 키워드 매칭 점수 계산
 * - 제품명, 브랜드, 스펙에서 키워드가 얼마나 매칭되는지 확인
 */
function calculateKeywordMatchScore(
  product: HardCutProduct,
  tag: FilterTag
): number {
  let score = 0;
  const searchTexts = [
    product.name?.toLowerCase() || '',
    product.brand?.toLowerCase() || '',
    product.specSummary?.toLowerCase() || '',
    JSON.stringify(product.specs || {}).toLowerCase(),
  ].join(' ');

  // sourceAnswer에서 키워드 추출 (쉼표로 분리된 경우도 처리)
  const answerKeywords = (tag.sourceAnswer || tag.label || '')
    .toLowerCase()
    .split(/[,、\/]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // 각 키워드가 제품 정보에 있는지 확인
  for (const keyword of answerKeywords) {
    if (searchTexts.includes(keyword)) {
      score += 10;  // 정확 매칭
    }
  }

  // keywords 배열도 확인
  for (const keyword of (tag.keywords || [])) {
    if (searchTexts.includes(keyword.toLowerCase())) {
      score += 5;  // 동의어 매칭
    }
  }

  return score;
}

/**
 * 상호 배타적 태그 충족도 후처리
 * - 같은 sourceQuestion을 가진 태그들 중 full이 여러 개면 1개만 남김
 * - 제품 스펙/이름에서 키워드 매칭으로 가장 적합한 태그 선택
 */
function enforceTagExclusivity(
  tagScoresMap: Record<string, ProductTagScores>,
  tags: FilterTag[],
  products: HardCutProduct[]
): Record<string, ProductTagScores> {
  // 제품 pcode → HardCutProduct 매핑
  const productMap = new Map(products.map(p => [p.pcode, p]));

  // 상호 배타적 그룹별 태그 분류 (sourceQuestion 기준)
  const exclusiveGroups = new Map<string, FilterTag[]>();

  for (const tag of tags) {
    const question = tag.sourceQuestion || '';
    if (!question || !isExclusiveQuestion(question)) {
      continue;  // 상호 배타적이지 않은 질문은 스킵
    }

    if (!exclusiveGroups.has(question)) {
      exclusiveGroups.set(question, []);
    }
    exclusiveGroups.get(question)!.push(tag);
  }

  // 그룹이 1개 이하인 경우 (중복 가능성 없음) 스킵
  const relevantGroups = Array.from(exclusiveGroups.entries())
    .filter(([, groupTags]) => groupTags.length > 1);

  if (relevantGroups.length === 0) {
    return tagScoresMap;  // 후처리 불필요
  }

  console.log(`[TagExclusivity] 🔍 ${relevantGroups.length}개 상호 배타적 그룹 발견`);

  // 각 제품에 대해 후처리
  const result: Record<string, ProductTagScores> = JSON.parse(JSON.stringify(tagScoresMap));

  for (const [pcode, scores] of Object.entries(result)) {
    const product = productMap.get(pcode);
    if (!product) continue;

    for (const [question, groupTags] of relevantGroups) {
      // 이 그룹에서 full인 태그들 찾기
      const fullTags = groupTags.filter(tag =>
        scores[tag.id]?.score === 'full'
      );

      if (fullTags.length <= 1) {
        continue;  // full이 0~1개면 문제 없음
      }

      // full이 2개 이상 → 가장 적합한 1개만 남기기
      console.log(`[TagExclusivity] ⚠️ ${pcode}: "${question}" 그룹에서 full ${fullTags.length}개 발견`);

      // 키워드 매칭 점수로 정렬
      const tagScoresPairs = fullTags.map(tag => ({
        tag,
        matchScore: calculateKeywordMatchScore(product, tag),
      }));
      tagScoresPairs.sort((a, b) => b.matchScore - a.matchScore);

      // 가장 높은 점수의 태그만 full 유지, 나머지는 null로 변경
      const [winner, ...losers] = tagScoresPairs;

      console.log(`[TagExclusivity] ✅ 선택: "${winner.tag.label}" (점수: ${winner.matchScore})`);

      for (const { tag } of losers) {
        console.log(`[TagExclusivity] ❌ 제거: "${tag.label}"`);
        delete result[pcode][tag.id];  // null 대신 삭제 (UI에 표시 안 함)
      }
    }
  }

  return result;
}

/**
 * 리뷰에서 주요 키워드 추출
 */
function extractReviewKeywords(reviews: ReviewLite[]): {
  pros: string[];
  cons: string[];
} {
  const positiveKeywords = ['좋아요', '만족', '추천', '최고', '깨끗', '편리', '빠르', '조용', '예쁘', '튼튼', '가성비'];
  const negativeKeywords = ['아쉽', '불편', '소음', '느리', '비싸', '별로', '실망', '고장', '뜨겁', '무거', '작음'];

  const prosFound = new Set<string>();
  const consFound = new Set<string>();

  for (const review of reviews) {
    const content = review.content.toLowerCase();
    for (const kw of positiveKeywords) {
      if (content.includes(kw)) prosFound.add(kw);
    }
    for (const kw of negativeKeywords) {
      if (content.includes(kw)) consFound.add(kw);
    }
  }

  return {
    pros: Array.from(prosFound),
    cons: Array.from(consFound),
  };
}

/**
 * 리뷰 정성적 분석 (심층 분석)
 * - 별점 분포
 * - 긍정/부정 감정 비율
 * - 자주 언급되는 구체적 내용
 * - 리뷰 신뢰도 지표
 */
function analyzeReviewsQualitative(reviews: ReviewLite[]): {
  avgRating: number;
  ratingDistribution: Record<number, number>;
  sentimentScore: number; // -1 ~ 1
  topMentions: string[]; // 가장 많이 언급된 구체적 특징
  reliabilityScore: number; // 리뷰 신뢰도 (0~1)
  keyInsights: string[]; // 핵심 인사이트 문장
} {
  if (reviews.length === 0) {
    return {
      avgRating: 0,
      ratingDistribution: {},
      sentimentScore: 0,
      topMentions: [],
      reliabilityScore: 0,
      keyInsights: [],
    };
  }

  // 1. 별점 분포 & 평균
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;
  reviews.forEach(r => {
    const rating = Math.min(5, Math.max(1, Math.round(r.rating)));
    ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
    totalRating += r.rating;
  });
  const avgRating = totalRating / reviews.length;

  // 2. 감정 분석 (간단한 키워드 기반)
  const positiveWords = ['좋', '만족', '추천', '최고', '훌륭', '편리', '깨끗', '빠르', '조용', '예쁘', '튼튼', '가성비', '완벽', '대박', '굿', '굳', '짱', '최애'];
  const negativeWords = ['아쉽', '불편', '소음', '느리', '비싸', '별로', '실망', '고장', '뜨겁', '무거', '작', '냄새', '누수', '불량', '최악', '후회', '환불'];

  let positiveCount = 0;
  let negativeCount = 0;
  const mentionCounter: Record<string, number> = {};
  const keyInsights: string[] = [];

  // 구체적 특징 추출 패턴
  const featurePatterns = [
    /(\d+(?:ml|l|리터|kg|g|w|시간|분))/gi, // 수치 + 단위
    /(세척|청소|분해|조립|설치|배송|소음|무게|크기|용량|전력|배터리|충전)/gi, // 기능 키워드
  ];

  reviews.forEach(r => {
    const content = r.content.toLowerCase();

    // 긍정/부정 카운트
    positiveWords.forEach(w => {
      if (content.includes(w)) positiveCount++;
    });
    negativeWords.forEach(w => {
      if (content.includes(w)) negativeCount++;
    });

    // 구체적 특징 추출
    featurePatterns.forEach(pattern => {
      const matches = r.content.match(pattern);
      if (matches) {
        matches.forEach(m => {
          const key = m.toLowerCase();
          mentionCounter[key] = (mentionCounter[key] || 0) + 1;
        });
      }
    });

    // 핵심 인사이트 추출 (50자 이상, 높은 평점 또는 낮은 평점)
    if (r.content.length > 50) {
      if (r.rating >= 4.5) {
        const snippet = r.content.slice(0, 60).replace(/\n/g, ' ');
        if (!keyInsights.some(i => i.includes(snippet.slice(0, 20)))) {
          keyInsights.push(`[👍${r.rating}점] ${snippet}...`);
        }
      } else if (r.rating <= 2.5) {
        const snippet = r.content.slice(0, 60).replace(/\n/g, ' ');
        if (!keyInsights.some(i => i.includes(snippet.slice(0, 20)))) {
          keyInsights.push(`[⚠️${r.rating}점] ${snippet}...`);
        }
      }
    }
  });

  // 감정 점수 계산 (-1 ~ 1)
  const totalSentiment = positiveCount + negativeCount;
  const sentimentScore = totalSentiment > 0
    ? (positiveCount - negativeCount) / totalSentiment
    : 0;

  // 상위 언급 특징
  const topMentions = Object.entries(mentionCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => key);

  // 리뷰 신뢰도 (리뷰 수, 내용 길이, 별점 분포 다양성 기반)
  const hasVariedRatings = Object.values(ratingDistribution).filter(v => v > 0).length >= 3;
  const avgContentLength = reviews.reduce((sum, r) => sum + r.content.length, 0) / reviews.length;
  const reliabilityScore = Math.min(1, (
    (reviews.length >= 5 ? 0.3 : reviews.length * 0.06) +
    (hasVariedRatings ? 0.3 : 0.1) +
    (avgContentLength > 50 ? 0.4 : avgContentLength * 0.008)
  ));

  return {
    avgRating: Math.round(avgRating * 10) / 10,
    ratingDistribution,
    sentimentScore: Math.round(sentimentScore * 100) / 100,
    topMentions,
    reliabilityScore: Math.round(reliabilityScore * 100) / 100,
    keyInsights: keyInsights.slice(0, 3),
  };
}

// ============================================================================
// 스펙 정규화 (비교표용) - Flash Lite 사용
// ============================================================================

interface NormalizedSpec {
  key: string;
  values: Record<string, string | null>;
}

async function normalizeSpecsForComparison(
  products: HardCutProduct[],
  categoryName: string
): Promise<NormalizedSpec[]> {
  if (!ai || products.length === 0) return [];

  const model = ai.getGenerativeModel({
    model: SPEC_NORMALIZE_MODEL,
    generationConfig: { temperature: 0.2, maxOutputTokens: 2000 },
  });

  // 각 제품의 스펙 요약 정보를 텍스트로 변환
  const productsSpecText = products.map((p) => {
    return `### 제품 ${p.pcode} (${p.brand || ''} ${p.name})
스펙 요약: ${p.specSummary || '(정보 없음)'}`;
  }).join('\n\n');

  const pcodes = products.map(p => p.pcode);

  const prompt = `당신은 ${categoryName} 스펙 비교 전문가입니다.
아래 ${products.length}개 제품의 스펙 요약 정보를 **비교표 형식**으로 정규화해주세요.

## 제품별 스펙 정보
${productsSpecText}

## 정규화 규칙

### 1. 의미 중심의 스펙 추출
스펙 요약 텍스트에서 제품 간 비교에 유용한 핵심 스펙들을 추출하세요.
예: "용량", "재질", "무게", "크기", "소비전력", "주요 기능", "연결방식", "센서", "배터리" 등

### 2. 동일 의미 스펙 키 통일 (가장 중요!)
같은 의미의 스펙은 하나의 표준 키로 통일하세요:
- "용량", "물통 용량", "물통용량" → **"용량"**
- "재질", "내부 재질", "소재", "바디 소재" → **"재질"**
- "무게", "중량", "제품 무게" → **"무게"**
- "크기", "사이즈", "본체 크기" → **"크기"**
- "연결", "연결방식", "인터페이스" → **"연결방식"**
- "DPI", "해상도", "감도" → **"DPI"**

### 3. 값 정규화
- 한쪽에만 있는 스펙도 포함 (없는 쪽은 null)
- 값은 원본의 수치와 단위를 최대한 유지
- 최소 5개, 최대 10개의 핵심 스펙을 추출

## 응답 JSON 형식
\`\`\`json
{
  "normalizedSpecs": [
    {
      "key": "용량",
      "values": {
        "${pcodes[0]}": "500ml",
        "${pcodes[1]}": "600ml"${pcodes[2] ? `,
        "${pcodes[2]}": "450ml"` : ''}
      }
    }
  ]
}
\`\`\`

JSON만 응답하세요.`;

  try {
    console.log('[Spec Normalize] Normalizing specs for comparison...');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.normalizedSpecs && Array.isArray(parsed.normalizedSpecs)) {
        console.log(`[Spec Normalize] Extracted ${parsed.normalizedSpecs.length} spec keys`);
        return parsed.normalizedSpecs;
      }
    }
  } catch (error) {
    console.error('[Spec Normalize] Error:', error);
  }

  return [];
}

// ============================================================================
// 장단점 리스트 생성 - Flash Lite 사용
// ============================================================================

interface ProductProsConsResult {
  pcode: string;
  pros: string[];
  cons: string[];
}

async function generateProsConsForProducts(
  products: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  categoryName: string
): Promise<ProductProsConsResult[]> {
  if (!ai || products.length === 0) return [];

  const model = ai.getGenerativeModel({
    model: PROS_CONS_MODEL,
    generationConfig: { temperature: 0.3, maxOutputTokens: 2500 },
  });

  // 사용자 컨텍스트 정리
  const userContext = Object.entries(collectedInfo)
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n') || '(없음)';

  // 각 제품별 정보 + 리뷰 정성 분석 구성
  const productInfos = products.map((p) => {
    const productReviews = reviews[p.pcode] || [];
    const qualitative = analyzeReviewsQualitative(productReviews);

    // 리뷰 원문 (최대 7개로 확대)
    const reviewTexts = productReviews.slice(0, 7).map((r, i) =>
      `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 100)}${r.content.length > 100 ? '...' : ''}"`
    ).join('\n');

    // 핵심 인사이트 포함
    const insightsText = qualitative.keyInsights.length > 0
      ? `\n핵심 인사이트:\n${qualitative.keyInsights.map(i => `  ${i}`).join('\n')}`
      : '';

    return `### ${p.brand} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString()}원
- 스펙: ${p.specSummary || '정보 없음'}
- 리뷰 분석: 평균 ${qualitative.avgRating}점, 감정점수 ${qualitative.sentimentScore}, 신뢰도 ${(qualitative.reliabilityScore * 100).toFixed(0)}%
- 자주 언급: ${qualitative.topMentions.join(', ') || '없음'}${insightsText}
- 리뷰 원문:
${reviewTexts || '(리뷰 없음)'}`;
  }).join('\n\n');

  const prompt = `## 역할
${categoryName} 전문가로서 **실제 리뷰 내용을 기반**으로 각 상품의 장단점을 정리합니다.
이 제품이 다른 경쟁 제품 대비 **왜 선택받아야 하는지(Why Buy)**, 그리고 **무엇을 감수해야 하는지(Consideration)**를 분석하세요.

## 사용자 컨텍스트
${userContext}

## 상품 + 리뷰 분석 정보
${productInfos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ✍️ 작성 규칙 (핵심 차별화 포인트)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 1️⃣ 장점 (pros) - 3가지
- 단순 스펙 나열이 아닌 **사용자가 얻게 되는 구체적 이익(Benefit)**을 작성
- 경쟁 제품들과 구별되는 **이 제품만의 고유한 강점(USP)**을 최우선으로 배치
- **형식:** "**키워드**: 구체적 설명" (예: "**압도적 분사력**: 거실 전체가 금방 촉촉해져요")

### 2️⃣ 단점 (cons) - 2가지
- 제품을 비하하지 말고, **"구매 전 고려해야 할 현실적 특징(Trade-off)"**으로 작성
- 치명적인 결함보다는 사용 환경에 따른 호불호나, 감수할 수 있는 불편함을 언급하여 **신뢰도**를 높이기
- **형식:** "**키워드**: 구체적 설명" (예: "**소음**: 터보 모드에서는 팬 소리가 들릴 수 있어요")

### 3️⃣ 작성 가이드
- ❌ "디자인이 예뻐요" (너무 모호함)
- ⭕ "**오브제 디자인**: 인테리어를 해치지 않는 감성적인 외관"
- ❌ "무거워요" (단순 비하)
- ⭕ "**무게감**: 안정감은 있지만, 자주 이동하기엔 조금 무거워요" (Trade-off)
- ❌ "품질이 좋아요" (모호)
- ⭕ "**내구성**: 스테인리스 재질로 녹슬지 않아요"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 📤 응답 JSON
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "results": [
    {
      "pcode": "상품코드",
      "pros": ["**키워드**: 장점 설명1", "**키워드**: 장점2", "**키워드**: 장점3"],
      "cons": ["**키워드**: 고려사항1", "**키워드**: 고려사항2"]
    }
  ]
}

⚠️ JSON만 출력
⚠️ 리뷰에 언급 없는 내용은 작성 금지
⚠️ 뻔한 스펙 나열 금지 - USP와 Trade-off 관점으로!`;

  try {
    console.log('[Pros/Cons] Generating for products...');
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.results && Array.isArray(parsed.results)) {
        console.log(`[Pros/Cons] Generated for ${parsed.results.length} products`);
        return parsed.results;
      }
    }
  } catch (error) {
    console.error('[Pros/Cons] Error:', error);
  }

  // Fallback: 리뷰 키워드 추출 기반
  return products.map(p => {
    const { pros, cons } = extractReviewKeywords(reviews[p.pcode] || []);
    return {
      pcode: p.pcode,
      pros: pros.slice(0, 3),
      cons: cons.slice(0, 2),
    };
  });
}

// ============================================================================
// 🆕 120개 병렬 LLM 평가
// ============================================================================

const PARALLEL_EVAL_MODEL = 'gemini-2.5-flash-lite'; // 비용 효율 + 속도
const REVIEWS_PER_PRODUCT = 20; // 제품당 리뷰 샘플 수 (50 → 20 최적화)
const PARALLEL_BATCH_SIZE = 120; // 전체 동시 요청

interface ProductEvaluation {
  pcode: string;
  score: number;  // 0-100
  reason: string;
  avoidanceScore: number; // 피할단점 회피 점수 (0-100, 높을수록 잘 회피)
}

/**
 * 120개 전체 제품을 병렬로 LLM 평가
 * - 각 제품: 메타데이터 + 리뷰 30개 + 사용자 조건 → 점수 (0-100)
 * - 피할단점 회피 여부를 맥락 있게 평가
 */
async function evaluateAllCandidatesWithLLM(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  negativeSelections: string[],
  expandedKeywords?: ExpandedKeywords,  // 🆕 키워드 정보 (프롬프트에 활용)
): Promise<ProductEvaluation[]> {
  if (!ai) {
    console.log('[ParallelEval] No AI, fallback to score-based');
    return candidates.map(p => ({
      pcode: p.pcode,
      score: p.matchScore || 50,
      reason: '기본 점수',
      avoidanceScore: 50,
    }));
  }

  const model = ai.getGenerativeModel({
    model: PARALLEL_EVAL_MODEL,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 200,
      responseMimeType: 'application/json',
    },
  });

  // 🔥 브랜드 선택 추출 (brand_preference, brand, 또는 질문에 "브랜드"/"제조사" 포함)
  let selectedBrand: string | null = null;
  for (const [question, answer] of Object.entries(collectedInfo)) {
    if (question.includes('brand') || question.includes('브랜드') || question.includes('제조사')) {
      const skipPatterns = ['skip', 'any', '상관없', '건너뛰', '아무', '없어요', '없음'];
      const isSkip = skipPatterns.some(pattern => answer.toLowerCase().includes(pattern));
      if (!isSkip && answer && answer.length > 0) {
        selectedBrand = answer;
        break;
      }
    }
  }

  // 🆕 카테고리 관여도 추출 및 브랜드 보너스 계산
  const categoryInvolvement = (collectedInfo['__category_involvement'] as 'high' | 'trust' | 'low') || 'trust';
  const BRAND_BONUS = {
    high: 20,   // 고관여 제품: 브랜드 매우 중요 (유모차, 카시트 등)
    trust: 15,  // 신뢰기반: 브랜드 중요 (기저귀, 물티슈 등)
    low: 10     // 저관여: 브랜드 덜 중요 (양말, 턱받이 등)
  };
  const brandBonus = BRAND_BONUS[categoryInvolvement];
  console.log(`[FinalRecommend] 카테고리 관여도: ${categoryInvolvement}, 브랜드 보너스: +${brandBonus}점`);

  // 사용자 조건 문자열 (브랜드 제외 - 별도 표시)
  const userConditions = Object.entries(collectedInfo)
    .filter(([k]) => !k.startsWith('__'))
    .filter(([k]) => !k.includes('brand') && !k.includes('브랜드') && !k.includes('제조사')) // 브랜드는 별도 표시
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n') || '없음';

  const priorities = balanceSelections.map(b => b.selectedLabel).join(', ') || '없음';
  const avoidList = negativeSelections.join(', ') || '없음';

  // 🆕 키워드 정보 (프롬프트에 활용)
  const { preferKeywords = [], avoidKeywords = [] } = expandedKeywords || {};
  const keywordInfo = (preferKeywords.length > 0 || avoidKeywords.length > 0)
    ? `\n## 🔍 리뷰에서 주목할 키워드\n- 선호 관련: ${preferKeywords.slice(0, 8).join(', ') || '없음'}\n- 회피 관련: ${avoidKeywords.slice(0, 5).join(', ') || '없음'}`
    : '';

  console.log(`[ParallelEval] Starting evaluation of ${candidates.length} products... (keywords: prefer=${preferKeywords.length}, avoid=${avoidKeywords.length})`);
  const startTime = Date.now();

  // 단일 제품 평가 함수
  const evaluateOne = async (product: HardCutProduct): Promise<ProductEvaluation> => {
    const productReviews = reviews[product.pcode] || [];

    // 리뷰 균형 샘플링 (고평점 절반 + 저평점 절반, 중복 제거)
    const sorted = [...productReviews].sort((a, b) => b.rating - a.rating);
    let sampledReviews: string[];

    if (sorted.length <= REVIEWS_PER_PRODUCT) {
      // 리뷰가 20개 이하면 전체 사용
      sampledReviews = sorted.map(r => `[${r.rating}점] ${r.content.slice(0, 150)}`);
    } else {
      // 고평점/저평점 균형 샘플링
      const halfCount = Math.floor(REVIEWS_PER_PRODUCT / 2);
      const highRated = sorted.slice(0, halfCount);
      const lowRated = sorted.slice(-halfCount);
      sampledReviews = [...highRated, ...lowRated]
        .map(r => `[${r.rating}점] ${r.content.slice(0, 150)}`);
    }

    // 브랜드 매칭 여부 체크
    const isBrandMatch = selectedBrand && product.brand
      ? product.brand.toLowerCase().includes(selectedBrand.toLowerCase()) ||
        selectedBrand.toLowerCase().includes(product.brand.toLowerCase())
      : false;

    const prompt = `## ${categoryName} 제품 평가

## 제품 정보
- 브랜드: ${product.brand}${isBrandMatch ? ' ⭐ (사용자 선호 브랜드!)' : ''}
- 제품명: ${product.name}
- 가격: ${product.price?.toLocaleString()}원
- 스펙: ${product.specSummary || ''}
- 리뷰 ${productReviews.length}개, 평균 ${productReviews.length > 0 ? (productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length).toFixed(1) : 0}점

## 사용자가 원하는 조건 (필수 충족)
${selectedBrand ? `⭐ **선호 브랜드**: ${selectedBrand}${isBrandMatch ? ' → 이 제품이 해당!' : ''}\n` : ''}${userConditions}
${priorities !== '없음' ? `\n⭐ 특히 중요: ${priorities}` : ''}

## 피해야 할 단점 (회피 필수)
${avoidList !== '없음' ? avoidList.split(', ').map(item => `- ${item}`).join('\n') : '없음'}
${keywordInfo}

## 리뷰 샘플 (${sampledReviews.length}개)
${sampledReviews.join('\n')}

## 평가 방법
⚠️ **0단계: 카테고리 적합성 (필수)**
- 이 제품이 "${categoryName}" 카테고리에 해당하는가?
- 액세서리, 소모품, 관련 용품이 아닌 **본품**인가?
- 예: "와인셀러" 카테고리 → 와인 오프너, 와인잔은 ❌ / 와인 냉장고는 ✅
- 카테고리 불일치 시 → categoryMatch: false, score: 0

1. **조건 충족도 (60점)**: 사용자 조건을 이 제품이 얼마나 만족하는가?
   - 스펙에서 직접 확인되는 기능/수치가 있는가?
   - 🔍 리뷰에서 **주목할 키워드(선호 관련)**가 언급되면 가점
   - "특히 중요" 항목은 가중치 높게 평가
   - ⭐ **브랜드 매칭**: 선호 브랜드와 일치하면 +${brandBonus}점 가산

2. **단점 회피 (40점)**: 피해야 할 단점이 이 제품에 있는가?
   - 🔍 리뷰에서 **주목할 키워드(회피 관련)**가 부정적으로 언급되면 감점
   - "~없다", "~좋다", "~만족" 등 긍정 표현은 회피 성공으로 판단
   - 저평점(1-2점) 리뷰에서 반복 언급되면 감점

## 응답 (JSON만)
{"categoryMatch":true/false,"score":0~100,"avoidanceScore":0~100,"reason":"15자 이내"}`;

    try {
      const result = await model.generateContent(prompt);
      let text = result.response.text().trim();
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // 카테고리 불일치 시 score 0으로 처리
        const isCategoryMatch = parsed.categoryMatch !== false;
        return {
          pcode: product.pcode,
          score: isCategoryMatch ? (parsed.score || 50) : 0,
          avoidanceScore: parsed.avoidanceScore || 50,
          reason: isCategoryMatch ? (parsed.reason || '') : '카테고리 불일치',
        };
      }
    } catch (error) {
      // 개별 실패는 조용히 처리
    }

    // Fallback
    return {
      pcode: product.pcode,
      score: product.matchScore || 50,
      avoidanceScore: 50,
      reason: 'fallback',
    };
  };

  // 배치 병렬 처리 (rate limit 고려)
  const results: ProductEvaluation[] = [];

  for (let i = 0; i < candidates.length; i += PARALLEL_BATCH_SIZE) {
    const batch = candidates.slice(i, i + PARALLEL_BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(evaluateOne));
    results.push(...batchResults);

    console.log(`[ParallelEval] Batch ${Math.floor(i / PARALLEL_BATCH_SIZE) + 1}/${Math.ceil(candidates.length / PARALLEL_BATCH_SIZE)} complete (${results.length}/${candidates.length})`);
  }

  const elapsed = Date.now() - startTime;
  const categoryMismatch = results.filter(r => r.reason === '카테고리 불일치').length;
  console.log(`[ParallelEval] ✅ Complete: ${results.length} products in ${elapsed}ms (${(elapsed / results.length).toFixed(0)}ms/product)${categoryMismatch > 0 ? ` ⚠️ 카테고리 불일치: ${categoryMismatch}개` : ''}`);

  // 점수순 정렬
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * 120개 후보에서 사전 스크리닝 (규칙 기반)
 * - matchScore(사용자 선택 기반) 우선 + 리뷰/평점 보조
 * - 상위 50개 추출
 */
const PRESCREEN_LIMIT = 25;  // 🚀 최적화: 50 → 25 (입력 토큰 50% 감소)

function prescreenCandidates(
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  negativeSelections: string[],
  expandedKeywords?: ExpandedKeywords, // 🆕 확장된 키워드 (flash-lite로 추출)
  rankMap?: Record<string, number> // 🆕 다나와 랭크 맵
): HardCutProduct[] {
  console.log(`[FinalRecommend] Pre-screening ${candidates.length} candidates...`);

  const { preferKeywords = [], avoidKeywords = [] } = expandedKeywords || {};

  // 각 상품에 점수 부여
  const scored = candidates.map(p => {
    let score = 0;

    // 1. matchScore 우선 (사용자 선택 기반 점수) - 가중치 높임
    score += (p.matchScore || 0) * 2; // 0.5 → 2배로 상향

    // 2. 리뷰 수 점수 (리뷰가 많을수록 높음) - 가중치 상향!
    const productReviews = reviews[p.pcode] || [];
    // 리뷰 수 구간별 점수: 1-5개: 기본, 6-15개: 보너스, 16개 이상: 대폭 추가 보너스
    const reviewCount = productReviews.length;
    let reviewScore = 0;
    if (reviewCount >= 1) reviewScore += Math.min(reviewCount, 5) * 2; // 1-5개: 최대 10점
    if (reviewCount >= 6) reviewScore += Math.min(reviewCount - 5, 10) * 3; // 6-15개: 추가 최대 30점
    if (reviewCount >= 16) reviewScore += Math.min(reviewCount - 15, 15) * 3; // 16개 이상: 추가 최대 45점 (기존 15점에서 상향)
    score += Math.min(reviewScore, 85); // 최대 85점 (기존 55점에서 상향)

    // 3. 평점 점수
    const avgRating = productReviews.length > 0
      ? productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length
      : p.rating || 0;
    score += avgRating * 3; // 5점 만점 → 최대 15점

    // 4. 스펙 + 리뷰 통합 텍스트 (검색 대상)
    const specText = (p.specSummary || '').toLowerCase();
    const reviewText = productReviews.map(r => r.content).join(' ').toLowerCase();
    const combinedText = `${specText} ${reviewText}`;

    // 5. 🆕 선호 키워드 매칭 (확장된 키워드로 스펙+리뷰 검색)
    // - 스펙에 있으면 가점, 긍정 리뷰(4점+)에 있으면 추가 가점
    for (const keyword of preferKeywords) {
      const kwLower = keyword.toLowerCase();
      // 스펙에 있으면 +3점
      if (specText.includes(kwLower)) {
        score += 3;
      }
      // 긍정 리뷰(4점 이상)에 있으면 +2점
      const inPositiveReview = productReviews.some(
        r => r.rating >= 4 && r.content.toLowerCase().includes(kwLower)
      );
      if (inPositiveReview) {
        score += 2;
      }
    }

    // 6. 피할 키워드 매칭 (확장된 키워드 우선, 없으면 기존 로직)
    const effectiveAvoidKeywords = new Set<string>(
      avoidKeywords.map(k => k.toLowerCase())
    );
    // 기존 negativeSelections에서도 키워드 추출 (fallback)
    if (effectiveAvoidKeywords.size === 0) {
      for (const neg of negativeSelections) {
        const words = neg.match(/[가-힣]{2,}/g) || [];
        words.forEach(w => effectiveAvoidKeywords.add(w.toLowerCase()));
        if (neg.includes('무거') || neg.includes('무게')) effectiveAvoidKeywords.add('무거');
        if (neg.includes('소음') || neg.includes('시끄')) effectiveAvoidKeywords.add('소음');
        if (neg.includes('세척') || neg.includes('청소')) effectiveAvoidKeywords.add('세척');
        if (neg.includes('가격') || neg.includes('비싸')) effectiveAvoidKeywords.add('비싸');
        if (neg.includes('고장') || neg.includes('내구')) effectiveAvoidKeywords.add('고장');
        if (neg.includes('크기') || neg.includes('부피')) effectiveAvoidKeywords.add('크기');
      }
    }

    let negativeMatchCount = 0;
    for (const keyword of effectiveAvoidKeywords) {
      if (combinedText.includes(keyword)) {
        negativeMatchCount++;
      }
    }
    // 키워드 매칭 수에 따라 감점 (최대 -30점)
    score -= Math.min(negativeMatchCount * 10, 30);

    // 7. 사용자 조건 직접 매칭 (combinedText에서 검색 - 스펙+리뷰 모두)
    for (const [key, value] of Object.entries(collectedInfo)) {
      if (key.startsWith('__')) continue; // 내부 키 제외
      const valueStr = Array.isArray(value)
        ? value.join(' ')
        : (typeof value === 'string' ? value : String(value || ''));
      const valueLower = valueStr.toLowerCase();
      // 🆕 스펙뿐 아니라 리뷰에서도 검색
      if (valueLower && combinedText.includes(valueLower)) {
        score += 5;
      }
    }

    // 8. 🆕 다나와 랭크 점수 (동점 시 랭크 높은 제품 우선)
    // 랭크 1~20 → 최대 10점 (랭크가 낮을수록 높은 점수)
    if (rankMap) {
      const rank = rankMap[p.pcode];
      if (rank && rank <= 20) {
        score += Math.max(0, 11 - Math.ceil(rank / 2)); // 1-2위: +10, 3-4위: +9, ... 19-20위: +1
      }
    }

    return { product: p, score };
  });

  // 점수순 정렬 후 상위 N개 반환
  scored.sort((a, b) => b.score - a.score);

  // ✅ 리뷰 0개인 상품 제외 (품질 보장)
  const withReviews = scored.filter(s => {
    const productReviews = reviews[s.product.pcode] || [];
    return productReviews.length > 0;
  });

  // 리뷰 있는 상품이 부족하면 fallback (최소 5개 보장)
  const finalCandidates = withReviews.length >= 5
    ? withReviews
    : scored;

  const topN = finalCandidates.slice(0, PRESCREEN_LIMIT).map(s => s.product);

  console.log(`[FinalRecommend] Pre-screened to ${topN.length} candidates (excluded ${scored.length - withReviews.length} with 0 reviews)`);
  return topN;
}

// ============================================================================
// 2단계 추천 시스템: 1단계(Top3 선정) + 2단계(상세 이유 생성)
// ============================================================================

/**
 * 1단계: Top N pcode 선정 (가벼운 호출)
 * - 입력: 후보 목록 (스펙 요약 + 리뷰 키워드만, 원문 제외)
 * - 출력: pcode N개 + 간단한 선정 이유
 */
async function selectTopNPcodes(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  negativeSelections: string[],
  count: number = RECOMMENDATION_COUNT,
): Promise<{ pcode: string; briefReason: string }[]> {
  if (!ai) {
    return candidates.slice(0, count).map(p => ({
      pcode: p.pcode,
      briefReason: `매칭 점수 ${p.matchScore}점`,
    }));
  }

  // 1단계는 가벼운 선정 작업이므로 flash-lite 사용 (속도 최적화)
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2000,
      responseMimeType: 'application/json',
    },
  });

  // 후보 정보 (간략화: 리뷰 원문 제외)
  const candidateInfo = candidates.map((p, i) => {
    const productReviews = reviews[p.pcode] || [];
    const { pros, cons } = extractReviewKeywords(productReviews);
    const qualitative = analyzeReviewsQualitative(productReviews);

    return `${i + 1}. ${p.brand} ${p.name} (pcode:${p.pcode})
   가격:${p.price?.toLocaleString()}원 | 매칭:${p.matchScore}점 | 리뷰:${productReviews.length}개,${qualitative.avgRating}점
   스펙:${(p.specSummary || '').slice(0, 100)}
   장점:${pros.slice(0, 4).join(',')} | 단점:${cons.slice(0, 3).join(',')}`;
  }).join('\n');

  const prompt = `## ${categoryName} Top ${count} 선정

## 사용자 조건
${Object.entries(collectedInfo).filter(([k]) => !k.startsWith('__')).map(([q, a]) => `- ${q}: ${a}`).join('\n') || '없음'}

## 우선순위: ${balanceSelections.map(b => b.selectedLabel).join(', ') || '없음'}
## 피할 단점: ${negativeSelections.join(', ') || '없음'}

## 후보 (${candidates.length}개)
${candidateInfo}

## 작업
사용자 조건에 가장 적합한 상품 ${count}개를 선정하세요.
- 리뷰 평점/개수 + 스펙 매칭 + 사용자 우선순위 종합 고려
- 피할 단점과 관련된 상품은 제외

## 응답 (JSON만)
{"topN":[{"pcode":"코드1","briefReason":"선정이유(15자)"},{"pcode":"코드2","briefReason":"이유"},...]}`;

  try {
    console.log(`[Step1] Selecting Top ${count} pcodes...`);
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const topList = parsed.topN || parsed.top3 || parsed.top5;
      if (topList && Array.isArray(topList) && topList.length > 0) {
        console.log(`[Step1] ✅ Top ${topList.length} selected in ${Date.now() - startTime}ms:`, topList.map((t: any) => t.pcode).join(', '));
        return topList;
      }
    }
  } catch (error) {
    console.error('[Step1] Error:', error);
  }

  console.log('[Step1] ⚠️ Fallback to score-based selection');
  return candidates.slice(0, count).map(p => ({
    pcode: p.pcode,
    briefReason: `매칭 점수 ${p.matchScore}점`,
  }));
}

/**
 * 2단계: 한줄 평 생성 (선정된 N개에 대해서만)
 * - 입력: N개 상품 + 리뷰 원문 10개
 * - 출력: oneLiner (PLP 표시용)
 * - 장단점(pros/cons)은 별도 generateProsConsFromReviews에서 생성
 */
async function generateDetailedReasons(
  categoryName: string,
  selectedProducts: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  negativeSelections: string[],
  freeInputAnalysis?: FreeInputAnalysis | null,
): Promise<FinalRecommendation[]> {
  if (!ai || selectedProducts.length === 0) {
    return selectedProducts.map((p, i) => ({
      rank: i + 1,
      pcode: p.pcode,
      product: p,
      reason: `${p.brand} ${p.name}`,
      oneLiner: `✨ ${p.brand} 제품`,
    }));
  }

  const model = ai.getGenerativeModel({
    model: FINAL_RECOMMEND_MODEL,
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 2000, // oneLiner만 생성 (5개 상품)
      responseMimeType: 'application/json',
    },
  });

  // 자유 입력 섹션
  const additionalCondition = collectedInfo['__additional_condition__'] || '';
  const freeInputSection = freeInputAnalysis ? `
### ⭐ 추가 요청사항 (중요!)
**원문:** "${additionalCondition}"
${freeInputAnalysis.usageContext ? `**사용 맥락:** ${freeInputAnalysis.usageContext}` : ''}
${freeInputAnalysis.preferredAttributes.length > 0 ? `**선호 속성:** ${freeInputAnalysis.preferredAttributes.join(', ')}` : ''}
${freeInputAnalysis.avoidAttributes.length > 0 ? `**피할 단점:** ${freeInputAnalysis.avoidAttributes.join(', ')}` : ''}` : '';

  // 5개 상품 상세 정보 (리뷰 원문 10개 포함)
  const productDetails = selectedProducts.map((p, i) => {
    const productReviews = reviews[p.pcode] || [];
    const qualitative = analyzeReviewsQualitative(productReviews);

    // 리뷰 균형 샘플링 (고평점 5 + 저평점 5)
    const sortedByHigh = [...productReviews].sort((a, b) => b.rating - a.rating);
    const sortedByLow = [...productReviews].sort((a, b) => a.rating - b.rating);
    const seenIds = new Set<string>();
    const balancedReviews: ReviewLite[] = [];

    for (const r of [...sortedByHigh.slice(0, 5), ...sortedByLow.slice(0, 5)]) {
      const id = r.reviewId || r.content.slice(0, 50);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        balancedReviews.push(r);
      }
    }

    const reviewTexts = balancedReviews.slice(0, 10).map(r =>
      `[${r.rating}점] "${r.content.slice(0, 120)}${r.content.length > 120 ? '...' : ''}"`
    ).join('\n  ');

    return `### ${i + 1}위. ${p.brand} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString()}원
- 스펙: ${p.specSummary || '정보 없음'}
- 리뷰: ${productReviews.length}개, 평균 ${qualitative.avgRating}점
- 리뷰 원문 (${balancedReviews.length}개):
  ${reviewTexts || '(리뷰 없음)'}`;
  }).join('\n\n');

  const productCount = selectedProducts.length;
  const prompt = `## 역할
${categoryName} 구매 컨설턴트로서 선정된 Top ${productCount} 상품의 **맞춤형 추천 이유**를 작성합니다.

## 사용자 프로필
### 질문 응답
${Object.entries(collectedInfo).filter(([k]) => !k.startsWith('__')).map(([q, a]) => `- ${q}: ${a}`).join('\n') || '없음'}

### 우선순위
${balanceSelections.map(b => `- ${b.selectedLabel}`).join('\n') || '없음'}

### 피할 단점
${negativeSelections.join(', ') || '없음'}
${freeInputSection}

## 선정된 Top ${productCount} 상품
${productDetails}

## 작성 규칙

### oneLiner (한줄 평) - 50~80자
- 이모지 + 핵심 강점 + 리뷰 인용
- 사용자 조건에 맞는 이유도 자연스럽게 포함
- 예: 🤫 **밤잠 예민한 분들도 걱정 없는 정숙함!** 수면풍 모드가 있어 조용히 사용 가능해요

## 🚫 금지 패턴
- "실제 사용자들이...라고 평가한 제품입니다"
- "리뷰에 따르면..."
- 제품에 없는 기능을 있는 것처럼 언급

## 응답 (JSON만)
{"recommendations":[{"rank":1,"pcode":"코드","oneLiner":"한줄평"}]}`;

  try {
    console.log(`[Step2] Generating detailed reasons for ${productCount} products...`);
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    console.log('[Step2] Response length:', text.length);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      let parsed;
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch (e1) {
        const cleaned = repairJSON(jsonMatch[0]);
        try {
          parsed = JSON.parse(cleaned);
        } catch (e2) {
          parsed = await repairJSONWithFlashLite(jsonMatch[0]);
        }
      }

      if (parsed?.recommendations && Array.isArray(parsed.recommendations)) {
        console.log(`[Step2] ✅ Detailed reasons generated in ${Date.now() - startTime}ms`);

        // LLM 응답을 pcode 기준으로 맵핑
        type LLMRec = { pcode: string | number; oneLiner?: string };
        const recMap = new Map<string, LLMRec>(
          parsed.recommendations.map((rec: LLMRec) => [String(rec.pcode), rec])
        );

        // 모든 selectedProducts에 대해 결과 생성 (LLM 응답 없으면 fallback)
        return selectedProducts.map((product, i) => {
          const rec = recMap.get(product.pcode);
          const oneLiner = rec?.oneLiner || `✨ ${product.brand} ${product.name?.slice(0, 20)}`;

          return {
            rank: i + 1,
            pcode: product.pcode,
            product,
            reason: oneLiner,
            oneLiner,
          };
        });
      }
    }
  } catch (error) {
    console.error('[Step2] Error:', error);
  }

  console.log('[Step2] ⚠️ Fallback to basic reasons');
  return selectedProducts.map((p, i) => ({
    rank: i + 1,
    pcode: p.pcode,
    product: p,
    reason: `${p.brand} ${p.name} - ${(p.specSummary || '').slice(0, 60)}`,
    oneLiner: `✨ ${p.brand} 제품`,
  }));
}

/**
 * 🚀 1단계: Top N 상품 선정 (사전 스크리닝 + pcode 선정)
 * - 120개 → 25개 사전 스크리닝
 * - Top N pcode 선정 (가벼운 호출)
 * - 선정된 HardCutProduct[] 반환
 */
async function selectTopProducts(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  negativeSelections: string[],
  expandedKeywords?: ExpandedKeywords,
  freeInputAnalysis?: FreeInputAnalysis | null
): Promise<{ selectedProducts: HardCutProduct[]; enhancedNegativeSelections: string[] }> {
  // 🆕 다나와 랭크 조회 (사전 스크리닝용)
  let rankMap: Record<string, number> = {};
  if (candidates.length > PRESCREEN_LIMIT) {
    try {
      const pcodes = candidates.map(c => c.pcode);
      const { data: rankData } = await supabase
        .from('knowledge_products_cache')
        .select('pcode, rank')
        .in('pcode', pcodes);
      if (rankData) {
        rankMap = Object.fromEntries(rankData.filter(r => r.rank).map(r => [r.pcode, r.rank]));
        console.log(`[FinalRecommend] ✅ 사전스크리닝용 rank 조회: ${Object.keys(rankMap).length}개`);
      }
    } catch (e) {
      console.error('[FinalRecommend] rank 조회 실패:', e);
    }
  }

  // 자유 입력에서 추출한 피할 단점을 negativeSelections에 추가
  const enhancedNegativeSelections = [...negativeSelections];
  if (freeInputAnalysis?.avoidAttributes?.length) {
    enhancedNegativeSelections.push(...freeInputAnalysis.avoidAttributes);
    console.log(`[FinalRecommend] Added ${freeInputAnalysis.avoidAttributes.length} avoid attributes from free input`);
  }

  // ============================================================================
  // 🆕 120개 병렬 LLM 평가 vs 기존 규칙 기반 (플래그로 전환)
  // ============================================================================
  const USE_PARALLEL_LLM_EVAL = true; // 🧪 테스트용 플래그

  let topNSelection: { pcode: string; briefReason: string }[];

  if (USE_PARALLEL_LLM_EVAL && candidates.length > 10) {
    // 🆕 새 방식: 전체를 병렬 LLM 평가
    console.log(`[FinalRecommend] 🆕 Using parallel LLM evaluation for ${candidates.length} candidates`);

    const evaluations = await evaluateAllCandidatesWithLLM(
      categoryName,
      candidates,
      reviews,
      collectedInfo,
      balanceSelections,
      enhancedNegativeSelections,
      expandedKeywords,  // 🆕 키워드 전달 (프롬프트에 활용)
    );

    // 상위 N개 선택 (카테고리 불일치 제외, 리뷰 0개는 이미 사전 필터링됨)
    const validEvaluations = evaluations.filter(e => {
      if (e.score <= 0) return false; // 카테고리 불일치
      return true;
    });
    topNSelection = validEvaluations.slice(0, RECOMMENDATION_COUNT).map(e => ({
      pcode: e.pcode,
      briefReason: `${e.score}점 (회피:${e.avoidanceScore}) ${e.reason}`,
    }));

    console.log(`[FinalRecommend] 🆕 Top ${RECOMMENDATION_COUNT} by LLM eval:`, topNSelection.map(t => `${t.pcode}(${t.briefReason})`).join(', '));
  } else {
    // 기존 방식: 규칙 기반 사전 스크리닝 + LLM Top N 선정
    console.log(`[FinalRecommend] Using legacy rule-based prescreen`);

    // 50개 이상이면 사전 스크리닝으로 25개로 줄임
    let filteredCandidates = candidates;
    if (candidates.length > PRESCREEN_LIMIT) {
      filteredCandidates = prescreenCandidates(candidates, reviews, collectedInfo, negativeSelections, expandedKeywords, rankMap);
    }

    console.log(`[FinalRecommend] 2-Step Architecture: ${candidates.length} → ${filteredCandidates.length} candidates`);

    // Top N pcode 선정 (가벼운 호출)
    topNSelection = await selectTopNPcodes(
      categoryName,
      filteredCandidates,
      reviews,
      collectedInfo,
      balanceSelections,
      enhancedNegativeSelections,
      RECOMMENDATION_COUNT,
    );
  }

  // 선정된 pcode로 제품 찾기 (중복 pcode 제거!)
  const seenPcodes = new Set<string>();
  const selectedProducts: HardCutProduct[] = [];

  for (const sel of topNSelection) {
    // 이미 추가된 pcode는 스킵 (LLM이 중복 반환하는 경우 방지)
    if (seenPcodes.has(sel.pcode)) {
      console.log(`[FinalRecommend] ⚠️ 중복 pcode 제거: ${sel.pcode}`);
      continue;
    }
    // 🆕 candidates에서 찾기 (병렬 평가에서는 전체 후보에서 선정)
    const product = candidates.find(c => c.pcode === sel.pcode);
    if (product) {
      selectedProducts.push(product);
      seenPcodes.add(sel.pcode);
    }
  }

  // N개 미만이면 점수순으로 채우기
  if (selectedProducts.length < RECOMMENDATION_COUNT) {
    const remaining = candidates.filter(c => !seenPcodes.has(c.pcode));
    while (selectedProducts.length < RECOMMENDATION_COUNT && remaining.length > 0) {
      const next = remaining.shift()!;
      selectedProducts.push(next);
      seenPcodes.add(next.pcode);
    }
  }

  console.log(`[FinalRecommend] Step1 완료: ${selectedProducts.map((p: HardCutProduct) => p.pcode).join(', ')}`);

  return { selectedProducts, enhancedNegativeSelections };
}

export async function POST(request: NextRequest) {
  try {
    const body: FinalRecommendationRequest = await request.json();
    const {
      categoryKey,
      categoryName,
      candidates,
      reviews,
      collectedInfo,
      balanceSelections,
      negativeSelections,
    } = body;

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No candidates provided',
      });
    }

    console.log(`\n🏆 [FinalRecommend] Starting: ${candidates.length}개 후보 (최적화 아키텍처)`);
    const startTime = Date.now();
    const catName = categoryName || categoryKey;

    // ============================================================================
    // 0단계: 키워드 확장 + 자유 입력 분석 (1단계 LLM 평가에 필요)
    // ============================================================================
    const additionalCondition = collectedInfo?.['__additional_condition__'] || '';

    console.log(`[FinalRecommend] ⚡ Step 0: extractExpandedKeywords + analyzeFreeInput`);
    const step0StartTime = Date.now();

    const [expandedKeywords, freeInputAnalysisResult] = await Promise.all([
      // 키워드 확장 (LLM 평가 프롬프트용)
      extractExpandedKeywords(catName, collectedInfo || {}, negativeSelections || []),
      // 자유 입력 분석
      (additionalCondition && additionalCondition.trim().length >= 2)
        ? analyzeFreeInput(catName, additionalCondition)
        : Promise.resolve(null),
    ]);

    console.log(`[FinalRecommend] ⚡ Step 0 완료 (${Date.now() - step0StartTime}ms): Keywords prefer=${expandedKeywords.preferKeywords.length}, avoid=${expandedKeywords.avoidKeywords.length}`);
    if (freeInputAnalysisResult) {
      console.log(`[FinalRecommend] Free input analyzed:`, freeInputAnalysisResult);
    }

    // ============================================================================
    // 🆕 리뷰 0개 제품 사전 필터링 (LLM 호출 비용 절감)
    // - c.reviewCount는 knowledge_products_cache 테이블의 review_count 컬럼 값
    // ============================================================================
    const candidatesWithReviews = candidates.filter(c => (c.reviewCount || 0) > 0);
    const filteredOutCount = candidates.length - candidatesWithReviews.length;
    if (filteredOutCount > 0) {
      console.log(`[FinalRecommend] 🗑️ 리뷰 0개 제품 제외: ${filteredOutCount}개 (${candidates.length} → ${candidatesWithReviews.length})`);
    }

    // ============================================================================
    // 1단계: Top N 상품 선정 + FilterTags 생성 (병렬 실행) 🚀
    // ============================================================================
    console.log(`[FinalRecommend] ⚡ Step 1: LLM 평가 + FilterTags 병렬 시작`);
    const step1StartTime = Date.now();

    const [topProductsResult, filterTagsResult] = await Promise.all([
      // Top N 선정 (리뷰 있는 제품만 대상)
      selectTopProducts(
        catName,
        candidatesWithReviews,  // 🆕 리뷰 있는 제품만
        reviews || {},
        collectedInfo || {},
        balanceSelections || [],
        negativeSelections || [],
        expandedKeywords,
        freeInputAnalysisResult
      ),
      // 필터 태그 생성 (2단계에서 사용)
      generateFilterTags(
        catName,
        collectedInfo || {},
        balanceSelections || [],
        negativeSelections || [],
        null
      )
    ]);

    const { selectedProducts, enhancedNegativeSelections } = topProductsResult;
    console.log(`[FinalRecommend] ⚡ Step 1 완료 (${Date.now() - step1StartTime}ms): Top ${selectedProducts.length}, FilterTags ${filterTagsResult.length}개`);

    // 추천된 상품들의 pcode 추출
    const recommendedPcodes = selectedProducts.map((p: HardCutProduct) => p.pcode);

    console.log(`[FinalRecommend] Top ${RECOMMENDATION_COUNT} selected: ${recommendedPcodes.join(', ')}`);

    // ============================================================================
    // 2단계: 상세 이유 생성 + 스펙 정규화 + 장단점 생성 + 태그 충족도 평가 (병렬!)
    // 🚀 최적화: generateDetailedReasons와 나머지 3개 작업을 병렬로 실행
    // - normalizeSpecs, prosCons, tagScores는 selectedProducts(HardCutProduct[])만 필요
    // - generateDetailedReasons의 결과를 기다릴 필요 없음
    // ⚠️ Promise.allSettled로 일부 실패해도 나머지는 정상 처리
    // ============================================================================
    const parallelResults = await Promise.allSettled([
      // 상세 추천 이유 생성 (선정된 N개만) - 가장 오래 걸림 (~4.5초)
      generateDetailedReasons(
        catName,
        selectedProducts,
        reviews || {},
        collectedInfo || {},
        balanceSelections || [],
        enhancedNegativeSelections,
        freeInputAnalysisResult,
      ),
      // 스펙 정규화 (추천된 N개만) - HardCutProduct[]만 필요
      normalizeSpecsForComparison(
        selectedProducts,
        catName
      ),
      // 장단점 생성 (추천된 N개만) - HardCutProduct[]만 필요
      generateProsConsForProducts(
        selectedProducts,
        reviews || {},
        collectedInfo || {},
        catName
      ),
      // 태그 충족도 평가 (추천된 N개만) - HardCutProduct[]만 필요
      evaluateTagScoresForProducts(
        selectedProducts.map((p: HardCutProduct) => ({ pcode: p.pcode, product: p })),
        filterTagsResult,
        reviews || {},
        catName
      ),
    ]);

    // 안전하게 결과 추출 (실패 시 fallback 사용)
    const recommendations = parallelResults[0].status === 'fulfilled'
      ? parallelResults[0].value
      : selectedProducts.map((p: HardCutProduct, i: number) => ({
          rank: i + 1,
          pcode: p.pcode,
          product: p,
          reason: `${p.brand} ${p.name}`,
          oneLiner: `✨ ${p.brand} 제품`,
          highlights: p.matchedConditions?.slice(0, 3) || [],
        }));

    const normalizedSpecs = parallelResults[1].status === 'fulfilled'
      ? parallelResults[1].value
      : [];

    const prosConsResults = parallelResults[2].status === 'fulfilled'
      ? parallelResults[2].value
      : [];

    const rawTagScoresMap = parallelResults[3].status === 'fulfilled'
      ? parallelResults[3].value
      : {};

    // 🆕 상호 배타적 태그 후처리 (같은 질문에서 full 중복 제거)
    const tagScoresMap = enforceTagExclusivity(
      rawTagScoresMap,
      filterTagsResult,
      selectedProducts
    );

    // 실패한 작업 로깅
    parallelResults.forEach((result, i) => {
      if (result.status === 'rejected') {
        const taskNames = ['generateDetailedReasons', 'normalizeSpecs', 'prosCons', 'tagScores'];
        console.error(`[FinalRecommend] ⚠️ ${taskNames[i]} failed:`, result.reason);
      }
    });

    // ============================================================================
    // 결과 병합: 각 추천 상품에 정규화된 스펙, 장단점, 리뷰, 태그 충족도 추가
    // ============================================================================
    
    // ✅ Supabase에서 rank 조회 (pcode 기준)
    const recommendedPcodesForRank = recommendations.map((r: FinalRecommendation) => r.pcode);
    let rankMap: Record<string, number> = {};
    try {
      const { data: rankData } = await supabase
        .from('knowledge_products_cache')
        .select('pcode, rank')
        .in('pcode', recommendedPcodesForRank);

      if (rankData) {
        rankMap = Object.fromEntries(rankData.map((r: { pcode: string; rank: number }) => [r.pcode, r.rank]));
        console.log(`[FinalRecommend] ✅ DB rank 조회 완료:`, rankMap);
      }
    } catch (e) {
      console.error('[FinalRecommend] rank 조회 실패:', e);
    }

    const enrichedRecommendations = recommendations.map((rec: FinalRecommendation) => {
      // 장단점 찾기
      const prosConsData = prosConsResults.find(pc => pc.pcode === rec.pcode);

      // 정규화된 스펙 객체로 변환
      const normalizedSpecsObj: Record<string, string> = {};
      normalizedSpecs.forEach((spec) => {
        const value = spec.values[rec.pcode];
        if (value) {
          normalizedSpecsObj[spec.key] = value;
        }
      });

      // 해당 상품의 리뷰 목록
      const productReviews = reviews?.[rec.pcode] || [];

      // 🆕 태그 충족도 (LLM 평가 결과)
      const tagScores = tagScoresMap[rec.pcode] || {};

      return {
        ...rec,
        // ✅ Supabase에서 조회한 다나와 판매순위
        danawaRank: rankMap[rec.pcode] || null,
        // 정규화된 스펙 (비교표용)
        normalizedSpecs: normalizedSpecsObj,
        // LLM 생성 장단점 (비교표용)
        prosFromReviews: prosConsData?.pros || [],
        consFromReviews: prosConsData?.cons || [],
        // 리뷰 목록 (PLP 표시용)
        reviews: productReviews,
        // 태그 충족도 (full/partial/null)
        tagScores,
      };
    });

    // ============================================================================
    // 🆕 태그 충족도 기반 재정렬 (O > △ > X)
    // ============================================================================
    const calcTagScore = (tagScores: Record<string, unknown>): number => {
      let score = 0;
      for (const value of Object.values(tagScores)) {
        const status = typeof value === 'object' && value !== null ? (value as { score?: string }).score : value;
        if (status === 'full') score += 2;
        else if (status === 'partial') score += 1;
        // null = 0
      }
      return score;
    };

    // 태그 점수로 재정렬
    type EnrichedRec = (typeof enrichedRecommendations)[number];
    enrichedRecommendations.sort((a: EnrichedRec, b: EnrichedRec) => {
      const aScore = calcTagScore(a.tagScores || {});
      const bScore = calcTagScore(b.tagScores || {});
      return bScore - aScore; // 높은 점수가 앞으로
    });

    // rank 재부여
    enrichedRecommendations.forEach((rec: EnrichedRec, idx: number) => {
      rec.rank = idx + 1;
    });

    console.log(`[FinalRecommend] 🔄 태그 기반 재정렬 완료:`, enrichedRecommendations.map((r: EnrichedRec) => `${r.rank}위:${r.pcode}(태그${calcTagScore(r.tagScores || {})}점)`).join(', '));

    const elapsedMs = Date.now() - startTime;
    console.log(`✅ [FinalRecommend] 완료: Top ${recommendations.length} 선정 (${(elapsedMs / 1000).toFixed(1)}초)`);
    console.log(`   - 정규화된 스펙: ${normalizedSpecs.length}개 키`);
    console.log(`   - 장단점 생성: ${prosConsResults.length}개 상품`);

    // 응답에 정규화된 스펙 키 목록도 포함 (비교표 렌더링용)
    const response = {
      success: true,
      recommendations: enrichedRecommendations,
      summary: `${catName} 추천 Top ${recommendations.length}`,
      // 추가 데이터
      specKeys: normalizedSpecs.map(s => s.key),
      normalizedSpecs,
      // ✅ 추가: 자유 입력 분석 결과 (PDP 선호/회피 조건 표시용)
      freeInputAnalysis: freeInputAnalysisResult,
      // 🆕 필터 태그 (사용자 조건 기반 동적 생성)
      filterTags: filterTagsResult,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[FinalRecommend] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
