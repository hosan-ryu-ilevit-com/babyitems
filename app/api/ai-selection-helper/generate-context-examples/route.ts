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

${categoryName}을 구매하려는 부모가 **추천 서비스에 처음 입력할 법한 문장** 6개를 생성해주세요.
실제로 사용자가 타이핑할 것 같은 자연스러운 요청/상황 설명이어야 합니다.

## 두 가지 유형의 부모를 모두 고려:

### 유형 A: 원하는 제품 스펙을 아는 부모 (3개)
- 이미 사용 중인 제품의 **불만**이나 **원하는 스펙**을 요청하는 느낌으로
- 관련 스펙: ${specHints}
- 좋은 예시 (실제 요청처럼):
  - "지금 쓰는 포트 소음이 커서 저소음 모델 찾아요"
  - "통세척 가능한 포트가 좋아요"
  - "밤에 자꾸 새서 흡수력 좋은 걸로 바꾸려고요"
- 나쁜 예시 (기능 설명/진술):
  - "500ml 용량으로 충분할 것 같아요" ❌
  - "차량용 전원 연결이 돼요" ❌

### 유형 B: 첫 구매라 상황만 아는 부모 (3개)
- 자신의 상황을 설명하며 도움을 요청하는 느낌으로
- 관련 정보: ${situationHints}
- 좋은 예시 (상황 설명):
  - "4개월 아기인데 뭘 사야 할지 모르겠어요"
  - "곧 퇴원하는데 첫 구매라 추천해주세요"
  - "SUV 타는데 어떤 게 맞을까요"
- 나쁜 예시 (너무 단순):
  - "아기예요" ❌
  - "첫 구매예요" ❌

## 규칙:
1. 각 예시는 12-30자
2. 실제 사용자가 입력할 것 같은 자연스러운 말투
3. "~찾아요", "~좋아요", "~바꾸려고요", "~추천해주세요", "~모르겠어요" 등 요청형 어미
4. 단순 기능 나열이 아닌, 요청/상황 설명 느낌으로`;

    const userPrompt = `**카테고리:** ${categoryName} (${category})

${categoryName} 추천 서비스에 사용자가 **처음 입력할 법한** 문장 6개를 생성하세요.
실제로 타이핑할 것 같은 자연스러운 요청/상황 설명이어야 합니다.

**응답 형식 (JSON):**
{
  "examples": ["지금 쓰는 포트 소음이 커서 저소음 찾아요", "4개월 아기인데 뭘 사야 할지 모르겠어요", ...]
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

    // 카테고리별 기본 예시 (6개) - 실제 요청 느낌으로
    const defaultExamples: Record<string, string[]> = {
      milk_powder_port: [
        '지금 쓰는 포트 소음이 커서 저소음 찾아요',
        '통세척 가능한 포트가 좋아요',
        '쿨링 기능 있는 거 추천해주세요',
        '3개월 아기인데 뭘 사야 할지 모르겠어요',
        '밤수유 자주 하는데 추천해주세요',
        '곧 퇴원하는데 첫 구매라 추천해주세요',
      ],
      formula_pot: [
        '지금 쓰는 포트 소음이 커서 저소음 찾아요',
        '통세척 가능한 포트가 좋아요',
        '쿨링 기능 있는 거 추천해주세요',
        '3개월 아기인데 뭘 사야 할지 모르겠어요',
        '밤수유 자주 하는데 추천해주세요',
        '곧 퇴원하는데 첫 구매라 추천해주세요',
      ],
      car_seat: [
        '회전되는 ISOFIX 카시트 찾아요',
        '신생아부터 오래 쓸 수 있는 거 있나요',
        '통풍 잘 되는 거 추천해주세요',
        '6개월 아기인데 뭘 사야 할지 모르겠어요',
        'SUV 타는데 어떤 게 맞을까요',
        '첫 카시트 구매라 추천해주세요',
      ],
      stroller: [
        '가볍고 한손으로 접히는 거 찾아요',
        '바퀴 큰 거 추천해주세요',
        '기내 반입 되는 거 있나요',
        '4개월 아기인데 어떤 게 좋을까요',
        '엘베 없는 5층인데 가벼운 거 추천해주세요',
        '지하철 자주 타는데 뭐가 좋을까요',
      ],
      diaper: [
        '밤에 자꾸 새서 흡수력 좋은 걸로 바꾸려고요',
        '4단계로 바꾸려는데 뭐가 좋을까요',
        '얇으면서 안 새는 거 추천해주세요',
        '10kg 여아인데 어떤 게 맞을까요',
        '피부 민감해서 순한 거 찾아요',
        '밤에 오래 차는데 뭐가 좋을까요',
      ],
    };

    const fallbackExamples = defaultExamples[category] || [
      '지금 쓰는 거 불편해서 바꾸려고요',
      '가성비 좋은 거 추천해주세요',
      '세척 편한 거 있나요',
      '3개월 아기인데 뭘 사야 할지 모르겠어요',
      '첫째 아이라 추천해주세요',
      '맞벌이라 편한 게 필요해요',
    ];

    const examples = parsed.examples || [];
    while (examples.length < 6) {
      examples.push(fallbackExamples[examples.length] || fallbackExamples[0]);
    }

    console.log('🎯 Generated context examples for', categoryName, ':', examples);

    return NextResponse.json({ examples: examples.slice(0, 6) });

  } catch (error) {
    console.error('Generate context examples error:', error);
    return NextResponse.json({
      examples: [
        '지금 쓰는 거 불편해서 바꾸려고요',
        '가성비 좋은 거 추천해주세요',
        '세척 편한 거 있나요',
        '3개월 아기인데 뭘 사야 할지 모르겠어요',
        '첫째 아이라 추천해주세요',
        '맞벌이라 편한 게 필요해요',
      ],
    });
  }
}
