'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import { generateHardFiltersForCategory } from '@/lib/recommend-v2/danawaFilters';

interface GenerateContextExamplesRequest {
  category: string;
  categoryName: string;
}

interface GenerateContextExamplesResponse {
  examples: string[];
  hint?: string;
}

// 카테고리별 제품 스펙 힌트 (뭘 살지 아는 사람용) - 구체적인 불만/요구사항
const CATEGORY_SPEC_HINTS: Record<string, string> = {
  milk_powder_port: '쿨링 기능, 소음 문제, 온도 정확도, 세척 편의성, 용량',
  formula_pot: '쿨링 기능, 소음 문제, 온도 정확도, 세척 편의성, 용량',
  baby_bottle: '배앓이 방지, 젖꼭지 단계, 소재(PPSU/유리), 용량(160ml/260ml)',
  car_seat: '회전형, ISOFIX, 신생아~몇세용, 각도 조절, 통풍',
  stroller: '한손 접이, 무게(경량/디럭스), 바퀴 크기, 양대면',
  diaper: '흡수력, 새는 문제, 단계(3단계/4단계), 두께, 통기성',
  high_chair: '접이식, 높이 조절, 트레이 분리, 바퀴 유무',
  thermometer: '비접촉/귀체온, 측정 속도, 정확도',
  baby_wipes: '두께, 엠보싱, 성분(무향/저자극), 캡 타입',
  formula: '소화력, 분유 타입(일반/HA/산양), 변비/설사 문제',
  pacifier: '교정용, 실리콘/천연고무, 크기(0-6개월/6개월+)',
  baby_bed: '높이 조절, 이동식, 범퍼 포함, 크기',
  baby_sofa: '세탁 가능, 안전벨트, 크기',
};

// 카테고리별 상황 힌트 (첫 구매자용) - 구체적인 상황 정보
const CATEGORY_SITUATION_HINTS: Record<string, string> = {
  milk_powder_port: '아기 월령(3개월/6개월 등), 하루 수유 횟수, 밤수유 빈도, 분유 브랜드',
  formula_pot: '아기 월령(3개월/6개월 등), 하루 수유 횟수, 밤수유 빈도, 분유 브랜드',
  baby_bottle: '아기 월령, 모유/분유/혼합, 한 번 수유량(ml), 젖병 거부 여부',
  car_seat: '아기 월령/체중(kg), 차종(SUV/세단/소형), 장거리 빈도, 카시트 경험',
  stroller: '아기 월령, 주거형태(아파트 몇층/엘베 유무), 대중교통 이용, 차 트렁크 크기',
  diaper: '아기 월령/체중(kg), 성별, 피부 민감도, 활동량(뒤집기/기기 등)',
  high_chair: '아기 월령, 이유식 시작 여부, 식탁 높이, 주방 공간',
  thermometer: '아기 월령, 열 자주 나는지, 측정 경험',
  baby_wipes: '아기 월령, 피부 타입(민감/아토피), 주 용도(기저귀/손입)',
  formula: '아기 월령, 모유→분유 전환, 소화 문제, 알레르기 가족력',
  pacifier: '아기 월령, 모유/분유 수유, 공갈 경험',
  baby_bed: '아기 월령, 방 크기, 부모 침대 옆/독립 방, 이동 필요',
  baby_sofa: '아기 월령, 혼자 앉기 가능 여부, 형제 유무',
};

