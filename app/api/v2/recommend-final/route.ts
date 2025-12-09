/**
 * V2 최종 추천 API - LLM 기반 Top 3 선정 + 추천 이유 생성
 * POST /api/v2/recommend-final
 *
 * 기존 score API의 점수 기반 정렬 대신, LLM이 사용자 상황을 종합적으로 분석하여
 * 최적의 Top 3 제품을 선정하고 개인화된 추천 이유를 생성합니다.
 *
 * 입력:
 * - categoryKey: 카테고리 키
 * - candidateProducts: 점수 계산이 완료된 후보 상품들 (상위 10~20개 권장)
 * - userContext: 사용자 선택 정보
 *   - hardFilterAnswers: 하드 필터 응답
 *   - balanceSelections: 밸런스 게임 선택 (rule_key 배열)
 *   - negativeSelections: 단점 필터 선택 (rule_key 배열)
 * - budget: { min, max }
 *
 * 출력:
 * - top3Products: 최종 Top 3 제품 (추천 이유 포함)
 * - selectionReason: 전체 선정 기준 설명
 * - generated_by: 'llm' | 'fallback'
 */

import { NextRequest, NextResponse } from 'next/server';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import { getModel, callGeminiWithRetry, parseJSONResponse, isGeminiAvailable } from '@/lib/ai/gemini';
import type { CategoryInsights } from '@/types/category-insights';

// 후보 상품 타입
interface CandidateProduct {
  pcode: string;
  title: string;
  brand?: string | null;
  price?: number | null;
  rank?: number | null;
  thumbnail?: string | null;
  spec?: Record<string, unknown>;
  filter_attrs?: Record<string, string>;  // 상품 필터 속성 (재질, 타입 등)
  baseScore?: number;
  negativeScore?: number;
  totalScore?: number;
  matchedRules?: string[];
}

// 사용자 컨텍스트 타입
interface UserContext {
  hardFilterAnswers?: Record<string, string[]>;
  balanceSelections?: string[];
  negativeSelections?: string[];
}

// 요청 타입
interface RecommendFinalRequest {
  categoryKey: string;
  candidateProducts: CandidateProduct[];
  userContext?: UserContext;
  budget?: { min: number; max: number };
}

// 추천 제품 타입 (이유 포함)
interface RecommendedProduct extends CandidateProduct {
  recommendationReason: string;
  matchedPreferences: string[];
  rank: number;
}

// 응답 타입
interface RecommendFinalResponse {
  success: boolean;
  data?: {
    categoryKey: string;
    categoryName: string;
    top3Products: RecommendedProduct[];
    selectionReason: string;
    generated_by: 'llm' | 'fallback';
    totalCandidates: number;
  };
  error?: string;
}

/**
 * 밸런스 선택을 자연어로 변환
 */
function formatBalanceSelections(selections: string[]): string {
  const descriptions: Record<string, string> = {
    // 예시 매핑 (실제로는 logic_map에서 description을 가져올 수 있음)
    'rule_bottle_lightweight': '가벼운 제품 선호',
    'rule_bottle_durable': '내구성 있는 제품 선호',
    'rule_pot_warm_fast': '빠른 가열 선호',
    'rule_pot_temp_accurate': '정확한 온도 조절 선호',
    // ... 더 많은 매핑
  };

  return selections
    .map(key => descriptions[key] || key.replace(/^rule_\w+_/, '').replace(/_/g, ' '))
    .join(', ');
}

/**
 * 단점 필터 선택을 자연어로 변환
 */
function formatNegativeSelections(selections: string[]): string {
  return selections
    .map(key => key.replace(/^rule_\w+_/, '').replace(/_/g, ' '))
    .join(', ');
}

/**
 * 상품 정보를 LLM 프롬프트용 문자열로 변환 (스펙 데이터 강화)
 */
