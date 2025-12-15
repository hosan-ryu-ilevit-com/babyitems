'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getProModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

interface PriceRangeInfo {
  range: string;
  min: number;
  max: number;
  count: number;
}

interface BudgetRecommendRequest {
  userContext: string;
  category: string;
  categoryName: string;
  priceRangeInfo: PriceRangeInfo[];
  totalProducts: number;
  sliderMin: number;
  sliderMax: number;
}

interface BudgetRecommendResponse {
  recommendation: {
    min: number;
    max: number;
    productsInRange: number;
  };
  reasoning: string;
  alternatives?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const body: BudgetRecommendRequest = await request.json();
    const {
      userContext,
      category,
      categoryName,
      priceRangeInfo,
      totalProducts,
      sliderMin,
      sliderMax,
    } = body;

    if (!userContext || userContext.trim().length < 2) {
      return NextResponse.json(
        { error: '상황을 조금 더 자세히 알려주세요.' },
        { status: 400 }
      );
    }

    // 가격대별 상품 분포 정보 문자열로 변환
    const priceDistribution = priceRangeInfo
      .map(r => `${r.range}: ${r.count}개`)
      .join('\n');

    const systemPrompt = `당신은 육아용품 전문 상담사입니다. 사용자의 상황을 듣고 적절한 예산 범위를 추천해주세요.

**카테고리**: ${categoryName} (${category})

**현재 가격대별 상품 분포**:
${priceDistribution}

**전체 상품 수**: ${totalProducts}개
**가격 범위**: ${sliderMin.toLocaleString()}원 ~ ${sliderMax.toLocaleString()}원

**중요 규칙:**
1. 반드시 추천 범위 내에 **최소 3개 이상**의 상품이 있어야 합니다.
2. 사용자 상황(가성비 중시, 품질 중시, 선물용, 오래 사용 예정 등)을 고려하세요.
3. 추천 이유는 사용자의 상황과 연결해서 2-3문장으로 설명하세요.
4. 가격은 반드시 ${sliderMin} ~ ${sliderMax} 범위 내에서 추천하세요.
5. 가격은 10000원 단위로 추천하세요.
6. **min과 max는 반드시 다른 값이어야 합니다. 최소 2만원 이상의 범위를 추천하세요.**
7. **모든 응답은 반드시 한글로 작성하세요.**

**응답 형식 (JSON):**
{
  "recommendation": {
    "min": 최소가격(숫자),
    "max": 최대가격(숫자),
    "productsInRange": 해당범위상품수(숫자)
  },
  "reasoning": "추천 이유 (2-3문장, 사용자 상황과 연결)",
  "alternatives": "다른 예산대를 고려할 만한 경우 언급 (없으면 null)"
}`;

    const userPrompt = `**사용자 상황:**
"${userContext}"

위 상황을 고려해서 적절한 예산 범위를 추천해주세요. 반드시 해당 범위에 3개 이상의 상품이 있어야 합니다.`;

    const model = getProModel(0.3);

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<BudgetRecommendResponse>(response);

    // 유효성 검증
    // min/max가 범위 내인지 확인
    parsed.recommendation.min = Math.max(sliderMin, Math.min(sliderMax, parsed.recommendation.min));
    parsed.recommendation.max = Math.max(sliderMin, Math.min(sliderMax, parsed.recommendation.max));

    // min이 max보다 크면 교정
    if (parsed.recommendation.min > parsed.recommendation.max) {
      const temp = parsed.recommendation.min;
      parsed.recommendation.min = parsed.recommendation.max;
      parsed.recommendation.max = temp;
    }

    // 10000원 단위로 반올림
    parsed.recommendation.min = Math.round(parsed.recommendation.min / 10000) * 10000;
    parsed.recommendation.max = Math.round(parsed.recommendation.max / 10000) * 10000;

    // min = max인 경우 범위 확장 (최소 2만원 범위)
    if (parsed.recommendation.min >= parsed.recommendation.max) {
      const midPoint = parsed.recommendation.min;
      parsed.recommendation.min = Math.max(sliderMin, midPoint - 10000);
      parsed.recommendation.max = Math.min(sliderMax, midPoint + 10000);

      // 그래도 같으면 더 확장
      if (parsed.recommendation.min >= parsed.recommendation.max) {
        parsed.recommendation.min = sliderMin;
        parsed.recommendation.max = Math.min(sliderMax, sliderMin + 50000);
      }
    }

    // productsInRange 재계산 - 실제 구간 내 상품만 카운트
    let productsInRange = 0;
    for (const range of priceRangeInfo) {
      // 구간이 추천 범위와 실제로 겹치는지 확인 (더 엄격한 조건)
      const overlapMin = Math.max(range.min, parsed.recommendation.min);
      const overlapMax = Math.min(range.max, parsed.recommendation.max);

      if (overlapMin < overlapMax) {
        // 겹치는 비율에 따라 상품 수 추정
        const rangeSize = range.max - range.min;
        const overlapSize = overlapMax - overlapMin;
        const ratio = rangeSize > 0 ? overlapSize / rangeSize : 1;
        productsInRange += Math.round(range.count * ratio);
      }
    }
    parsed.recommendation.productsInRange = productsInRange;

    // 3개 미만이면 범위 확장
    if (productsInRange < 3) {
      // 전체 범위로 확장
      parsed.recommendation.min = sliderMin;
      parsed.recommendation.max = sliderMax;
      parsed.recommendation.productsInRange = totalProducts;
      parsed.reasoning = `선택하신 조건에 맞는 상품이 적어서 전체 범위를 추천드려요. ${parsed.reasoning}`;
    }

    return NextResponse.json(parsed);

  } catch (error) {
    console.error('Budget AI Helper error:', error);
    return NextResponse.json(
      { error: 'AI 추천을 생성하는 데 실패했습니다. 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
