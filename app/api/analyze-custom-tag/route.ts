import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry } from '@/lib/ai/gemini';
import { CoreAttributeKey } from '@/types';

/**
 * POST /api/analyze-custom-tag
 *
 * 사용자가 직접 입력한 커스텀 태그 텍스트를 AI로 분석하여
 * 관련 속성(attributes)과 가중치(weight)를 자동으로 추출합니다.
 *
 * Request Body:
 * {
 *   tagText: string;         // 사용자가 입력한 태그 텍스트
 *   tagType: 'pros' | 'cons'; // 장점/단점 구분
 * }
 *
 * Response:
 * {
 *   relatedAttributes: Array<{
 *     attribute: CoreAttributeKey;
 *     weight: number; // 0.3 ~ 1.0
 *   }>;
 * }
 */

const ATTRIBUTE_DESCRIPTIONS = {
  temperatureControl: '온도 조절/유지 성능 (예: 정밀한 온도 조절, 빠른 냉각, 보온 기능)',
  hygiene: '위생/세척 편의성 (예: 세척 편의, 위생 상태 확인, 틈새 관리)',
  material: '소재/안전성 (예: 유리, 스테인리스, 플라스틱 품질, 냄새)',
  usability: '사용 편의성 (예: 간편한 조작, 자동 기능, 소음, 용량)',
  portability: '휴대성 (예: 무게, 크기, 무선 사용, 프리볼트)',
  additionalFeatures: '부가 기능/디자인 (예: 디자인, 다용도 활용, 특수 기능)',
  priceValue: '가격 대비 가치 (예: 가성비, 가격 부담)',
  durability: '내구성/A/S (예: 제품 수명, 고장, A/S)'
};

export async function POST(req: NextRequest) {
  try {
    const { tagText, tagType } = await req.json();

    if (!tagText || !tagType) {
      return NextResponse.json(
        { error: 'tagText와 tagType이 필요합니다.' },
        { status: 400 }
      );
    }

    if (tagType !== 'pros' && tagType !== 'cons') {
      return NextResponse.json(
        { error: 'tagType은 "pros" 또는 "cons"이어야 합니다.' },
        { status: 400 }
      );
    }

    // AI 프롬프트 생성
    const prompt = `당신은 분유포트(baby formula milk warmer) 제품의 특성을 분석하는 전문가입니다.

사용자가 입력한 **${tagType === 'pros' ? '장점' : '단점'}** 태그: "${tagText}"

이 태그가 분유포트의 어떤 속성(attribute)과 관련이 있는지 분석해주세요.

**사용 가능한 속성 목록:**
${Object.entries(ATTRIBUTE_DESCRIPTIONS)
  .map(([key, desc]) => `- ${key}: ${desc}`)
  .join('\n')}

**출력 형식 (JSON):**
{
  "relatedAttributes": [
    {
      "attribute": "속성명",
      "weight": 가중치,
      "reason": "이 속성과 관련된 이유"
    }
  ]
}

**가중치 규칙:**
- 주요 속성 (가장 직접적으로 관련): weight = 1.0
- 부차적 속성 (간접적으로 관련): weight = 0.3 ~ 0.5
- 최소 1개, 최대 3개의 속성 선택
- ${tagType === 'pros' ? '장점' : '단점'}이므로 해당 특성을 ${tagType === 'pros' ? '긍정적' : '부정적'} 관점에서 해석

**예시:**
입력: "물 끓는 속도가 빨라요"
출력:
{
  "relatedAttributes": [
    {
      "attribute": "temperatureControl",
      "weight": 1.0,
      "reason": "물을 끓이는 속도는 온도 조절 성능의 핵심"
    },
    {
      "attribute": "usability",
      "weight": 0.3,
      "reason": "빠른 속도는 사용 편의성 향상"
    }
  ]
}

이제 사용자 입력 "${tagText}"를 분석해주세요.`;

    // Gemini API 호출
    const response = await callGeminiWithRetry(prompt, {
      temperature: 0.3, // 분류 작업이므로 낮은 temperature
      maxOutputTokens: 500
    });

    // JSON 파싱
    let parsedResponse;
    try {
      // JSON 블록 추출 (```json ... ``` 또는 {...} 형태)
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/(\{[\s\S]*\})/);
      const jsonString = jsonMatch ? jsonMatch[1] : response;
      parsedResponse = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('❌ JSON 파싱 실패:', response);
      throw new Error('AI 응답을 파싱할 수 없습니다.');
    }

    // 응답 검증
    if (!parsedResponse.relatedAttributes || !Array.isArray(parsedResponse.relatedAttributes)) {
      throw new Error('AI 응답 형식이 올바르지 않습니다.');
    }

    // 속성 유효성 검증
    const validAttributes = Object.keys(ATTRIBUTE_DESCRIPTIONS);
    const validatedAttributes = parsedResponse.relatedAttributes.filter(
      (attr: any) =>
        validAttributes.includes(attr.attribute) &&
        typeof attr.weight === 'number' &&
        attr.weight >= 0.3 &&
        attr.weight <= 1.0
    );

    if (validatedAttributes.length === 0) {
      throw new Error('유효한 속성을 찾을 수 없습니다.');
    }

    // 최대 3개로 제한
    const limitedAttributes = validatedAttributes.slice(0, 3);

    console.log(`✅ 커스텀 태그 분석 완료: "${tagText}" (${tagType})`);
    console.log('   관련 속성:', limitedAttributes.map((a: any) => `${a.attribute} (${a.weight})`).join(', '));

    return NextResponse.json({
      relatedAttributes: limitedAttributes.map((attr: any) => ({
        attribute: attr.attribute as CoreAttributeKey,
        weight: attr.weight
      }))
    });

  } catch (error) {
    console.error('❌ 커스텀 태그 분석 에러:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
