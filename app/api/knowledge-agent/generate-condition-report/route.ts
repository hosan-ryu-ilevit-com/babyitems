import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry, getModel } from '@/lib/ai/gemini';
import type { ConditionReport, OnboardingData, BabyInfo, BalanceSelection } from '@/lib/knowledge-agent/types';

/**
 * POST /api/knowledge-agent/generate-condition-report
 *
 * 사용자가 입력한 조건들을 요약하고 분석하여 조건 보고서를 생성합니다.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      categoryName,
      collectedInfo,
      onboarding,
      babyInfo,
      balanceSelections,
      negativeSelections,
      webSearchContext,
    } = await request.json();

    if (!categoryName || !collectedInfo) {
      return NextResponse.json(
        { error: 'categoryName and collectedInfo are required' },
        { status: 400 }
      );
    }

    const report = await generateConditionReport(
      categoryName,
      collectedInfo,
      onboarding,
      babyInfo,
      balanceSelections,
      negativeSelections,
      webSearchContext
    );

    return NextResponse.json({ report });
  } catch (error) {
    console.error('[generate-condition-report] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate condition report' },
      { status: 500 }
    );
  }
}

/**
 * 조건 보고서 생성
 */
async function generateConditionReport(
  categoryName: string,
  collectedInfo: Record<string, string>,
  onboarding?: OnboardingData,
  babyInfo?: BabyInfo,
  balanceSelections?: BalanceSelection[],
  negativeSelections?: string[],
  webSearchContext?: {
    marketSummary?: { topBrands?: string[]; topPros?: string[]; topCons?: string[]; priceRange?: { min: number; max: number }; reviewCount?: number };
    trendAnalysis?: { top10Summary?: string; trends?: string[]; pros?: string[]; cons?: string[]; priceInsight?: string; buyingFactors?: string[] };
  }
): Promise<ConditionReport> {
  // 컨텍스트 정보 구성
  let contextInfo = '';

  // 온보딩 정보
  if (onboarding) {
    const situationMap: Record<string, string> = {
      first: '처음 구매',
      replace: '교체/업그레이드',
      gift: '선물용/둘러보기',
    };
    contextInfo += `구매 상황: ${situationMap[onboarding.purchaseSituation] || onboarding.purchaseSituation}\n`;
    if (onboarding.replaceReasons && onboarding.replaceReasons.length > 0) {
      contextInfo += `기존 제품 불만사항: ${onboarding.replaceReasons.join(', ')}\n`;
    }
    if (onboarding.replaceOther) {
      contextInfo += `기타 불만: ${onboarding.replaceOther}\n`;
    }
    // 🆕 첫구매/둘러보기 상황 (복수선택)
    if (onboarding.firstSituations && onboarding.firstSituations.length > 0) {
      contextInfo += `구매 니즈/상황: ${onboarding.firstSituations.join(', ')}\n`;
    }
    if (onboarding.firstSituationOther) {
      contextInfo += `기타 니즈: ${onboarding.firstSituationOther}\n`;
    }
  }

  // 아기 정보
  if (babyInfo) {
    if (babyInfo.gender) {
      const genderMap: Record<string, string> = { male: '남아', female: '여아', unknown: '미정' };
      contextInfo += `아기 성별: ${genderMap[babyInfo.gender] || babyInfo.gender}\n`;
    }
    if (babyInfo.calculatedMonths !== undefined) {
      contextInfo += `아기 개월수: ${babyInfo.calculatedMonths}개월\n`;
    } else if (babyInfo.expectedDate) {
      contextInfo += `출산예정일: ${babyInfo.expectedDate}\n`;
    }
  }

  // 수집된 정보
  const collectedEntries = Object.entries(collectedInfo)
    .filter(([key]) => !['initialContext', 'context'].includes(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

  // 밸런스 선택
  const balanceInfo = balanceSelections?.map(s => s.selectedLabel).join(', ') || '';

  // 회피 조건
  const avoidInfo = negativeSelections?.join(', ') || '';

  // 시장 분석 컨텍스트 (웹서치 기반)
  let marketContext = '';
  const trend = webSearchContext?.trendAnalysis;
  const market = webSearchContext?.marketSummary;
  if (trend || market) {
    marketContext += '\n=== 시장 분석 (웹서치 기반) ===\n';
    if (trend?.top10Summary) marketContext += `시장 현황: ${trend.top10Summary}\n`;
    if (trend?.trends?.length) marketContext += `최근 트렌드: ${trend.trends.join(', ')}\n`;
    if (trend?.pros?.length) marketContext += `구매자 만족 포인트: ${trend.pros.join(', ')}\n`;
    if (trend?.cons?.length) marketContext += `주의해야 할 단점: ${trend.cons.join(', ')}\n`;
    if (trend?.buyingFactors?.length) marketContext += `핵심 구매 고려사항: ${trend.buyingFactors.join(', ')}\n`;
    if (trend?.priceInsight) marketContext += `가격대 정보: ${trend.priceInsight}\n`;
    if (market?.topBrands?.length) marketContext += `인기 브랜드: ${market.topBrands.join(', ')}\n`;
    if (market?.priceRange) marketContext += `가격 범위: ${market.priceRange.min.toLocaleString()}원 ~ ${market.priceRange.max.toLocaleString()}원\n`;
  }

  const prompt = `당신은 "${categoryName}" 구매 컨설턴트입니다.

사용자가 입력한 조건들과 시장 분석 데이터를 종합하여 조건 보고서를 작성하세요.

=== 수집된 정보 ===
${contextInfo}

맞춤질문 응답:
${collectedEntries || '(없음)'}

선호 조건:
${balanceInfo || '(없음)'}

회피 조건:
${avoidInfo || '(없음)'}
${marketContext}
=== 요구사항 ===
1. 사용자 프로필을 2-3문장으로 요약. 핵심 키워드(나이/개월수, 구매 목적, 중요 조건 등)는 반드시 **키워드** 형태로 감싸서 강조하세요.
2. 핵심 니즈를 3-5개 도출 (핵심 니즈에는 **키워드** 형태를 사용하지 마세요. 짧고 간결한 텍스트만 작성)
3. 추천 스펙을 구체적으로 제시 (시장 트렌드와 구매자 만족/불만 포인트를 참고하여 실용적으로). value에는 **키워드** 형태를 사용하지 마세요 (이미 볼드 처리됨). reason 내에서만 핵심 키워드를 **키워드** 형태로 강조하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "userProfile": {
    "situation": "구매 상황 요약 (1-2문장, **핵심키워드** 형태로 강조)",
    "keyNeeds": ["핵심 니즈1", "핵심 니즈2", "핵심 니즈3"]
  },
  "analysis": {
    "recommendedSpecs": [
      { "specName": "스펙명", "value": "추천값 설명 (짧고 명확하게)", "reason": "**핵심근거** 포함 추천 이유" }
    ]
  }
}`;

  try {
    const response = await callGeminiWithRetry(async () => {
      const model = getModel(0.4);
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    // JSON 파싱
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[generateConditionReport] No JSON found in response');
      return getDefaultReport(categoryName, collectedInfo);
    }

    const data = JSON.parse(jsonMatch[0]) as ConditionReport;

    // 유효성 검사
    if (!data.userProfile || !data.analysis) {
      return getDefaultReport(categoryName, collectedInfo);
    }

    return data;
  } catch (error) {
    console.error('[generateConditionReport] Error:', error);
    return getDefaultReport(categoryName, collectedInfo);
  }
}

/**
 * 기본 보고서 (AI 생성 실패 시 fallback)
 */
function getDefaultReport(
  categoryName: string,
  collectedInfo: Record<string, string>
): ConditionReport {
  const entries = Object.entries(collectedInfo);
  const keyNeeds = entries.slice(0, 3).map(([, v]) => v);

  return {
    userProfile: {
      situation: `${categoryName} 구매를 고려 중입니다.`,
      keyNeeds: keyNeeds.length > 0 ? keyNeeds : ['사용 편의성', '가성비', '품질'],
    },
    analysis: {
      recommendedSpecs: [
        { specName: '품질', value: '검증된 브랜드', reason: '안정적인 품질 보장' },
      ],
      importantFactors: ['사용 목적에 맞는 스펙 선택', '리뷰 평가 확인'],
      cautions: ['과대광고 주의', '실사용 후기 확인 권장'],
    },
  };
}
