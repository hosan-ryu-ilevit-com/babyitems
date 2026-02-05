import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry, getModel } from '@/lib/ai/gemini';

/**
 * POST /api/knowledge-agent/generate-onboarding-options
 *
 * 온보딩 단계에서 사용할 옵션들을 AI로 생성합니다.
 * - type: 'replace_reasons' - 교체 시 기존 제품의 불편사항 옵션
 * - type: 'first_situations' - 첫 구매 시 상황 옵션
 * - type: 'browse_situations' - 그냥 둘러보기 시 상황 옵션
 */
export async function POST(request: NextRequest) {
  try {
    const { categoryName, type, babyInfo, purchaseSituation } = await request.json();

    if (!categoryName || !type) {
      return NextResponse.json(
        { error: 'categoryName and type are required' },
        { status: 400 }
      );
    }

    if (type === 'replace_reasons') {
      const options = await generateReplaceReasons(categoryName);
      return NextResponse.json({ options });
    }

    if (type === 'first_situations' || type === 'browse_situations') {
      const options = await generateSituationOptions(categoryName, babyInfo, purchaseSituation);
      return NextResponse.json({ options });
    }

    return NextResponse.json(
      { error: `Unknown type: ${type}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('[generate-onboarding-options] Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate options' },
      { status: 500 }
    );
  }
}

/**
 * 교체 시 불편사항 옵션 생성
 */
async function generateReplaceReasons(categoryName: string): Promise<string[]> {
  const prompt = `당신은 "${categoryName}" 제품 전문가입니다.

사용자가 기존 "${categoryName}"를 교체하려고 합니다. 기존 제품에서 흔히 경험하는 불편사항이나 불만족 이유를 5개 생성해주세요.

요구사항:
1. "${categoryName}" 제품 특성에 맞는 구체적인 불편사항
2. 실제 소비자들이 자주 언급하는 이유들
3. 각 옵션은 간결하게 (15자 내외)
4. 기능/성능/편의성/디자인/내구성 등 다양한 측면 포함

반드시 아래 JSON 형식으로만 응답하세요:
{
  "options": [
    "불편사항 1",
    "불편사항 2",
    "불편사항 3",
    "불편사항 4",
    "불편사항 5"
  ]
}`;

  try {
    const response = await callGeminiWithRetry(async () => {
      const model = getModel(0.5);
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    // JSON 파싱
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[generateReplaceReasons] No JSON found in response');
      return getDefaultReplaceReasons(categoryName);
    }

    const data = JSON.parse(jsonMatch[0]);
    if (data.options && Array.isArray(data.options) && data.options.length > 0) {
      return data.options;
    }

    return getDefaultReplaceReasons(categoryName);
  } catch (error) {
    console.error('[generateReplaceReasons] Error:', error);
    return getDefaultReplaceReasons(categoryName);
  }
}

/**
 * D-day 계산 함수 (출산예정일까지 남은 일수)
 */
function calculateDDay(expectedDate: string): number {
  const expected = new Date(expectedDate);
  const now = new Date();
  expected.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  const diffTime = expected.getTime() - now.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * 첫 구매/둘러보기 시 상황 옵션 생성
 */
async function generateSituationOptions(
  categoryName: string,
  babyInfo?: { gender?: string; calculatedMonths?: number; expectedDate?: string; isBornYet?: boolean },
  purchaseSituation?: 'first' | 'gift'
): Promise<string[]> {
  // 디버그 로그
  console.log('[generateSituationOptions] Input:', {
    categoryName,
    babyInfo,
    purchaseSituation,
  });

  // 아기 정보 컨텍스트 구성 (더 구체적으로)
  let babyContext = '';
  let babyAgeContext = '';

  if (babyInfo) {
    if (babyInfo.isBornYet && babyInfo.calculatedMonths !== undefined) {
      const months = babyInfo.calculatedMonths;
      const genderText = babyInfo.gender === 'male' ? '남아' : babyInfo.gender === 'female' ? '여아' : '성별 미상';

      // 월령에 따른 발달 단계 설명
      let stageDesc = '';
      if (months === 0) stageDesc = '신생아';
      else if (months <= 3) stageDesc = '신생아~초기 영아';
      else if (months <= 6) stageDesc = '뒤집기/목가누기 시기';
      else if (months <= 9) stageDesc = '이유식 초기~중기, 앉기 시작';
      else if (months <= 12) stageDesc = '이유식 후기, 기어다니기/서기 시작';
      else if (months <= 18) stageDesc = '돌 지남, 걷기 시작';
      else if (months <= 24) stageDesc = '활발한 걸음마기';
      else if (months <= 36) stageDesc = '유아기 초반';
      else stageDesc = '유아기';

      babyContext = `[아기 정보]
- 월령: ${months}개월 (${stageDesc})
- 성별: ${genderText}`;
      babyAgeContext = `${months}개월 ${genderText}`;
    } else if (!babyInfo.isBornYet && babyInfo.expectedDate) {
      const dDay = calculateDDay(babyInfo.expectedDate);
      const dDayText = dDay > 0 ? `D-${dDay} (약 ${Math.ceil(dDay / 7)}주 후)` : dDay === 0 ? 'D-Day (오늘 예정)' : `D+${Math.abs(dDay)} (예정일 ${Math.abs(dDay)}일 지남)`;

      babyContext = `[아기 정보]
- 출산예정: ${babyInfo.expectedDate} (${dDayText})
- 현재 임신 중, 출산 준비 단계`;
      babyAgeContext = `출산예정 ${dDayText}`;
    }
  }

  // 구매 상황 컨텍스트
  const situationLabel = purchaseSituation === 'first' ? '첫 구매' : '그냥 둘러보기';
  const situationDesc = purchaseSituation === 'first'
    ? '이 제품을 처음 구매하려고 합니다. 실제 구매 의향이 있습니다.'
    : '당장 구매 계획은 없지만 어떤 제품이 있는지 둘러보고 있습니다.';

  const prompt = `당신은 "${categoryName}" 제품 구매 상담 전문가입니다.

## 사용자 정보
${babyContext || '- 아기 정보 없음'}

## 구매 상황
- 선택: ${situationLabel}
- 설명: ${situationDesc}

## 요청
위 사용자가 "${categoryName}"를 ${situationLabel}하려는 상황에서, 가장 fit할 확률이 높은 구체적인 상황/니즈 3~5개를 생성해주세요.

## 중요 요구사항
1. **아기 정보 반영 필수**: ${babyAgeContext ? `"${babyAgeContext}"라는 정보를 반드시 반영하세요. 이 월령/출산예정에 맞는 구체적인 상황이어야 합니다.` : '아기 정보가 없으므로 일반적인 상황으로 생성하세요.'}
2. **${situationLabel} 맥락 반영**: ${purchaseSituation === 'first' ? '실제로 구매하려는 사람의 상황' : '아직 구매 계획 없이 정보만 탐색하는 사람의 상황'}
3. **구체적이고 공감 가능**: 사용자가 "아, 이거 내 상황이다!" 라고 느낄 수 있도록 구체적으로 (15~25자)
4. **${categoryName} 제품 특성 반영**: 이 카테고리 제품을 찾는 사람들의 실제 상황
5. **다양성**: 서로 다른 니즈/상황 (출산준비, 발달단계 맞춤, 기능 필요, 추천받아서 등)

반드시 아래 JSON 형식으로만 응답하세요:
{
  "options": [
    "상황 1",
    "상황 2",
    "상황 3",
    "상황 4",
    "상황 5"
  ]
}`;

  // 생성된 컨텍스트 로그
  console.log('[generateSituationOptions] Context:', {
    babyContext: babyContext || '(없음)',
    babyAgeContext: babyAgeContext || '(없음)',
    situationLabel,
  });

  try {
    const response = await callGeminiWithRetry(async () => {
      const model = getModel(0.6);
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    // JSON 파싱
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[generateSituationOptions] No JSON found in response');
      return getDefaultSituationOptions(categoryName, purchaseSituation);
    }

    const data = JSON.parse(jsonMatch[0]);
    if (data.options && Array.isArray(data.options) && data.options.length > 0) {
      return data.options;
    }

    return getDefaultSituationOptions(categoryName, purchaseSituation);
  } catch (error) {
    console.error('[generateSituationOptions] Error:', error);
    return getDefaultSituationOptions(categoryName, purchaseSituation);
  }
}

/**
 * 기본 상황 옵션 (AI 생성 실패 시 fallback)
 */
function getDefaultSituationOptions(categoryName: string, purchaseSituation?: 'first' | 'gift'): string[] {
  if (purchaseSituation === 'gift') {
    return [
      '나중에 구매할 때 참고하려고',
      '어떤 제품들이 있는지 궁금해서',
      '가격대가 어느 정도인지 알고 싶어서',
      '인기 있는 제품이 뭔지 궁금해서',
      '최신 트렌드가 궁금해서',
    ];
  }

  return [
    '출산 준비로 미리 알아보는 중',
    '선물용으로 찾고 있어요',
    '꼭 필요해서 구매하려고',
    '더 좋은 제품으로 바꾸고 싶어서',
    '특별한 기능이 있는 제품이 필요해서',
  ];
}

/**
 * 기본 불편사항 옵션 (AI 생성 실패 시 fallback)
 */
function getDefaultReplaceReasons(categoryName: string): string[] {
  // 카테고리별 기본 옵션
  const categoryDefaults: Record<string, string[]> = {
    '젖병': [
      '세척이 번거로워서',
      '아기가 잘 안 물어서',
      '누수가 생겨서',
      '배앓이가 심해져서',
      '용량이 부족해서',
    ],
    '유모차': [
      '무겁고 접기 불편해서',
      '방향 전환이 안 돼서',
      '수납공간이 부족해서',
      '아기가 불편해해서',
      '고장이 자주 나서',
    ],
    '카시트': [
      '아기가 불편해해서',
      '설치가 어려워서',
      '통풍이 안 돼서',
      '사이즈가 안 맞아서',
      '각도 조절이 불편해서',
    ],
    '에어프라이어': [
      '용량이 작아서',
      '조리가 고르지 않아서',
      '소음이 심해서',
      '세척이 어려워서',
      '기능이 부족해서',
    ],
    '공기청정기': [
      '청정 능력이 부족해서',
      '소음이 너무 커서',
      '필터 비용이 부담돼서',
      '넓은 공간 커버 안 돼서',
      '센서가 부정확해서',
    ],
  };

  // 해당 카테고리 옵션이 있으면 사용, 없으면 일반 옵션
  return categoryDefaults[categoryName] || [
    '성능이 기대에 못 미쳐서',
    '고장/파손되어서',
    '사용하기 불편해서',
    '디자인이 마음에 안 들어서',
    '더 좋은 제품을 발견해서',
  ];
}
