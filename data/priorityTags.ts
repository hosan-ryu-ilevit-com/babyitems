import { CoreAttributeKey } from '@/types';

/**
 * 앵커 제품 정의
 * 사용자에게 보여줄 대표 제품 3개
 */
export const ANCHOR_PRODUCTS = [
  {
    id: '6962086794', // 보르르 분유포트
    type: 'ranking' as const,
    label: '국민템',
    description: '가장 많이 선택하는'
  },
  {
    id: '7118428974', // 리웨이 분유포트
    type: 'value' as const,
    label: '가성비',
    description: '합리적인 가격의'
  },
  {
    id: '7647695393', // 베이비부스트 이지 분유포트
    type: 'premium' as const,
    label: '프리미엄',
    description: '최고급 기능의'
  }
];

/**
 * 장점 태그 정의
 * 각 태그는 특정 핵심 속성과 연결됩니다
 */
export interface ProsTag {
  id: string;
  text: string;
  relatedAttribute: CoreAttributeKey;
  sourceProduct?: string; // 어떤 앵커 제품에서 나온 장점인지
}

export const PROS_TAGS: ProsTag[] = [
  // 보르르 제품 관련 (국민템)
  {
    id: 'temp-precise',
    text: '1도 단위로 정확하게 온도 조절할 수 있어요',
    relatedAttribute: 'temperatureControl',
    sourceProduct: '6962086794'
  },
  {
    id: 'hygiene-thorough',
    text: '넓은 입구로 손세척이 편하고 통세척 가능해요',
    relatedAttribute: 'hygiene',
    sourceProduct: '6962086794'
  },
  {
    id: 'material-safe',
    text: '붕규산 유리와 의료용 스텐(SUS316)이라 안심돼요',
    relatedAttribute: 'material',
    sourceProduct: '6962086794'
  },
  {
    id: 'temp-onetouch',
    text: '원터치 분유 모드로 복잡한 조작 없이 간편해요',
    relatedAttribute: 'temperatureControl',
    sourceProduct: '6962086794'
  },

  // 리웨이 제품 관련 (가성비)
  {
    id: 'temp-cooling',
    text: '쿨링팬으로 1분 1초가 급할 때 빠르게 식혀줘요',
    relatedAttribute: 'temperatureControl',
    sourceProduct: '7118428974'
  },
  {
    id: 'price-value',
    text: '5만원대로 필요한 기능은 다 갖췄어요',
    relatedAttribute: 'priceValue',
    sourceProduct: '7118428974'
  },
  {
    id: 'temp-keepwarm',
    text: '영구보온 기능으로 미리 끓여두면 편해요',
    relatedAttribute: 'temperatureControl',
    sourceProduct: '7118428974'
  },
  {
    id: 'hygiene-visible',
    text: '투명한 유리라 속이 훤히 보여 위생 상태 확인 가능해요',
    relatedAttribute: 'hygiene',
    sourceProduct: '7118428974'
  },

  // 베이비부스트 제품 관련 (프리미엄)
  {
    id: 'usability-auto',
    text: '자동 출수 기능으로 한 손으로도 편하게 사용해요',
    relatedAttribute: 'usability',
    sourceProduct: '7647695393'
  },
  {
    id: 'hygiene-detach',
    text: '분리형 유리 포트로 구석구석 완벽하게 세척돼요',
    relatedAttribute: 'hygiene',
    sourceProduct: '7647695393'
  },
  {
    id: 'usability-silent',
    text: '무음 모드가 있어 새벽 수유에 아기 안 깨워요',
    relatedAttribute: 'usability',
    sourceProduct: '7647695393'
  },
  {
    id: 'additional-custom',
    text: '국내 분유 농도에 맞춘 자동 출수량 조절 기능이 있어요',
    relatedAttribute: 'additionalFeatures',
    sourceProduct: '7647695393'
  }
];

/**
 * 단점 태그 정의
 */
export interface ConsTag {
  id: string;
  text: string;
  relatedAttribute: CoreAttributeKey;
  sourceProduct?: string; // 어떤 앵커 제품에서 나온 단점인지
}

export const CONS_TAGS: ConsTag[] = [
  // 보르르 제품 관련 단점 (국민템)
  {
    id: 'hygiene-gap',
    text: '뚜껑이나 패킹 틈새에 물이 고여서 찝찝해요',
    relatedAttribute: 'hygiene',
    sourceProduct: '6962086794'
  },
  {
    id: 'usability-sensitive',
    text: '터치 버튼이 너무 예민하거나 반응이 안 좋아요',
    relatedAttribute: 'usability',
    sourceProduct: '6962086794'
  },
  {
    id: 'material-quality',
    text: '연마제나 플라스틱 냄새가 심해요',
    relatedAttribute: 'material',
    sourceProduct: '6962086794'
  },

  // 리웨이 제품 관련 단점 (가성비)
  {
    id: 'hygiene-narrow',
    text: '입구가 좁아 손이 안 들어가서 세척이 불편해요',
    relatedAttribute: 'hygiene',
    sourceProduct: '7118428974'
  },
  {
    id: 'usability-noise',
    text: '쿨링팬이나 터치 버튼 소음이 거슬려요',
    relatedAttribute: 'usability',
    sourceProduct: '7118428974'
  },
  {
    id: 'temp-slow',
    text: '물 끓는 속도나 냉각 속도가 너무 느려요',
    relatedAttribute: 'temperatureControl',
    sourceProduct: '7118428974'
  },
  {
    id: 'usability-operation',
    text: '버튼 조작이 복잡하거나 직관적이지 않아요',
    relatedAttribute: 'usability',
    sourceProduct: '7118428974'
  },

  // 베이비부스트 제품 관련 단점 (프리미엄)
  {
    id: 'material-heavy',
    text: '유리 재질이라 무겁고 깨질까 봐 불안해요',
    relatedAttribute: 'material',
    sourceProduct: '7647695393'
  },
  {
    id: 'portability-bulky',
    text: '무겁고 커서 이동하거나 보관이 불편해요',
    relatedAttribute: 'portability',
    sourceProduct: '7647695393'
  },
  {
    id: 'price-expensive',
    text: '가격이 부담스러워 선뜻 구매하기 망설여져요',
    relatedAttribute: 'priceValue',
    sourceProduct: '7647695393'
  }
];

/**
 * 태그 선택 제한
 */
export const TAG_SELECTION_LIMITS = {
  pros: { min: 1, max: 5 },
  cons: { min: 0, max: 4 }
} as const;
