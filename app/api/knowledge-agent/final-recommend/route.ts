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

// 모델 상수
const FINAL_RECOMMEND_MODEL = 'gemini-2.5-flash-lite'; // 최종 추천용
const SPEC_NORMALIZE_MODEL = 'gemini-2.5-flash-lite'; // 스펙 정규화용
const PROS_CONS_MODEL = 'gemini-2.5-flash-lite'; // 장단점 생성용

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
      `[리뷰${i+1}] ${r.rating}점: "${r.content.slice(0, 100)}${r.content.length > 100 ? '...' : ''}"`
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
const PRESCREEN_LIMIT = 50;

function prescreenCandidates(
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  negativeSelections: string[]
): HardCutProduct[] {
  console.log(`[FinalRecommend] Pre-screening ${candidates.length} candidates...`);

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

    // 4. 피하고 싶은 단점 체크 (스펙에서 키워드 매칭)
    const specText = (p.specSummary || '').toLowerCase();
    const reviewText = productReviews.map(r => r.content).join(' ').toLowerCase();
    for (const neg of negativeSelections) {
      const negLower = neg.toLowerCase();
      if (specText.includes(negLower) || reviewText.includes(negLower)) {
        score -= 10; // 단점 언급 시 감점
      }
    }

    // 5. 사용자 조건 매칭
    for (const [, value] of Object.entries(collectedInfo)) {
      const valueStr = Array.isArray(value)
        ? value.join(' ')
        : (typeof value === 'string' ? value : String(value || ''));
      const valueLower = valueStr.toLowerCase();
      if (valueLower && specText.includes(valueLower)) {
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

/**
 * LLM으로 Top 3 선정 (새 아키텍처: 120개 → 30개 사전 스크리닝 → Top 3)
 * - 대량 후보 처리를 위해 2단계 필터링
 */
async function generateRecommendations(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  negativeSelections: string[]
): Promise<FinalRecommendation[]> {
  // 50개 이상이면 사전 스크리닝으로 50개로 줄임
  let filteredCandidates = candidates;
  if (candidates.length > PRESCREEN_LIMIT) {
    filteredCandidates = prescreenCandidates(candidates, reviews, collectedInfo, negativeSelections);
  }
  
  // 리뷰가 있는지 확인
  const hasReviews = Object.keys(reviews).length > 0 && 
    Object.values(reviews).some(r => r.length > 0);
  
  console.log(`[FinalRecommend] Candidates: ${candidates.length} → ${filteredCandidates.length}, Reviews: ${hasReviews}`);
  
  if (!ai) {
    // AI 없으면 점수 기반 정렬
    return filteredCandidates.slice(0, 3).map((p, i) => ({
      rank: i + 1,
      pcode: p.pcode,
      product: p,
      reason: `스펙 매칭 점수 ${p.matchScore}점으로 상위에 선정되었습니다.`,
      highlights: p.matchedConditions?.slice(0, 3) || [],
    }));
  }

  // 최신 모델 사용
  const model = ai.getGenerativeModel({
    model: FINAL_RECOMMEND_MODEL,
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 4000, // 3개 추천 + 상세 정보를 위해 충분히 확보
      responseMimeType: 'application/json',
    },
  });
  
  console.log(`[FinalRecommend] Using model: ${FINAL_RECOMMEND_MODEL}`);

  // 후보 상품 정보 구성 (리뷰 있으면 정성적 분석 포함, 없으면 스펙만)
  const candidateInfo = filteredCandidates.map((p, i) => {
    const productReviews = reviews[p.pcode] || [];
    
    // 기본 정보 (항상 포함)
    let info = `
### ${i + 1}. ${p.brand} ${p.name} (pcode: ${p.pcode})
━━━━━━━━━━━━━━━━━━━━━━━━━━
**기본 정보**
- 가격: ${p.price?.toLocaleString()}원
- 스펙 매칭 점수: ${p.matchScore}점
- 매칭된 조건: ${p.matchedConditions?.join(', ') || '없음'}
- 스펙: ${p.specSummary || '정보 없음'}`;

    // 리뷰가 있으면 간결한 요약만 추가 (프롬프트 경량화)
    if (productReviews.length > 0) {
      const { pros, cons } = extractReviewKeywords(productReviews);
      const qualitative = analyzeReviewsQualitative(productReviews);

      const sentimentLabel = qualitative.sentimentScore > 0.3 ? '😊매우긍정'
        : qualitative.sentimentScore > 0 ? '🙂긍정적'
        : qualitative.sentimentScore > -0.3 ? '😐보통'
        : '😟부정적';

      // 핵심 리뷰 1개만 (가장 도움되는 리뷰)
      const topReview = productReviews[0];
      const reviewSnippet = topReview ? `"${topReview.content.slice(0, 80)}..."` : '';

      info += `
- 리뷰: ${productReviews.length}개, ${qualitative.avgRating}점, ${sentimentLabel}
- 장점: ${pros.slice(0, 3).join(', ') || '없음'} / 단점: ${cons.slice(0, 2).join(', ') || '없음'}
- 대표리뷰: ${reviewSnippet}`;
    }
    
    return info;
  }).join('\n\n');

  // 리뷰 유무에 따라 다른 프롬프트 사용
  const reviewRules = hasReviews ? `
### 1️⃣ 리뷰 정성 분석 우선
- **감정 점수가 높은 상품** (😊매우긍정 > 🙂긍정적) 우선
- **리뷰 신뢰도가 높은 상품** (80% 이상) 우선
- 별점 분포가 고르고 평균이 높은 상품 우선
- "핵심 인사이트"의 👍긍정 리뷰가 많은 상품 우선

### 2️⃣ 단점 회피 (리뷰 기반)
- 피하고 싶다고 한 단점이 **리뷰에서 실제로 언급**되면 강력 감점
- 핵심 인사이트에 ⚠️부정 리뷰가 많으면 감점

### 3️⃣ 리뷰 원문 인용 필수
- reason에 **실제 리뷰 내용을 "따옴표"로 인용**하세요
- 추상적 표현 금지, 구체적인 사용자 경험 인용` : `
### 1️⃣ 스펙 매칭 점수 우선
- **스펙 매칭 점수가 높은 상품** 우선
- 매칭된 조건이 많은 상품 우선

### 2️⃣ 사용자 선택 기반 필터링
- 밸런스 게임에서 선택한 가치와 스펙이 부합하는 상품 우선
- 피하고 싶은 단점과 관련된 스펙이 있으면 감점

### 3️⃣ 스펙 기반 설명
- reason에 **구체적인 스펙을 인용**하세요
- 예: "3L 대용량으로 가족 단위 사용에 적합합니다"`;

  const prompt = `## 역할
  당신은 ${categoryName} 구매 전문 컨설턴트입니다.
  ${hasReviews ? '**리뷰 데이터를 정성적으로 분석**하여' : '**스펙과 사용자 선택을 기반으로**'} 최적의 상품 3개를 추천해주세요.

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ## 👤 사용자 프로필
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ### 질문 응답
  ${Object.entries(collectedInfo).map(([q, a]) => `- ${q}: ${a}`).join('\n') || '없음'}

  ### 우선순위 (밸런스 게임)
  ${balanceSelections.map(b => `- ${b.selectedLabel}`).join('\n') || '없음'}

  ### 피하고 싶은 단점
  ${negativeSelections.join(', ') || '없음'}

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ## 📦 후보 상품 ${hasReviews ? '+ 리뷰 분석' : '(스펙 기반)'} (${filteredCandidates.length}개 / 전체 ${candidates.length}개 중 사전 스크리닝)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${candidateInfo}

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ## 🎯 추천 규칙 (엄격히 준수!)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ${reviewRules}

  ### 4️⃣ 사용자 우선순위 반영
  - 밸런스 게임에서 선택한 가치와 매칭되는 상품 우선
  - 질문 응답에서 표현한 니즈와 부합하는 상품 우선

  ### 5️⃣ 다양성 확보
  - 가능하면 다른 가격대/브랜드를 포함해 3가지 선택지 제공

  ### 6️⃣ 맞춤형 추천 이유 - 구매 확신 주기 ⚠️ 가장 중요!
  - **목표:** 사용자가 선택한 조건이 이 제품에서 **어떻게 완벽하게 구현되는지** 증명하여 구매를 확신시킵니다.
  - **작성 톤:** 쇼핑 큐레이터가 옆에서 귓속말하듯 신뢰감 있고 간결하게.

  ### ⚠️ 필수: 두 부분으로 나누어 작성 (반드시 지켜야 함!)
  추천 이유는 반드시 **oneLiner**와 **personalReason** 두 필드를 모두 포함해야 합니다.

  1. **oneLiner (한줄 평):** 이모지 + 제품의 핵심 강점/리뷰 인용
     - 형식: "🎯 **키워드**: 리뷰 기반 강점 설명"
     - 길이: 40~60자

  2. **personalReason (추천 이유):** 왜 "이 사용자에게" 이 제품이 딱인지 (절대 생략 금지)
     - 사용자가 선택한 조건(예산, 밸런스 게임, 피하고 싶은 단점)을 자연스럽게 언급
     - 형식: "~님처럼 ~을/를 중요하게 여기시면 딱이에요" 또는 "~하신다고 하셨는데, 이 제품이 그 부분에서 최고예요"
     - 길이: 40~60자

  - **필수 요소:**
    1. **oneLiner - 이모지 + 리뷰 기반 강점:** 문장 시작에 관련 이모지 하나, 그리고 리뷰에서 추출한 구체적 칭찬 포인트
    2. **personalReason - User Context 기반 맞춤 추천:** 사용자가 선택한 핵심 가치(예: 세척, 소음, 예산)를 직접 언급하며 "왜 당신에게 맞는지" 설명

  - **🚫 절대 금지 패턴 (이 패턴이 보이면 0점 처리):**
    - "실제 사용자들이 '...'라고 평가한 제품입니다" ❌
    - "리뷰에 따르면..." ❌
    - "당신은 ~를 선택했으므로" ❌ (너무 딱딱함)
    - "~해서 추천합니다" / "~이기 때문에 추천해요" ❌
    - 리뷰 원문만 따옴표로 나열하기 ❌

  - **✅ Good 예시:**
    - **oneLiner:** 🤫 **소리에 민감한 아기도 꿀잠!** "숨소리보다 조용해서 켜둔 줄도 몰랐다"는 평이 압도적이에요.
    - **personalReason:** 밤중 수유가 잦다고 하셨는데, 이 정도 정숙성이면 아기 깨울 걱정 없으실 거예요.

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ## 📤 응답 형식 (JSON만)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  {
    "recommendations": [
      {
        "rank": 1,
        "pcode": "상품코드",
        "oneLiner": "🧼 **매일 닦는 게 일인 육아맘 필수템.** \"통세척 가능해서 물때 걱정 싹 사라졌다\"는 극찬!",
        "personalReason": "세척 편의성을 중요하게 생각하신다고 하셨는데, 분리세척까지 되니 딱이에요.",
        "highlights": ["리뷰에서 자주 언급된 장점 1", "장점 2", "장점 3"],
        "concerns": ["리뷰에서 언급된 주의점 (있다면)"],
        "bestFor": "이런 분께 추천 (사용자 프로필 기반)",
        "reviewQuotes": ["실제 리뷰 인용 1 (30자 내외)", "실제 리뷰 인용 2"],
        "reviewScore": { "sentiment": 0.5, "reliability": 0.8 }
      }
    ],
    "summary": "전체 추천 요약 (리뷰 분석 기반, 1-2문장)"
  }

  ⚠️ JSON 포맷을 정확히 지키세요.
  ⚠️ oneLiner와 personalReason 필드는 필수입니다.
  ⚠️ "실제 사용자들이...라고 평가한 제품입니다" 같은 형식 절대 금지!
  ⚠️ 리뷰가 없거나 부실한 상품은 순위를 낮추세요`;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();

    console.log('[FinalRecommend] LLM raw response length:', text.length);

    // markdown 코드 블록 제거
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // JSON 추출 (불완전한 JSON도 처리 - 여는 괄호만 있어도 매칭)
    let jsonMatch = text.match(/\{[\s\S]*\}/);

    // 닫는 괄호가 없는 불완전한 JSON도 처리
    if (!jsonMatch) {
      const openBraceIdx = text.indexOf('{');
      if (openBraceIdx !== -1) {
        // 여는 괄호부터 끝까지 가져옴
        jsonMatch = [text.slice(openBraceIdx)];
        console.log('[FinalRecommend] 불완전한 JSON 감지, 복구 시도...');
      }
    }

    if (jsonMatch) {
      let recommendations: any[] = [];
      let parseSuccess = false;

      // 1차: 직접 파싱 시도
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        recommendations = parsed.recommendations || [];
        parseSuccess = recommendations.length > 0;
        if (parseSuccess) console.log('[FinalRecommend] ✅ 1차 직접 파싱 성공');
      } catch {
        console.log('[FinalRecommend] 1차 파싱 실패, 간단한 정리 후 재시도...');
      }

      // 2차: 간단한 문자열 정리 후 재시도
      if (!parseSuccess) {
        try {
          const cleanedJSON = repairJSON(jsonMatch[0]);
          const parsed = JSON.parse(cleanedJSON);
          recommendations = parsed.recommendations || [];
          parseSuccess = recommendations.length > 0;
          if (parseSuccess) console.log('[FinalRecommend] ✅ 2차 정리 후 파싱 성공');
        } catch {
          console.log('[FinalRecommend] 2차 정리 후 파싱 실패, Flash Lite 복구 시도...');
        }
      }

      // 3차: Flash Lite로 JSON 형식 복구 (원본 내용 유지)
      if (!parseSuccess) {
        try {
          const repairedResult = await repairJSONWithFlashLite(jsonMatch[0]);
          if (repairedResult && repairedResult.recommendations) {
            recommendations = repairedResult.recommendations;
            parseSuccess = recommendations.length > 0;
            if (parseSuccess) console.log(`[FinalRecommend] ✅ Flash Lite 복구 성공: ${recommendations.length}개`);
          }
        } catch (flashError) {
          console.error('[FinalRecommend] Flash Lite 복구 실패:', flashError);
        }
      }

      if (parseSuccess && recommendations.length > 0) {
        console.log('[FinalRecommend] ✅ 추천 생성 성공:', recommendations.length);

        // 결과 구성
        // ✅ 디버그: LLM 응답에서 personalReason 확인
        console.log('[FinalRecommend] LLM recommendations:', recommendations.map((r: any) => ({
          pcode: r.pcode,
          oneLiner: r.oneLiner?.slice(0, 30),
          personalReason: r.personalReason?.slice(0, 30),
          reason: r.reason?.slice(0, 30),
        })));

        const llmResults = recommendations.slice(0, 3).map((rec: any, i: number) => {
          const product = filteredCandidates.find(c => c.pcode === rec.pcode);

          // oneLiner, personalReason 결합하여 reason 생성 (호환성용)
          const oneLiner = rec.oneLiner || '';
          const personalReason = rec.personalReason || '';
          const combinedReason = `${oneLiner} ${personalReason}`.trim();

          // reason 검증: 금지 패턴이면 재작성
          const forbiddenPatterns = [
            /실제 사용자들이.*라고 평가/,
            /리뷰에 따르면/,
            /당신은.*선택했으므로/,
            /추천합니다\s*$/,
          ];
          const hasForbiddenPattern = forbiddenPatterns.some(p => p.test(combinedReason));
          if (hasForbiddenPattern || combinedReason.length < 20) {
            console.log(`[FinalRecommend] ⚠️ reason 품질 낮음 (${i+1}위), 원본:`, combinedReason.slice(0, 50));
          }

          if (!product) {
            // pcode가 없으면 순서대로 매핑
            const fallbackProduct = filteredCandidates[i];
            return {
              rank: i + 1,
              pcode: fallbackProduct?.pcode || '',
              product: fallbackProduct,
              reason: combinedReason,
              oneLiner,
              personalReason,
              highlights: rec.highlights || [],
              concerns: rec.concerns,
              bestFor: rec.bestFor,
              reviewQuotes: rec.reviewQuotes || [],
            };
          }

          return {
            rank: rec.rank || i + 1,
            pcode: rec.pcode,
            product,
            reason: combinedReason,
            oneLiner,
            personalReason,
            highlights: rec.highlights || [],
            concerns: rec.concerns,
            bestFor: rec.bestFor,
            reviewQuotes: rec.reviewQuotes || [],
          };
        });

        // 3개 미만이면 폴백으로 나머지 채우기
        if (llmResults.length < 3) {
          console.log(`[FinalRecommend] ⚠️ ${llmResults.length}개만 생성됨, 나머지 폴백으로 채움`);
          const existingPcodes = new Set(llmResults.map(r => r.pcode));
          const remainingCandidates = filteredCandidates.filter(c => !existingPcodes.has(c.pcode));

          for (let i = llmResults.length; i < 3 && remainingCandidates.length > 0; i++) {
            const p = remainingCandidates.shift()!;
            const productReviews = reviews[p.pcode] || [];
            const sampleQuotes = productReviews.slice(0, 2).map(r => r.content.slice(0, 50));
            const specs = p.specSummary || '';
            const brand = p.brand || '';

            const fallbackOneLiner = specs
              ? `✨ ${brand} 제품, ${specs.slice(0, 50)}${specs.length > 50 ? '...' : ''}`
              : `✨ ${brand || '해당'} 제품이 조건에 부합합니다.`;

            llmResults.push({
              rank: i + 1,
              pcode: p.pcode,
              product: p,
              reason: fallbackOneLiner,
              oneLiner: fallbackOneLiner,
              personalReason: '',
              highlights: p.matchedConditions?.slice(0, 3) || [],
              concerns: undefined,
              bestFor: undefined,
              reviewQuotes: sampleQuotes,
            });
          }
        }

        return llmResults;
      } // if (recommendations.length > 0)
    } else {
      console.error('[FinalRecommend] ❌ JSON 추출 실패, response:', text.slice(0, 200));
    }
  } catch (error) {
    console.error('[FinalRecommend] LLM error:', error);
  }

  console.log('[FinalRecommend] ⚠️ 폴백 사용됨');

  // 실패 시 점수 기반 정렬 - 개선된 폴백
  return filteredCandidates.slice(0, 3).map((p, i) => {
    const productReviews = reviews[p.pcode] || [];
    const sampleQuotes = productReviews.slice(0, 2).map(r => r.content.slice(0, 50));

    // 개선된 폴백 reason: 스펙 기반으로 작성
    const specs = p.specSummary || '';
    const brand = p.brand || '';
    const fallbackOneLiner = specs
      ? `${brand} 제품으로, ${specs.slice(0, 60)}${specs.length > 60 ? '...' : ''}`
      : `${brand || '해당'} 제품이 요청하신 조건에 가장 부합합니다.`;

    return {
      rank: i + 1,
      pcode: p.pcode,
      product: p,
      reason: fallbackOneLiner,
      oneLiner: fallbackOneLiner,
      personalReason: '',
      highlights: p.matchedConditions?.slice(0, 3) || [],
      reviewQuotes: sampleQuotes,
    };
  });
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

    console.log(`\n🏆 [FinalRecommend] Starting: ${candidates.length}개 후보 (새 아키텍처)`);
    const startTime = Date.now();
    const catName = categoryName || categoryKey;

    // ============================================================================
    // 1단계: LLM으로 Top 3 선정 (120개 → 30개 사전 스크리닝 → Top 3)
    // ============================================================================
    const recommendations = await generateRecommendations(
      catName,
      candidates,
      reviews || {},
      collectedInfo || {},
      balanceSelections || [],
      negativeSelections || []
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
