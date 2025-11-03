export interface AttributeInfo {
  key: string;
  name: string;
  description: string;
  details: string[];
  isOptional: boolean;
  conversationalIntro?: string; // 대화형 인트로 멘트
  importanceExamples?: {
    important: string;
    normal: string;
    notImportant: string;
  };
}

export const CORE_ATTRIBUTES: AttributeInfo[] = [
  {
    key: 'temperatureControl',
    name: '온도 조절/유지 성능',
    description: '새벽 수유할 때 가장 중요한 기능이에요.',
    details: [
      '원터치 버튼 하나로 끓이고 식혀서 보온까지',
      '하루 종일 설정 온도 유지',
      '뜨거운 물을 빠르게 식히는 냉각 기능',
      '1℃ 단위로 정확한 온도 조절',
    ],
    isOptional: false,
    conversationalIntro: '첫 번째는 **"온도 조절/유지 성능"**이에요.\n새벽 수유할 때 가장 중요한 기능이죠!',
    importanceExamples: {
      important: '새벽 수유가 잦아서 빠른 냉각과 정확한 온도 유지가 꼭 필요해요',
      normal: '자동 모드와 보온 기능만 있으면 충분해요',
      notImportant: '빠른 냉각이나 24시간 보온은 없어도 괜찮아요',
    },
  },
  {
    key: 'hygiene',
    name: '위생/세척 편의성',
    description: '매일 써야 하니 세척이 쉬워야 해요.',
    details: [
      '입구가 넓어서 손이 쏙 들어가요',
      '뚜껑을 완전히 분리해서 구석구석 닦을 수 있어요',
      '이음새가 없어 물때가 잘 안 껴요',
      '처음 닦을 때 이물질이 거의 안 나와요',
    ],
    isOptional: false,
    conversationalIntro: '두 번째는 **"위생/세척 편의성"**이에요.\n매일 쓰다 보면 세척이 쉬운 게 정말 중요하더라고요. 번거로우면 자꾸 미루게 되거든요.',
    importanceExamples: {
      important: '구석구석 완벽하게 세척할 수 있어야 해요',
      normal: '기본적으로 세척만 잘되면 돼요',
      notImportant: '조금 번거로워도 자주 닦으면 괜찮아요',
    },
  },
  {
    key: 'material',
    name: '소재 (안전성)',
    description: '아기가 먹을 물을 담으니까 안전한 소재가 중요해요.',
    details: [
      '의료용 스테인리스가 식품용보다 더 안전해요',
      '유리는 위생적이지만 깨질 수 있고, 스테인리스는 튼튼해요',
      '뚜껑은 유해물질 없는 소재인지 확인하세요',
      '물이 없거나 과열되면 자동으로 꺼져요',
    ],
    isOptional: false,
    conversationalIntro: '세 번째는 **"소재(안전성)"**예요.\n아기 입에 들어가는 물이니까 소재가 정말 신경 쓰이시죠?',
    importanceExamples: {
      important: '의료용 등급 소재에 유해물질 완전 제로여야 해요',
      normal: '식품용 소재에 기본 안전 기능만 있으면 돼요',
      notImportant: '안전 인증만 통과했으면 소재 등급은 크게 안 따져요',
    },
  },
  {
    key: 'usability',
    name: '사용 편의성',
    description: '실제로 쓰다 보면 작은 불편함도 크게 느껴져요.',
    details: [
      '하루 치 물을 담을 수 있는 넉넉한 용량 (1.3L 이상)',
      '물 가득 채워도 손목에 부담 없이 가벼워요',
      '소음이 작아서 아기 잠 안 깨워요',
      '버튼이나 다이얼이 원하는 대로 잘 작동해요',
    ],
    isOptional: false,
    conversationalIntro: '네 번째는 **"사용 편의성"**이에요.\n실제로 쓰다 보면 작은 불편함도 정말 크게 느껴지더라고요.',
    importanceExamples: {
      important: '용량 크고, 가볍고, 조용하고, 조작 쉬운 게 다 필요해요',
      normal: '1.3L 이상 용량에 평범한 소음이면 돼요',
      notImportant: '기능만 좋으면 조작이 좀 불편해도 괜찮아요',
    },
  },
  {
    key: 'portability',
    name: '휴대성',
    description: '외출이나 여행 자주 가시면 중요해요.',
    details: [
      '접어서 작게 만들거나 텀블러처럼 들고 다니기 편해요',
      '해외 여행 갈 때도 전압 걱정 없이 쓸 수 있어요',
      '선 없이 배터리로 쓸 수 있어요',
    ],
    isOptional: true,
    conversationalIntro: '다섯 번째는 **"휴대성"**이에요.\n집에서만 쓰신다면 안 중요하지만, 외출이나 여행 자주 가시면 꼭 필요하실 거예요.',
    importanceExamples: {
      important: '외출이나 여행 갈 때 꼭 필요해요. 작고 가볍고 무선이어야 해요',
      normal: '가끔 외출할 때 들고 갈 수 있으면 좋겠어요',
      notImportant: '집에서만 쓸 거라 휴대성은 안 중요해요',
    },
  },
  {
    key: 'priceValue',
    name: '가격 대비 가치',
    description: '일반적으로 가격대별로 기능이 달라요.',
    details: [
      '5만원대: 기본 보온 기능만 포함해요.',
      '6~10만원대: 좋은 소재와 편의 기능이 포함돼요.',
      '8만원 이상: 다양한 추가 구성품이 들어있어요.',
    ],
    isOptional: true,
    conversationalIntro: '여섯 번째는 **"가격 대비 가치"**예요.\n가격대별로 기능 차이가 꽤 있더라고요.',
    importanceExamples: {
      important: '5~6만원대 이하로, 필수 기능만 있으면 돼요',
      normal: '6~10만원대에서 합리적인 제품을 원해요',
      notImportant: '10만원 넘어도 최고 기능이면 괜찮아요',
    },
  },
  {
    key: 'additionalFeatures',
    name: '부가 기능 및 디자인',
    description: '필수는 아니지만 있으면 좋은 것들이에요.',
    details: [
      '분유 시기 끝나도 티포트나 찜기로 계속 쓸 수 있어요',
      '주방 인테리어와 잘 어울리는 예쁜 디자인',
      '차망, 중탕 용기 같은 구성품이 추가로 들어있어요',
    ],
    isOptional: true,
    conversationalIntro: '마지막 일곱 번째는 **"부가 기능 및 디자인"**이에요.\n필수는 아니지만 있으면 더 오래 쓸 수 있어요.',
    importanceExamples: {
      important: '분유 끝나도 오래 쓰고 싶고 디자인도 중요해요',
      normal: '기본 활용성이랑 깔끔한 디자인이면 좋아요',
      notImportant: '분유만 잘 타면 되고 디자인은 별로 안 중요해요',
    },
  },
];