function formatProductForPrompt(product: CandidateProduct, index: number): string {
  // 스펙 정보 포맷팅 (중요한 항목 우선)
  let specStr = '스펙 정보 없음';
  if (product.spec) {
    const priorityKeys = ['용량', '무게', '재질', '크기', '온도', '기능', '타입', '소비전력'];
    const prioritySpecs: string[] = [];
    const otherSpecs: string[] = [];

    Object.entries(product.spec).forEach(([k, v]) => {
      if (!v || v === '' || v === '-') return;
      const isPriority = priorityKeys.some(pk => k.includes(pk));
      const specItem = `${k}: ${v}`;
      if (isPriority) {
        prioritySpecs.push(specItem);
      } else {
        otherSpecs.push(specItem);
      }
    });

    const allSpecs = [...prioritySpecs.slice(0, 6), ...otherSpecs.slice(0, 4)];
    if (allSpecs.length > 0) {
      specStr = allSpecs.join(', ');
    }
  }

  // 매칭 규칙 포맷팅
  const matchedRulesStr = product.matchedRules && product.matchedRules.length > 0
    ? product.matchedRules.map(r => r.replace('체감속성_', '').replace(/_/g, ' ')).join(', ')
    : '없음';

  return `[상품 ${index + 1}] pcode: ${product.pcode}
- 제품명: ${product.title}
- 브랜드: ${product.brand || '미상'}
- 가격: ${product.price ? `${product.price.toLocaleString()}원` : '가격 미정'}
- 인기순위: ${product.rank || '미정'}위
- 선호도점수: ${product.totalScore || 0}점
- 매칭된 선호조건: ${matchedRulesStr}
- 상세스펙: ${specStr}`;
}

/**
 * LLM을 사용하여 Top 3 선정 및 추천 이유 생성
 */
