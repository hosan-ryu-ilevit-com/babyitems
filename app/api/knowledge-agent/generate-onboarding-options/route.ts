import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry, getModel } from '@/lib/ai/gemini';

/**
 * POST /api/knowledge-agent/generate-onboarding-options
 *
 * 온보딩 단계에서 사용할 옵션들을 AI로 생성합니다.
 * - type: 'replace_reasons' - 교체 시 기존 제품의 불편사항 옵션
 */
export async function POST(request: NextRequest) {
  try {
    const { categoryName, type } = await request.json();

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
