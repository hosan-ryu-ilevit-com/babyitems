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
      negativeSelections
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
  negativeSelections?: string[]
): Promise<ConditionReport> {
  // 컨텍스트 정보 구성
  let contextInfo = '';

  // 온보딩 정보
  if (onboarding) {
    const situationMap: Record<string, string> = {
      first: '처음 구매',
      replace: '교체/업그레이드',
      gift: '선물용',
    };
    contextInfo += `구매 상황: ${situationMap[onboarding.purchaseSituation] || onboarding.purchaseSituation}\n`;
    if (onboarding.replaceReasons && onboarding.replaceReasons.length > 0) {
      contextInfo += `기존 제품 불만사항: ${onboarding.replaceReasons.join(', ')}\n`;
    }
    if (onboarding.replaceOther) {
      contextInfo += `기타 불만: ${onboarding.replaceOther}\n`;
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

  const prompt = `당신은 "${categoryName}" 구매 컨설턴트입니다.

사용자가 입력한 조건들을 분석하여 조건 보고서를 작성하세요.

=== 수집된 정보 ===
${contextInfo}

맞춤질문 응답:
${collectedEntries || '(없음)'}

선호 조건:
${balanceInfo || '(없음)'}

회피 조건:
${avoidInfo || '(없음)'}

=== 요구사항 ===
1. 사용자 프로필을 2-3문장으로 요약
2. 핵심 니즈를 3-5개 도출
3. 추천 스펙을 구체적으로 제시 (해당 카테고리 특성에 맞게)
4. 중요 고려사항과 주의사항 제시
5. 3가지 추천 방향성 제시 (프리미엄/가성비/밸런스)
6. 필수/선호/회피 조건 정리

반드시 아래 JSON 형식으로만 응답하세요:
{
  "userProfile": {
    "situation": "구매 상황 요약 (1-2문장)",
    "keyNeeds": ["핵심 니즈1", "핵심 니즈2", "핵심 니즈3"]
  },
  "analysis": {
    "recommendedSpecs": [
      { "specName": "스펙명", "value": "추천값", "reason": "추천 이유" }
    ],
    "importantFactors": ["중요 고려사항1", "중요 고려사항2"],
    "cautions": ["주의사항1", "주의사항2"]
  },
  "directions": [
    { "type": "premium", "description": "프리미엄 방향 설명 (1문장)" },
    { "type": "value", "description": "가성비 방향 설명 (1문장)" },
    { "type": "balanced", "description": "밸런스 방향 설명 (1문장)" }
  ],
  "summary": {
    "mustHave": ["필수 조건1", "필수 조건2"],
    "niceToHave": ["선호 조건1", "선호 조건2"],
    "avoid": ["회피 조건1", "회피 조건2"]
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
    if (!data.userProfile || !data.analysis || !data.summary) {
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
    directions: [
      { type: 'premium', description: '최고급 기능과 품질을 원하신다면' },
      { type: 'value', description: '합리적인 가격에 기본 기능을 원하신다면' },
      { type: 'balanced', description: '적절한 가격에 좋은 품질을 원하신다면' },
    ],
    summary: {
      mustHave: entries.slice(0, 2).map(([, v]) => v) || ['기본 기능'],
      niceToHave: ['추가 편의 기능'],
      avoid: ['저가형 제품의 품질 문제'],
    },
  };
}