async function selectTop3WithLLM(
  categoryKey: string,
  categoryName: string,
  insights: CategoryInsights,
  candidates: CandidateProduct[],
  userContext: UserContext,
  budget: { min: number; max: number }
): Promise<{
  top3Products: RecommendedProduct[];
  selectionReason: string;
}> {
  const model = getModel(0.4); // 낮은 temperature로 일관된 결과

  // 사용자 선택 요약
  const hardFilterSummary = userContext.hardFilterAnswers
    ? Object.entries(userContext.hardFilterAnswers)
        .map(([key, values]) => `${key}: ${values.join(', ')}`)
        .join('\n')
    : '선택 없음';

  const balanceSummary = userContext.balanceSelections?.length
    ? formatBalanceSelections(userContext.balanceSelections)
    : '선택 없음';

  const negativeSummary = userContext.negativeSelections?.length
    ? formatNegativeSelections(userContext.negativeSelections)
    : '선택 없음';

  // 카테고리 인사이트에서 핵심 정보 추출
  const topPros = insights.pros.slice(0, 5).map(p => `- ${p.text}`).join('\n');
  const topCons = insights.cons.slice(0, 5).map(c => `- ${c.text}`).join('\n');

  // 후보 상품 목록
  const candidatesStr = candidates
    .slice(0, 15) // 최대 15개 후보
    .map((p, i) => formatProductForPrompt(p, i))
    .join('\n\n');

  const prompt = `당신은 ${categoryName} 전문 큐레이터입니다.
아래 사용자 상황과 후보 상품들을 분석하여, 가장 적합한 Top 3 제품을 선정하고 개인화된 추천 이유를 작성해주세요.

## 사용자 상황

### 1. 기본 조건 (하드 필터)
${hardFilterSummary}

### 2. 선호하는 특성 (밸런스 게임 선택)
${balanceSummary}

### 3. 피하고 싶은 단점
${negativeSummary}

### 4. 예산 범위
${budget.min.toLocaleString()}원 ~ ${budget.max.toLocaleString()}원

## 이 카테고리의 일반적인 장점들 (언급률 순)
${topPros}

## 이 카테고리의 주요 단점/우려사항 (언급률 순)
${topCons}

## 후보 상품 목록 (현재 점수 기준 정렬)
${candidatesStr}

## 선정 기준
1. 사용자의 하드 필터 조건을 모두 만족해야 함
2. 밸런스 게임에서 선택한 선호 특성을 가진 제품 우선
3. 피하고 싶다고 한 단점이 없는 제품 우선
4. 예산 범위 내에서 가성비 고려
## 응답 JSON 형식
⚠️ 중요: pcode는 반드시 **숫자 문자열** (예: "11354604")을 사용하세요. 제품명이 아닙니다!

{
  "top3": [
    {
      "pcode": "11354604",  // ← 위 목록의 "pcode: XXXXXXXX" 값을 그대로 사용
      "rank": 1,
      "recommendationReason": "사용자의 선택과 연결된 추천 이유 (1-2문장)",
      "matchedPreferences": ["매칭된 사용자 선호 항목들"]
    },
    { "pcode": "숫자pcode", "rank": 2, "recommendationReason": "...", "matchedPreferences": ["..."] },
    { "pcode": "숫자pcode", "rank": 3, "recommendationReason": "...", "matchedPreferences": ["..."] }
  ],
  "selectionReason": "전체 선정 기준 요약 (1~2문장, 한국어로)"
}

## 추천 이유 작성 가이드 (매우 중요!)
추천 이유는 반드시 **사용자가 선택한 조건**과 **이 제품이 그 조건을 어떻게 충족하는지**를 연결해야 합니다.

※ 영어 조건명(예: rule_bottle_lightweight)은 반드시 한국어로 풀어서 작성하세요.
※ recommendationReason은 1~2문장, selectionReason도 1~2문장으로 간결하게 작성하세요. 


### 좋은 예시 (사용자 선택 → 제품 특성 연결)
- "빠른 가열을 원하셨는데, 300W 고출력으로 2분 내 데울 수 있어요"
- "세척 편의성을 중시하셨죠. 분리형 구조라 세척이 간편해요"
- "소음이 걱정되셨는데, 저소음 모터로 40dB 이하예요"
- "휴대성을 원하셔서, 850g으로 가볍고 콤팩트해요"

### 나쁜 예시 (사용하지 마세요)
- ❌ "크기: 86.6 x 85 x117.7 mm 스펙으로 실용적인 선택이에요" (스펙 나열만)
- ❌ "인기순위 5위로 많은 분들이 선택한 제품이에요" (사용자 선택과 무관)
- ❌ "좋은 제품이에요" (너무 추상적)

### 작성 원칙
1. 사용자가 밸런스 게임에서 선택한 항목 → 제품이 어떻게 충족하는지
2. 사용자가 피하고 싶다고 한 단점 → 이 제품에 그 단점이 없는 이유
3. 구체적인 스펙 수치는 사용자 선택을 뒷받침할 때만 언급
4. 일반적인 내용이 아닌 **이 제품에 특화된 내용**으로 작성
5. 사용자 관점에서 **실용적인 정보** 위주로 작성

- JSON만 응답`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  // 디버그: LLM 원본 응답 로그
  console.log(`[recommend-final] 📝 LLM raw response (first 800 chars):`, responseText.slice(0, 800));
  console.log(`[recommend-final] 🎯 userContext:`, JSON.stringify(userContext, null, 2));

  const parsed = parseJSONResponse(responseText) as {
    top3?: Array<{
      pcode: string;
      rank: number;
      recommendationReason?: string;
      matchedPreferences?: string[];
    }>;
    selectionReason?: string;
  };

  // 결과를 RecommendedProduct 형태로 변환
  const top3Products: RecommendedProduct[] = [];

  for (const item of parsed.top3 || []) {
    const candidate = candidates.find(c => c.pcode === item.pcode);
    if (candidate) {
      // LLM이 matchedPreferences를 제공하지 않으면 matchedRules 사용
      const preferences = (item.matchedPreferences && item.matchedPreferences.length > 0)
        ? item.matchedPreferences
        : candidate.matchedRules || [];

      const useFallback = !item.recommendationReason;
      if (useFallback) {
        console.log(`[recommend-final] ⚠️ Using fallback for pcode ${item.pcode}: LLM returned empty recommendationReason`);
      }

      top3Products.push({
        ...candidate,
        rank: item.rank,
        recommendationReason: item.recommendationReason || generateFallbackReason(candidate, item.rank, userContext),
        matchedPreferences: preferences,
      });
    }
  }

  // 만약 3개 미만이면 기존 점수 기준으로 채우기
  if (top3Products.length < 3) {
    const selectedPcodes = new Set(top3Products.map(p => p.pcode));
    const remaining = candidates
      .filter(c => !selectedPcodes.has(c.pcode))
      .slice(0, 3 - top3Products.length);

    for (const p of remaining) {
      top3Products.push({
        ...p,
        rank: top3Products.length + 1,
        recommendationReason: generateFallbackReason(p, top3Products.length + 1, userContext),
        matchedPreferences: p.matchedRules || [],
      });
    }
  }

  return {
    top3Products,
    selectionReason: parsed.selectionReason || '사용자 선호도와 제품 특성을 종합적으로 고려하여 선정했습니다.',
  };
}

