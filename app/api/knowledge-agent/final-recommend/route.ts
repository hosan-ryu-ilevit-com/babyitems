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
  FinalRecommendationResponse,
  ReviewLite,
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
  expandedKeywords?: ExpandedKeywords // 🆕 확장된 키워드 (flash-lite로 추출)
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
    // 리뷰 수 구간별 점수: 1-5개: 기본, 6-15개: 보너스, 16개 이상: 추가 보너스
    const reviewCount = productReviews.length;
    let reviewScore = 0;
    if (reviewCount >= 1) reviewScore += Math.min(reviewCount, 5) * 2; // 1-5개: 최대 10점
    if (reviewCount >= 6) reviewScore += Math.min(reviewCount - 5, 10) * 3; // 6-15개: 추가 최대 30점
    if (reviewCount >= 16) reviewScore += Math.min(reviewCount - 15, 10) * 1.5; // 16개 이상: 추가 최대 15점
    score += Math.min(reviewScore, 55); // 최대 55점 (기존 15점에서 대폭 상향)

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

    return { product: p, score };
  });

  // 점수순 정렬 후 상위 50개 반환
  scored.sort((a, b) => b.score - a.score);
  const topN = scored.slice(0, PRESCREEN_LIMIT).map(s => s.product);

  console.log(`[FinalRecommend] Pre-screened to ${topN.length} candidates`);
  return topN;
}

// ============================================================================
// 2단계 추천 시스템: 1단계(Top3 선정) + 2단계(상세 이유 생성)
// ============================================================================

/**
 * 1단계: Top 3 pcode 선정 (가벼운 호출)
 * - 입력: 후보 목록 (스펙 요약 + 리뷰 키워드만, 원문 제외)
 * - 출력: pcode 3개 + 간단한 선정 이유
 */
async function selectTop3Pcodes(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  negativeSelections: string[],
): Promise<{ pcode: string; briefReason: string }[]> {
  if (!ai) {
    return candidates.slice(0, 3).map(p => ({
      pcode: p.pcode,
      briefReason: `매칭 점수 ${p.matchScore}점`,
    }));
  }

  // 1단계는 가벼운 선정 작업이므로 flash-lite 사용 (속도 최적화)
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1500,
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

  const prompt = `## ${categoryName} Top 3 선정

## 사용자 조건
${Object.entries(collectedInfo).filter(([k]) => !k.startsWith('__')).map(([q, a]) => `- ${q}: ${a}`).join('\n') || '없음'}

## 우선순위: ${balanceSelections.map(b => b.selectedLabel).join(', ') || '없음'}
## 피할 단점: ${negativeSelections.join(', ') || '없음'}

## 후보 (${candidates.length}개)
${candidateInfo}

## 작업
사용자 조건에 가장 적합한 상품 3개를 선정하세요.
- 리뷰 평점/개수 + 스펙 매칭 + 사용자 우선순위 종합 고려
- 피할 단점과 관련된 상품은 제외

## 응답 (JSON만)
{"top3":[{"pcode":"코드1","briefReason":"선정이유(15자)"},{"pcode":"코드2","briefReason":"이유"},{"pcode":"코드3","briefReason":"이유"}]}`;

  try {
    console.log('[Step1] Selecting Top 3 pcodes...');
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.top3 && Array.isArray(parsed.top3) && parsed.top3.length > 0) {
        console.log(`[Step1] ✅ Top 3 selected in ${Date.now() - startTime}ms:`, parsed.top3.map((t: any) => t.pcode).join(', '));
        return parsed.top3;
      }
    }
  } catch (error) {
    console.error('[Step1] Error:', error);
  }

  console.log('[Step1] ⚠️ Fallback to score-based selection');
  return candidates.slice(0, 3).map(p => ({
    pcode: p.pcode,
    briefReason: `매칭 점수 ${p.matchScore}점`,
  }));
}

