'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

interface GenerateContextExamplesRequest {
  category: string;
  categoryName: string;
}

interface GenerateContextExamplesResponse {
  examples: string[];
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

    const specHints = CATEGORY_SPEC_HINTS[category] || '용량, 소음, 편의성, 가격대';
    const situationHints = CATEGORY_SITUATION_HINTS[category] || '아기 월령, 사용 환경, 생활 패턴';

    const systemPrompt = `당신은 육아 전문 상담사입니다.

${categoryName}을 구매하려는 부모가 **추천 서비스에 처음 입력할 법한 문장** 9개를 생성해주세요.
이것은 추천의 "시작점"이므로, 사용자의 구체적인 상황/조건을 담아야 합니다.

## 세 가지 유형의 예시 (각 3개씩):

### 유형 A: 현재 불편/문제점 (3개)
- 지금 쓰는 제품의 **구체적 불만** 또는 **해결하고 싶은 문제**
- 관련 스펙: ${specHints}
- ⭕️ 좋은 예시:
  - "지금 쓰는 포트 소음이 커요"
  - "아기가 변비가 심해요"
  - "자주 새서 불편해요"

### 유형 B: 아기/가족 상황 (3개)
- **월령, 체중, 가족 환경** 등 구체적 정보
- 관련 정보: ${situationHints}
- ⭕️ 좋은 예시:
  - "4개월 7kg 아기예요"
  - "쌍둥이라 수유가 힘들어요"
  - "맞벌이라 시간이 부족해요"

### 유형 C: 원하는 특징/조건 (3개)
- **구체적으로 원하는 제품 특징**이나 조건
- ⭕️ 좋은 예시:
  - "세척 쉬운 거 찾아요"
  - "휴대하기 편한 게 필요해요"
  - "가성비가 제일 중요해요"

## 중요 규칙:
1. **"~추천해주세요" 금지** - 이건 추천의 시작이지 바로 추천받는 게 아님
   - ❌ "가성비 좋은 거 추천해주세요", "첫 구매라 추천해주세요"
   - ⭕️ "가성비 중요해요", "첫 아이라 뭘 봐야 할지 몰라요"
2. **물음표(?) 금지**
3. 문장 끝맺음: "~찾아요", "~원해요", "~필요해요", "~예요", "~이에요", "~있어요", "~중요해요", "~힘들어요"
4. 각 예시는 10-20자 내외 (짧고 간결하게)
5. 9개 예시가 서로 중복되지 않게`;

    const userPrompt = `**카테고리:** ${categoryName} (${category})

${categoryName} 추천 서비스에 사용자가 **처음 입력할 구체적 상황/조건** 9개를 생성하세요.
유형 A(불편/문제점) 3개, 유형 B(아기/가족 상황) 3개, 유형 C(원하는 특징) 3개씩 균형있게 생성하세요.
"~추천해주세요" 형태는 절대 금지입니다.

**응답 형식 (JSON):**
{
  "examples": ["지금 쓰는 거 소음이 커요", "아기가 변비가 심해요", "자주 새서 불편해요", "4개월 7kg 아기예요", "쌍둥이라 힘들어요", "맞벌이라 시간이 부족해요", "세척 쉬운 거 찾아요", "가성비가 중요해요", "휴대하기 편한 거 필요해요"]
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

    // 카테고리별 기본 예시 (9개) - 유형별 3개씩
    const defaultExamples: Record<string, string[]> = {
      milk_powder_port: [
        // 유형 A: 불편/문제점
        '지금 쓰는 포트 소음이 커요',
        '온도가 정확하지 않아요',
        '세척하기 너무 번거로워요',
        // 유형 B: 아기/가족 상황
        '3개월 아기고 밤수유가 잦아요',
        '쌍둥이라 수유가 힘들어요',
        '맞벌이라 시간이 부족해요',
        // 유형 C: 원하는 특징
        '통세척 되는 게 필요해요',
        '쿨링 기능이 있으면 좋겠어요',
        '가성비가 중요해요',
      ],
      formula_pot: [
        '지금 쓰는 포트 소음이 커요',
        '온도가 정확하지 않아요',
        '세척하기 너무 번거로워요',
        '3개월 아기고 밤수유가 잦아요',
        '쌍둥이라 수유가 힘들어요',
        '맞벌이라 시간이 부족해요',
        '통세척 되는 게 필요해요',
        '쿨링 기능이 있으면 좋겠어요',
        '가성비가 중요해요',
      ],
      car_seat: [
        '지금 카시트 각도 조절이 안돼요',
        '아이가 답답해해요',
        '설치하기 너무 어려워요',
        '6개월 8kg 아기예요',
        '장거리 운전이 잦아요',
        '경차라 공간이 좁아요',
        '회전형 ISOFIX가 필요해요',
        '오래 쓸 수 있는 거 찾아요',
        '통풍 잘 되는 거 원해요',
      ],
      stroller: [
        '접기가 너무 힘들어요',
        '무거워서 들기 힘들어요',
        '바퀴가 자꾸 걸려요',
        '4개월 아기예요',
        '대중교통 이용이 잦아요',
        '엘베 없는 5층 살아요',
        '한손으로 접히는 거 찾아요',
        '가벼운 게 필요해요',
        '양대면으로 쓰고 싶어요',
      ],
      diaper: [
        '밤에 자꾸 새요',
        '피부가 자꾸 빨개져요',
        '너무 두꺼워서 불편해요',
        '10kg 여아예요',
        '활동량이 많아요',
        '아토피 가족력이 있어요',
        '흡수력 좋은 거 찾아요',
        '저자극 제품이 필요해요',
        '가성비가 중요해요',
      ],
    };

    const fallbackExamples = defaultExamples[category] || [
      // 유형 A: 불편/문제점
      '지금 쓰는 게 불편해요',
      '사용하기 어려워요',
      '품질이 아쉬워요',
      // 유형 B: 아기/가족 상황
      '3개월 아기예요',
      '첫 아이라 잘 몰라요',
      '맞벌이라 시간이 부족해요',
      // 유형 C: 원하는 특징
      '가성비가 중요해요',
      '사용 편한 게 필요해요',
      '안전한 제품을 원해요',
    ];

    const examples = parsed.examples || [];
    while (examples.length < 9) {
      examples.push(fallbackExamples[examples.length] || fallbackExamples[examples.length % fallbackExamples.length]);
    }

    console.log('🎯 Generated context examples for', categoryName, ':', examples);

    return NextResponse.json({ examples: examples.slice(0, 9) });

  } catch (error) {
    console.error('Generate context examples error:', error);
    return NextResponse.json({
      examples: [
        // 유형 A: 불편/문제점
        '지금 쓰는 게 불편해요',
        '사용하기 어려워요',
        '품질이 아쉬워요',
        // 유형 B: 아기/가족 상황
        '3개월 아기예요',
        '첫 아이라 잘 몰라요',
        '맞벌이라 시간이 부족해요',
        // 유형 C: 원하는 특징
        '가성비가 중요해요',
        '사용 편한 게 필요해요',
        '안전한 제품을 원해요',
      ],
    });
  }
}