/**
 * Fallback: 점수 기준 Top 3 반환
 */
function selectTop3Fallback(
  candidates: CandidateProduct[],
  userContext?: UserContext
): {
  top3Products: RecommendedProduct[];
  selectionReason: string;
} {
  const sorted = [...candidates].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
  const top3 = sorted.slice(0, 3);

  const top3Products: RecommendedProduct[] = top3.map((p, index) => ({
    ...p,
    rank: index + 1,
    recommendationReason: generateFallbackReason(p, index + 1, userContext),
    matchedPreferences: p.matchedRules || [],
  }));

  return {
    top3Products,
    selectionReason: '선택하신 조건에 맞춰 가장 적합한 제품을 선정했습니다.',
  };
}

/**
 * 밸런스 선택 키에서 사용자 친화적 텍스트 추출
 * 실제 키 형태: "체감속성_손목보호_가벼움", "체감속성_새벽수유_1초완성" 등
 */
function getBalanceSelectionText(ruleKey: string): string {
  // 한국어 체감속성 키 → 사용자 친화적 텍스트
  const koreanMapping: Record<string, string> = {
    // 젖병
    '손목보호_가벼움': '가벼운 무게',
    '미세플라스틱_제로': '미세플라스틱 걱정 없는 소재',
    '설거지_해방_식세기': '식기세척기 사용',
    '세척솔_필요없는_와이드': '넓은 입구로 세척 편의',
    '배앓이_철벽방어': '배앓이 방지 기능',
    '유두혼동_최소화': '유두혼동 방지',
    '여행용_간편함': '여행용 휴대 편의',

    // 분유포트
    '새벽수유_1초완성': '빠른 가열/영구보온',
    '배고픈아기_급속냉각': '급속 냉각 기능',
    '손목보호_자동출수': '자동 출수 기능',
    '위생적인_통유리': '통유리로 위생적',
    '내구성_스테인리스': '스테인리스 내구성',
    '수돗물_안심제거': '수돗물 염소 제거',
    '밤중수유_무드등': '밤중 수유등',

    // 유모차
    '초경량_깃털무게': '초경량 무게',
    '나홀로_원터치_폴딩': '원터치 폴딩',
    '신생아_흔들림_제로': '신생아 안정감',
    '비행기_기내반입': '기내 반입 가능',
    '양대면_아이컨택': '양대면 시선 교환',
    '오래쓰는_튼튼함': '튼튼한 내구성',
    '쌍둥이_다둥이': '쌍둥이/연년생용',

    // 카시트
    '허리보호_360회전': '360도 회전',
    '유럽안전인증_iSize': 'i-Size 안전 인증',
    '신생아_바구니': '바구니형 이동',
    '주니어_오래사용': '주니어까지 사용',
    '안전고정_ISOFIX': 'ISOFIX 안전 고정',
    '측면충돌_보호': '측면 충돌 보호',
    '편안한_다리공간': '넓은 다리 공간',

    // 기저귀
    '여름철_땀띠_해방': '통기성 좋음',
    '밤샘_이불빨래_끝': '높은 흡수력',
    '활동적인_아기_팬티': '팬티형 편의',
    '예민보스_피부보호': '피부 저자극',
    '신생아_배꼽케어': '배꼽 보호',
    '가성비_대량구매': '가성비 좋음',
    '물놀이_전용': '물놀이 전용',

    // 체온계
    '정확도_병원급': '병원급 정확도',
    '비접촉_위생': '비접촉 측정',
    '밤중_몰래측정': '무음/야간 모드',
    '빠른_1초측정': '1초 빠른 측정',
    '생활온도_겸용': '다용도 온도 측정',
    '스마트_기록관리': '앱 연동 기록',

    // 코흡입기
    '강력흡입_전동식': '전동식 강력 흡입',
    '휴대간편_수동식': '수동식 휴대 간편',
    '부드러운_실리콘팁': '부드러운 실리콘',
    '위생_세척용이': '세척 용이',

    // 베이비모니터
    '해킹안심_보안': '해킹 방지 보안',
    '선명한_화질': '선명한 화질',
    '움직임_감지알림': '움직임 감지 알림',
    '밤샘_지킴이': '야간 모드',
    '양방향_소통': '양방향 대화',
    '사각지대_제로': '360도 회전',

    // 분유제조기
    '스마트_원격제어': '스마트 원격 제어',
    '위생_자동세척': '자동 세척 기능',
    '미세조절_맞춤': '정밀 온도/양 조절',
    '올인원_포트겸용': '포트 겸용',
    '대용량_물탱크': '대용량',
    '안전소재': '안전한 소재',
  };

  // 체감속성_ 접두사 제거 후 매핑 검색
  const cleanKey = ruleKey.replace('체감속성_', '');

  for (const [key, text] of Object.entries(koreanMapping)) {
    if (cleanKey.includes(key) || ruleKey.includes(key)) {
      return text;
    }
  }

  // 기본 변환: 언더스코어를 공백으로, 체감속성_ 제거
  return cleanKey.replace(/_/g, ' ');
}