/**
 * 2단계: 상세 추천 이유 생성 (선정된 3개에 대해서만)
 * - 입력: 3개 상품 + 리뷰 원문 10개
 * - 출력: oneLiner, personalReason, highlights, concerns
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
      personalReason: '',
      highlights: p.matchedConditions?.slice(0, 3) || [],
    }));
  }

  const model = ai.getGenerativeModel({
    model: FINAL_RECOMMEND_MODEL,
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 4000,
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

  // 3개 상품 상세 정보 (리뷰 원문 10개 포함)
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

  const prompt = `## 역할
${categoryName} 구매 컨설턴트로서 선정된 Top 3 상품의 **맞춤형 추천 이유**를 작성합니다.

## 사용자 프로필
### 질문 응답
${Object.entries(collectedInfo).filter(([k]) => !k.startsWith('__')).map(([q, a]) => `- ${q}: ${a}`).join('\n') || '없음'}

### 우선순위
${balanceSelections.map(b => `- ${b.selectedLabel}`).join('\n') || '없음'}

### 피할 단점
${negativeSelections.join(', ') || '없음'}
${freeInputSection}

## 선정된 Top 3 상품
${productDetails}

## 작성 규칙

### oneLiner (한줄 평) - 45~70자
- 이모지 + 핵심 강점 + 리뷰 인용
- 예: 🤫 **밤잠 예민한 분들도 걱정 없는 정숙함!** "숨소리보다 조용해요"라는 평이 압도적!

### personalReason (추천 이유) - 40~60자
- 사용자 조건과 제품 스펙/리뷰가 **실제로 매칭**되는 부분만 언급
- 예: 소음이 중요하다고 하셨는데, 수면풍 모드가 있어 딱이에요.

### highlights - 장점 3개
- "**키워드**: 설명" 형식

### concerns - 주의점 1-2개 (있다면)

## 🚫 금지 패턴
- "실제 사용자들이...라고 평가한 제품입니다"
- "리뷰에 따르면..."
- 제품에 없는 기능을 있는 것처럼 언급

## 응답 (JSON만)
{"recommendations":[{"rank":1,"pcode":"코드","oneLiner":"한줄평","personalReason":"추천이유","highlights":["장점1","장점2","장점3"],"concerns":["주의점"]}]}`;

  try {
    console.log('[Step2] Generating detailed reasons for 3 products...');
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

        return parsed.recommendations.map((rec: any, i: number) => {
          const product = selectedProducts.find(p => p.pcode === rec.pcode) || selectedProducts[i];
          const oneLiner = rec.oneLiner || '';
          const personalReason = rec.personalReason || '';

          return {
            rank: rec.rank || i + 1,
            pcode: rec.pcode || product?.pcode,
            product,
            reason: `${oneLiner} ${personalReason}`.trim(),
            oneLiner,
            personalReason,
            highlights: rec.highlights || [],
            concerns: rec.concerns,
            bestFor: rec.bestFor,
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
    personalReason: '',
    highlights: p.matchedConditions?.slice(0, 3) || [],
  }));
}

/**
 * LLM으로 Top 3 선정 (2단계 아키텍처)
 * - 1단계: Top 3 pcode 선정 (가벼운 호출, ~3초)
 * - 2단계: 상세 추천 이유 생성 (무거운 호출, ~5초)
 */