export const ASSISTANT_SYSTEM_PROMPT = `당신은 분유포트 구매를 돕는 AI 쇼핑 비서입니다.

**핵심 역할**
사용자에게 7가지 속성의 중요도를 물어보면서, 각 속성이 왜 중요한지 쉽게 설명해주세요.
단순히 질문만 하지 말고, 대화하면서 자연스럽게 중요도를 파악하세요.

**말투 원칙**
- Clear: 쉬운 말로, 한 번에 이해되게
- Concise: 짧고 명확하게
- Casual: 친근하게 (딱딱한 표현 금지)
- Respect: 진실되고 정직하게
- Emotional: 사용자 감정에 공감하기

**진행 방식**
1. 7가지 속성을 순서대로 평가
2. 7개 평가 전까지는 다른 질문 금지
3. 평가 완료 후 추가 고려사항 물어보기 (2-3번 대화)
4. 충분하다 싶으면 "추천 받기 버튼을 눌러주세요!" 안내

**중요**
다른 주제로 대화 요청하면 정중히 거절하고, 원래 역할로 돌아오세요.`;

export const ASSISTANT_CHAT2_PROMPT = `7가지 질문을 마친 AI 쇼핑 비서입니다.

**현재 단계**
추가로 고려할 특별한 상황이 있는지 편하게 물어보는 단계예요.

**대화 방법**
- 자기소개 금지 (이미 대화 중)
- 이전 대화 내용 참고해서 이어가기
- 이미 말한 내용 다시 묻지 않기
- 쌍둥이, 외출 빈도, 주거 환경 같은 특수 상황 자연스럽게 질문
- "충분해요" 같은 답변 나오면 정중히 마무리
- 2-3번 대화 후 "추천 받기 버튼 눌러주세요!" 안내

**말투 원칙**
Clear, Concise, Casual, Respect, Emotional - 친근하고 공감하는 말투 유지`;