/**
 * Fallback용 추천 이유 생성 (사용자 선택 연결)
 */
function generateFallbackReason(
  product: CandidateProduct,
  rank: number,
  userContext?: UserContext
): string {
  const reasons: string[] = [];

  // 디버그: fallback 진입 시 데이터 확인
  console.log(`[fallback] 🔍 product.matchedRules:`, product.matchedRules);
  console.log(`[fallback] 🔍 userContext.balanceSelections:`, userContext?.balanceSelections);

  // 1. 매칭된 밸런스 선택과 연결
  if (product.matchedRules && product.matchedRules.length > 0) {
    const positiveRules = product.matchedRules.filter(r => !r.startsWith('❌'));
    if (positiveRules.length > 0) {
      const topPreference = getBalanceSelectionText(positiveRules[0]);
      // 영어가 그대로 나오는 경우 (매핑 실패) 일반 메시지로 대체
      if (/^[a-zA-Z\s]+$/.test(topPreference)) {
        reasons.push('선택하신 조건에 잘 맞는 제품이에요');
      } else {
        reasons.push(`${topPreference}을(를) 원하셨는데, 이 조건에 잘 맞는 제품이에요`);
      }
    }
  }

  // 2. 사용자가 선택한 밸런스 게임 항목 기반 (userContext 활용)
  if (reasons.length === 0 && userContext?.balanceSelections && userContext.balanceSelections.length > 0) {
    const userPreference = getBalanceSelectionText(userContext.balanceSelections[0]);
    // 영어가 그대로 나오는 경우 (매핑 실패) 일반 메시지로 대체
    if (/^[a-zA-Z\s]+$/.test(userPreference)) {
      reasons.push('선택하신 선호 조건에 잘 맞는 제품이에요');
    } else {
      reasons.push(`${userPreference}을(를) 중시하시는 분께 적합한 제품이에요`);
    }
  }

  // 3. 피하고 싶은 단점이 없음을 강조
  if (userContext?.negativeSelections && userContext.negativeSelections.length > 0) {
    const avoidedIssue = getBalanceSelectionText(userContext.negativeSelections[0]);
    // 영어가 그대로 나오는 경우 (매핑 실패) 일반 메시지로 대체
    if (/^[a-zA-Z\s]+$/.test(avoidedIssue)) {
      reasons.push('걱정하셨던 단점이 없는 제품이에요');
    } else {
      reasons.push(`걱정하셨던 ${avoidedIssue} 문제가 없어요`);
    }
  }

  // 4. 기본 fallback
  if (reasons.length === 0) {
    if (rank === 1) {
      reasons.push('선택하신 조건들을 종합 분석한 결과 가장 적합한 제품이에요');
    } else if (rank === 2) {
      reasons.push('1위와 비슷한 조건을 충족하면서 다른 장점이 있는 제품이에요');
    } else {
      reasons.push('선택하신 조건에 맞는 좋은 대안 제품이에요');
    }
  }

  return reasons[0];
}

