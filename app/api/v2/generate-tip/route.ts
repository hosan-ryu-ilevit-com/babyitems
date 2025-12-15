import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry } from '@/lib/ai/gemini';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';

// 카테고리 한글 이름 매핑 (API용 간소화 버전)
const CATEGORY_NAMES: Record<string, string> = {
  baby_bottle: '젖병',
  baby_bottle_sterilizer: '젖병소독기',
  baby_formula_dispenser: '분유제조기',
  baby_monitor: '홈카메라',
  baby_play_mat: '놀이매트',
  car_seat: '카시트',
  milk_powder_port: '분유포트',
  formula_pot: '분유포트',
  nasal_aspirator: '콧물흡입기',
  thermometer: '체온계',
  stroller: '유모차',
  diaper: '기저귀',
  baby_wipes: '아기물티슈',
  formula: '분유',
  formula_maker: '분유제조기',
  pacifier: '쪽쪽이',
  baby_bed: '유아침대',
  high_chair: '유아의자',
  baby_sofa: '유아소파',
  baby_desk: '유아책상',
  ip_camera: '홈캠',
};

interface TipRequest {
  categoryKey: string;
  questionId: string;
  questionText: string;
  options: Array<{
    value: string;
    label: string;
  }>;
  // popularOptions는 더 이상 사용하지 않음 (하위 호환성 유지)
  popularOptions?: Array<{
    value: string;
    label: string;
    percentage: number;
  }>;
}

interface TipResponse {
  tip: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<TipResponse | { error: string }>> {
  try {
    const body: TipRequest = await request.json();
    const { categoryKey, questionId, questionText, options } = body;

    // 입력 검증
    if (!categoryKey || !questionId || !questionText || !options?.length) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // 카테고리 인사이트 로드
    const insights = await loadCategoryInsights(categoryKey);
    const categoryName = CATEGORY_NAMES[categoryKey] || categoryKey;

    // 프롬프트 구성
    const optionsList = options.map(o => `- ${o.label}`).join('\n');

    // 카테고리 인사이트는 참고용으로만 사용
    let insightsContext = '';
    if (insights) {
      insightsContext = `
[참고: 카테고리 일반 정보]
${insights.guide?.summary || ''}
`.trim();
    }

    const prompt = `당신은 육아용품 전문가입니다. 초보 부모가 아래 선택지를 이해하도록 돕는 짧은 팁을 작성해주세요.

[질문]
${questionText}

[선택지]
${optionsList}

${insightsContext}

## 규칙
1. **반드시 1문장(70자 이내)만 작성하세요.** 두 문장 이상 절대 금지!
2. 모든 선택지를 다 설명하지 마세요. 어려운 용어 1-2개만 간단히 설명하세요.
3. 일상적인 용어(예: 방수기능, 접이식, 휴대가능)는 설명 불필요 - 생략하세요.
4. 선택지 중 무엇을 선택해야 하는지, 어떤 것이 인기인지 등은 말하지 마세요.
5. 질문과 무관한 정보(예: 화소 질문인데 렌즈커버 언급)는 절대 금지입니다.
6. 친근한 반말 어투 (예: "~예요", "~이에요")
7. 이모티콘 금지, JSON 형식 금지, 순수 텍스트만 반환
8. 어려운 용어가 없으면 빈 문자열("") 반환

## 좋은 예시
- 질문 "재질을 선택하세요" → "PPSU는 가볍고 내열성이 좋고, 유리는 환경호르몬 걱정이 없어요"
- 질문 "유모차 종류" → "절충형은 다용도, 디럭스형은 신생아용으로 안정감이 좋아요"
- 질문 "화소를 선택하세요" → "200만 화소면 충분하고, 300만 이상은 더 선명해요"

## 나쁜 예시 (절대 금지!)
- "방수기능은 X이고, 자율안전인증은 Y이고, 항균기능은 Z이고..." (모든 선택지 나열 금지!)
- "PPSU가 인기예요" (선택 유도)
- "화소보다 렌즈커버가 더 중요해요" (질문과 무관한 정보)
- "좋은 제품을 고르세요" (의미 없음)`;

    // LLM 호출
    const model = getModel(0.2); // 낮은 temperature로 일관성 있는 출력

    let tip = await callGeminiWithRetry(async () => {
      const result = await model.generateContent(prompt);
      const response = result.response;
      return response.text().trim();
    });

    // 안전 장치: 마침표+공백 이후 추가 문장 제거 (1문장만 유지)
    const sentenceEnd = tip.indexOf('. ');
    if (sentenceEnd !== -1) {
      tip = tip.substring(0, sentenceEnd + 1);
    }

    // 70자 초과 시 자르기
    if (tip.length > 70) {
      tip = tip.substring(0, 67) + '...';
    }

    return NextResponse.json({ tip });

  } catch (error) {
    console.error('Error generating tip:', error);
    return NextResponse.json(
      { error: 'Failed to generate tip' },
      { status: 500 }
    );
  }
}