export async function POST(request: NextRequest) {
  try {
    const body: GenerateContextExamplesRequest = await request.json();
    const { category, categoryName } = body;

    // 하드필터 질문들 로드 (질문 텍스트를 AI에게 전달)
    const hardFilterQuestions = await generateHardFiltersForCategory(category);
    const hardFilterQuestionsText = hardFilterQuestions
      .slice(0, 5)
      .filter(q => q.type !== 'review_priorities') // 리뷰 우선순위 타입 제외
      .map(q => `- ${q.question}`)
      .join('\n');

    const specHints = CATEGORY_SPEC_HINTS[category] || '스펙, 성능, 편의성, 가격대';
    const situationHints = CATEGORY_SITUATION_HINTS[category] || '사용 상황, 사용 환경, 생활 패턴';

    const systemPrompt = `당신은 쇼핑 전문 상담사입니다.

${categoryName}을 구매하려는 사용자가 **추천 서비스에 처음 입력할 법한 문장** 3개와, 입력을 유도하는 **힌트 문장** 1개를 생성해주세요.

## 세 가지 유형의 예시 (각 1개씩):

### 유형 A: 현재 불편/문제점 (1개)
- 지금 쓰는 제품의 **매우 구체적인 불만** 또는 **해결하고 싶은 문제**를 묘사하세요.
- 관련 특징: ${specHints}

### 유형 B: 사용자 상황 (1개)
- **사용 환경, 빈도, 생활 패턴, 주거 환경** 등 구체적 정보를 조합하세요.
- 관련 정보: ${situationHints}

### 유형 C: 원하는 특징/조건 (1개)
- 단순히 '가성비'가 아니라, **왜 그 특징이 필요한지** 이유를 포함한 구체적인 조건

## 힌트 문장 생성 규칙:
- 이 카테고리에서 **사용자가 입력하면 좋을 정보**를 안내하는 문장
- 아래 "이 카테고리의 주요 질문들"을 참고해서 **구체적인 정보 항목**을 자연스럽게 언급
- 형식: "~를 말씀해주시면 좋아요" 또는 "~를 알려주시면 도움이 돼요"
- 예시: "사용 환경과 선호 브랜드 등을 말씀해주시면 좋아요"
- **25~35자**로 간결하면서도 구체적으로

**이 카테고리의 주요 질문들:**
${hardFilterQuestionsText || '- 사용자의 상황이나 환경'}

## 중요 규칙:
1. **"~추천해주세요" 금지** - 상황만 설명하세요.
2. **물음표(?) 금지**
3. 문장 끝맺음: "~원해요", "~필요해요", "~예요", "~이에요", "~있어요", "~중요해요", "~힘들어요", "~찾아요"
4. 각 예시는 **30~50자 내외**로 아주 구체적으로 작성하세요. (단순한 단어 나열 금지)
5. 3개 예시가 서로 중복되지 않게 상황을 다양하게 설정하세요.`;

    const userPrompt = `**카테고리:** ${categoryName} (${category})

${categoryName} 추천 서비스에 사용자가 **처음 입력할 구체적이고 생생한 상황/조건** 3개와 **힌트 문장** 1개를 생성하세요.
단순히 "무거워요", "디자인이 별로예요" 같은 짧은 문장이 아니라, 실제 사용자들이 겪는 **디테일한 상황**을 묘사해야 합니다.

유형 A(불편/문제점) 1개, 유형 B(사용자 상황) 1개, 유형 C(원하는 특징) 1개씩 균형있게 생성하세요.
"~추천해주세요" 형태는 절대 금지입니다.

**응답 형식 (JSON):**
{
  "examples": [
    "지금 쓰는 제품은 소음이 너무 커서 층간소음이 걱정될 정도라 조용한 걸 찾고 있어요",
    "매일 출퇴근할 때 들고 다녀야 해서 최대한 가볍고 폴딩이 간편한 모델이 필요해요",
    "혼자서 관리하기에 구조가 너무 복잡하지 않고 세척이 편리한 제품이면 좋겠어요"
  ],
  "hint": "사용 환경과 가장 중요하게 생각하는 특징 등을 말씀해주시면 좋아요"
}`;

    const model = getModel(0.7);

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<GenerateContextExamplesResponse>(response);

    // 카테고리별 기본 예시 (3개) - 유형별 1개씩
    const defaultExamples: Record<string, string[]> = {
      milk_powder_port: [
        '지금 쓰는 포트 물 끓는 소리가 너무 커서 밤수유 때 아기가 깨서 힘들어요',
        '생후 90일 6.5kg 아기이고 밤수유를 하루에 3번 이상 하고 있어요',
        '손이 끝까지 들어가서 시원하게 통세척 할 수 있는 제품이 필요해요',
      ],
      formula_pot: [
        '지금 쓰는 포트 물 끓는 소리가 너무 커서 밤수유 때 아기가 깨서 힘들어요',
        '생후 90일 6.5kg 아기이고 밤수유를 하루에 3번 이상 하고 있어요',
        '손이 끝까지 들어가서 시원하게 통세척 할 수 있는 제품이 필요해요',
      ],
      car_seat: [
        '지금 쓰는 카시트는 각도 조절이 세밀하지 않아서 아이 목이 자꾸 꺾여요',
        '생후 180일 8.5kg 아기인데 카시트가 벌써 꽉 끼는 느낌이라 고민이에요',
        '승하차가 편하도록 360도 회전이 부드럽게 되는 모델이 꼭 필요해요',
      ],
      stroller: [
        '디럭스라 너무 무거워서 혼자 아기 데리고 나갈 때 들고 계단 오르기 힘들어요',
        '생후 120일 된 아기인데 이제 디럭스에서 절충형으로 바꾸려 고민 중이에요',
        '아이와 눈을 맞추며 주행할 수 있도록 양대면 전환이 쉬운 제품을 찾아요',
      ],
      diaper: [
        '밤에 통잠을 자는데 기저귀 흡수력이 부족한지 아침마다 옷이 젖어있어요',
        '생후 200일 9.5kg 꿀벅지 여아인데 4단계가 작고 5단계는 큰 것 같아요',
        '뭉침 현상이 적고 소변을 본 후에도 보송보송함이 오래 유지되면 좋겠어요',
      ],
    };

    const fallbackExamples = defaultExamples[category] || [
      '지금 쓰는 제품이 불편해서 새로 바꾸려고 해요',
      '처음 구매해보는 거라 어떤 기준으로 골라야 할지 잘 몰라요',
      '가성비 좋으면서도 품질이 검증된 제품을 찾고 있어요',
    ];

    const examples = parsed.examples || [];
    while (examples.length < 3) {
      examples.push(fallbackExamples[examples.length] || fallbackExamples[examples.length % fallbackExamples.length]);
    }

    // 힌트 처리 (AI가 생성하지 못한 경우 기본값 - situationHints 기반)
    const defaultHint = `${situationHints.split(',').slice(0, 2).map(s => s.trim()).join('과 ')} 등을 알려주시면 도움이 돼요`;
    const hint = parsed.hint || defaultHint;

    console.log('🎯 Generated context examples for', categoryName, ':', examples);
    console.log('💡 Generated hint:', hint);

    return NextResponse.json({ examples: examples.slice(0, 3), hint });

  } catch (error) {
    console.error('Generate context examples error:', error);
    return NextResponse.json({
      examples: [
        '지금 쓰는 제품이 불편해서 새로 바꾸려고 해요',
        '처음 구매해보는 거라 어떤 기준으로 골라야 할지 잘 몰라요',
        '가성비 좋으면서도 품질이 검증된 제품을 찾고 있어요',
      ],
      hint: '상황과 선호하는 조건을 말씀해주시면 좋아요',
    });
  }
}