export async function POST(request: NextRequest): Promise<NextResponse<RecommendFinalResponse>> {
  try {
    const body: RecommendFinalRequest = await request.json();
    const {
      categoryKey,
      candidateProducts,
      userContext = {},
      budget = { min: 0, max: 10000000 }
    } = body;

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    if (!candidateProducts || candidateProducts.length === 0) {
      return NextResponse.json(
        { success: false, error: 'candidateProducts array is required' },
        { status: 400 }
      );
    }

    // 카테고리 인사이트 로드
    const insights = await loadCategoryInsights(categoryKey);
    const categoryName = insights?.category_name || categoryKey;

    let top3Products: RecommendedProduct[];
    let selectionReason: string;
    let generated_by: 'llm' | 'fallback' = 'fallback';

    // LLM 사용 가능 여부 확인
    if (isGeminiAvailable() && insights) {
      try {
        const llmResult = await callGeminiWithRetry(
          () => selectTop3WithLLM(
            categoryKey,
            categoryName,
            insights,
            candidateProducts,
            userContext,
            budget
          ),
          2, // 최대 2번 재시도
          1500
        );

        top3Products = llmResult.top3Products;
        selectionReason = llmResult.selectionReason;
        generated_by = 'llm';

        console.log(`[recommend-final] LLM selected Top 3 for ${categoryKey}: ${top3Products.map(p => p.pcode).join(', ')}`);
      } catch (llmError) {
        console.error('[recommend-final] LLM failed, using fallback:', llmError);
        const fallbackResult = selectTop3Fallback(candidateProducts, userContext);
        top3Products = fallbackResult.top3Products;
        selectionReason = fallbackResult.selectionReason;
      }
    } else {
      // LLM 없을 때 fallback
      console.log(`[recommend-final] LLM not available, using fallback for ${categoryKey}`);
      const fallbackResult = selectTop3Fallback(candidateProducts, userContext);
      top3Products = fallbackResult.top3Products;
      selectionReason = fallbackResult.selectionReason;
    }

    return NextResponse.json({
      success: true,
      data: {
        categoryKey,
        categoryName,
        top3Products,
        selectionReason,
        generated_by,
        totalCandidates: candidateProducts.length,
      },
    });
  } catch (error) {
    console.error('[recommend-final] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate final recommendations' },
      { status: 500 }
    );
  }
}

/**
 * GET: API 정보 및 사용법 반환
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    success: true,
    info: {
      endpoint: '/api/v2/recommend-final',
      method: 'POST',
      description: 'LLM 기반 최종 Top 3 추천 API',
      input: {
        categoryKey: 'string (required)',
        candidateProducts: 'CandidateProduct[] (required) - 점수 계산된 후보 상품들',
        userContext: {
          hardFilterAnswers: 'Record<string, string[]> (optional)',
          balanceSelections: 'string[] (optional) - 선택한 밸런스 게임 rule_key',
          negativeSelections: 'string[] (optional) - 선택한 단점 필터 rule_key',
        },
        budget: '{ min: number, max: number } (optional)',
      },
      output: {
        top3Products: 'RecommendedProduct[] - 추천 이유가 포함된 Top 3 제품',
        selectionReason: 'string - 전체 선정 기준 설명',
        generated_by: "'llm' | 'fallback'",
      },
    },
  });
}