async function generateRecommendations(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  negativeSelections: string[],
  expandedKeywords?: ExpandedKeywords,
  freeInputAnalysis?: FreeInputAnalysis | null
): Promise<FinalRecommendation[]> {
  // 50개 이상이면 사전 스크리닝으로 25개로 줄임
  let filteredCandidates = candidates;
  if (candidates.length > PRESCREEN_LIMIT) {
    filteredCandidates = prescreenCandidates(candidates, reviews, collectedInfo, negativeSelections, expandedKeywords);
  }

  // 자유 입력에서 추출한 피할 단점을 negativeSelections에 추가
  const enhancedNegativeSelections = [...negativeSelections];
  if (freeInputAnalysis?.avoidAttributes?.length) {
    enhancedNegativeSelections.push(...freeInputAnalysis.avoidAttributes);
    console.log(`[FinalRecommend] Added ${freeInputAnalysis.avoidAttributes.length} avoid attributes from free input`);
  }

  console.log(`[FinalRecommend] 2-Step Architecture: ${candidates.length} → ${filteredCandidates.length} candidates`);

  // ============================================================================
  // 1단계: Top 3 pcode 선정 (가벼운 호출)
  // ============================================================================
  const top3Selection = await selectTop3Pcodes(
    categoryName,
    filteredCandidates,
    reviews,
    collectedInfo,
    balanceSelections,
    enhancedNegativeSelections,
  );

  // 선정된 pcode로 제품 찾기
  const selectedProducts = top3Selection
    .map(sel => filteredCandidates.find(c => c.pcode === sel.pcode))
    .filter((p): p is HardCutProduct => p !== undefined);

  // 3개 미만이면 점수순으로 채우기
  if (selectedProducts.length < 3) {
    const existingPcodes = new Set(selectedProducts.map(p => p.pcode));
    const remaining = filteredCandidates.filter(c => !existingPcodes.has(c.pcode));
    while (selectedProducts.length < 3 && remaining.length > 0) {
      selectedProducts.push(remaining.shift()!);
    }
  }

  console.log(`[FinalRecommend] Step1 완료: ${selectedProducts.map(p => p.pcode).join(', ')}`);

  // ============================================================================
  // 2단계: 상세 추천 이유 생성 (선정된 3개만)
  // ============================================================================
  const recommendations = await generateDetailedReasons(
    categoryName,
    selectedProducts,
    reviews,
    collectedInfo,
    balanceSelections,
    enhancedNegativeSelections,
    freeInputAnalysis,
  );

  return recommendations;
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
    // 0단계: 키워드 확장 + 자유 입력 분석 (병렬 실행) 🚀
    // ============================================================================
    const additionalCondition = collectedInfo?.['__additional_condition__'] || '';

    console.log(`[FinalRecommend] ⚡ Starting parallel: extractExpandedKeywords + analyzeFreeInput`);
    const parallelStartTime = Date.now();

    const [expandedKeywords, freeInputAnalysisResult] = await Promise.all([
      // 키워드 확장 (prescreening용)
      extractExpandedKeywords(catName, collectedInfo || {}, negativeSelections || []),
      // 자유 입력 분석
      (additionalCondition && additionalCondition.trim().length >= 2)
        ? analyzeFreeInput(catName, additionalCondition)
        : Promise.resolve(null)
    ]);

    console.log(`[FinalRecommend] ⚡ Parallel completed in ${Date.now() - parallelStartTime}ms`);
    console.log(`[FinalRecommend] Keywords: prefer=${expandedKeywords.preferKeywords.length}, avoid=${expandedKeywords.avoidKeywords.length}`);
    if (freeInputAnalysisResult) {
      console.log(`[FinalRecommend] Free input analyzed:`, freeInputAnalysisResult);
    }

    // ============================================================================
    // 1단계: LLM으로 Top 3 선정 (120개 → 25개 사전 스크리닝 → Top 3)
    // ============================================================================
    const recommendations = await generateRecommendations(
      catName,
      candidates,
      reviews || {},
      collectedInfo || {},
      balanceSelections || [],
      negativeSelections || [],
      expandedKeywords,        // 🆕 병렬로 미리 계산된 키워드
      freeInputAnalysisResult  // 🆕 병렬로 미리 분석된 자유입력
    );

    // 추천된 상품들의 pcode 추출
    const recommendedPcodes = recommendations.map(r => r.pcode);
    const recommendedProducts = recommendations.map(r => r.product).filter(Boolean);

    console.log(`[FinalRecommend] Top 3 selected: ${recommendedPcodes.join(', ')}`);

    // ============================================================================
    // 2단계: 추천된 3개에 대해서만 스펙 정규화 + 장단점 생성 (병렬)
    // ============================================================================
    const [normalizedSpecs, prosConsResults] = await Promise.all([
      // 스펙 정규화 (추천된 3개만)
      normalizeSpecsForComparison(
        recommendedProducts as HardCutProduct[],
        catName
      ),
      // 장단점 생성 (추천된 3개만)
      generateProsConsForProducts(
        recommendedProducts as HardCutProduct[],
        reviews || {},
        collectedInfo || {},
        catName
      ),
    ]);

    // ============================================================================
    // 결과 병합: 각 추천 상품에 정규화된 스펙, 장단점, 리뷰 추가
    // ============================================================================
    
    // ✅ Supabase에서 rank 조회 (pcode 기준)
    const recommendedPcodesForRank = recommendations.map(r => r.pcode);
    let rankMap: Record<string, number> = {};
    try {
      const { data: rankData } = await supabase
        .from('knowledge_products_cache')
        .select('pcode, rank')
        .in('pcode', recommendedPcodesForRank);
      
      if (rankData) {
        rankMap = Object.fromEntries(rankData.map(r => [r.pcode, r.rank]));
        console.log(`[FinalRecommend] ✅ DB rank 조회 완료:`, rankMap);
      }
    } catch (e) {
      console.error('[FinalRecommend] rank 조회 실패:', e);
    }
    
    const enrichedRecommendations = recommendations.map((rec) => {
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

      return {
        ...rec,
        // ✅ Supabase에서 조회한 다나와 판매순위
        danawaRank: rankMap[rec.pcode] || null,
        // 정규화된 스펙 (비교표용)
        normalizedSpecs: normalizedSpecsObj,
        // LLM 생성 장단점
        prosFromReviews: prosConsData?.pros || rec.highlights || [],
        consFromReviews: prosConsData?.cons || rec.concerns || [],
        // 리뷰 목록 (PLP 표시용)
        reviews: productReviews,
      };
    });

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
