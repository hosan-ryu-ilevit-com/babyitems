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
 * 각 태그는 하나 이상의 핵심 속성과 연결됩니다
 */
export interface ProsTag {
  id: string;
  text: string;
  relatedAttributes: Array<{
    attribute: CoreAttributeKey;
    weight: number; // 0.3~1.0, 주 속성은 1.0, 부 속성은 0.3~0.5
  }>;
  sourceProduct?: string; // 어떤 앵커 제품에서 나온 장점인지
}

export const PROS_TAGS: ProsTag[] = [
  // 보르르 제품 관련 (국민템)
  {
    id: 'temp-precise',
    text: '1도 단위로 정확하게 온도 조절할 수 있어요',
    relatedAttributes: [
      { attribute: 'temperatureControl', weight: 1.0 }, // 주 속성: 정확한 온도 조절
      { attribute: 'usability', weight: 0.3 }            // 부 속성: 정밀한 조작
    ],
    sourceProduct: '6962086794'
  },
  {
    id: 'hygiene-thorough',
    text: '넓은 입구로 손세척이 편하고 통세척 가능해요',
    relatedAttributes: [
      { attribute: 'hygiene', weight: 1.0 },     // 주 속성: 철저한 세척
      { attribute: 'usability', weight: 0.4 }    // 부 속성: 편한 세척
    ],
    sourceProduct: '6962086794'
  },
  {
    id: 'material-safe',
    text: '붕규산 유리와 의료용 스텐(SUS316)이라 안심돼요',
    relatedAttributes: [
      { attribute: 'material', weight: 1.0 }     // 주 속성: 안전한 소재
    ],
    sourceProduct: '6962086794'
  },
  {
    id: 'temp-onetouch',
    text: '원터치 분유 모드로 복잡한 조작 없이 간편해요',
    relatedAttributes: [
      { attribute: 'usability', weight: 1.0 },           // 주 속성: 간편한 사용
      { attribute: 'temperatureControl', weight: 0.3 }   // 부 속성: 온도 관련 기능
    ],
    sourceProduct: '6962086794'
  },

  // 리웨이 제품 관련 (가성비)
  {
    id: 'temp-cooling',
    text: '쿨링팬으로 1분 1초가 급할 때 빠르게 식혀줘요',
    relatedAttributes: [
      { attribute: 'temperatureControl', weight: 1.0 },  // 주 속성: 빠른 냉각
      { attribute: 'additionalFeatures', weight: 0.4 }   // 부 속성: 쿨링팬 부가 기능
    ],
    sourceProduct: '7118428974'
  },
  {
    id: 'price-value',
    text: '저렴한 편이면서 필요한 기능은 다 갖췄어요',
    relatedAttributes: [
      { attribute: 'priceValue', weight: 1.0 }   // 주 속성: 가격 대비 가치
    ],
    sourceProduct: '7118428974'
  },
  {
    id: 'temp-keepwarm',
    text: '영구보온 기능으로 미리 끓여두면 편해요',
    relatedAttributes: [
      { attribute: 'temperatureControl', weight: 1.0 },  // 주 속성: 온도 유지
      { attribute: 'usability', weight: 0.3 }            // 부 속성: 편의성
    ],
    sourceProduct: '7118428974'
  },
  {
    id: 'hygiene-visible',
    text: '투명한 유리라 속이 훤히 보여 위생 상태 확인 가능해요',
    relatedAttributes: [
      { attribute: 'hygiene', weight: 1.0 },     // 주 속성: 위생 확인
      { attribute: 'material', weight: 0.3 }     // 부 속성: 유리 재질
    ],
    sourceProduct: '7118428974'
  },

  // 베이비부스트 제품 관련 (프리미엄)
  {
    id: 'usability-auto',
    text: '자동 출수 기능으로 한 손으로도 편하게 사용해요',
    relatedAttributes: [
      { attribute: 'usability', weight: 1.0 },           // 주 속성: 편리한 사용
      { attribute: 'additionalFeatures', weight: 0.4 }   // 부 속성: 자동 출수 기능
    ],
    sourceProduct: '7647695393'
  },
  {
    id: 'hygiene-detach',
    text: '분리형 유리 포트로 구석구석 완벽하게 세척돼요',
    relatedAttributes: [
      { attribute: 'hygiene', weight: 1.0 },     // 주 속성: 완벽한 세척
      { attribute: 'usability', weight: 0.3 }    // 부 속성: 편한 세척
    ],
    sourceProduct: '7647695393'
  },
  {
    id: 'usability-silent',
    text: '무음 모드가 있어 새벽 수유에 아기 안 깨워요',
    relatedAttributes: [
      { attribute: 'usability', weight: 1.0 },           // 주 속성: 조용한 사용
      { attribute: 'additionalFeatures', weight: 0.5 }   // 부 속성: 무음 모드 기능
    ],
    sourceProduct: '7647695393'
  },
  {
    id: 'additional-custom',
    text: '국내 분유 농도에 맞춘 자동 출수량 조절 기능이 있어요',
    relatedAttributes: [
      { attribute: 'additionalFeatures', weight: 1.0 },  // 주 속성: 맞춤 기능
      { attribute: 'usability', weight: 0.4 }            // 부 속성: 편리한 사용
    ],
    sourceProduct: '7647695393'
  }
];

/**
 * 단점 태그 정의
 */
export interface ConsTag {
  id: string;
  text: string;
  relatedAttributes: Array<{
    attribute: CoreAttributeKey;
    weight: number; // 0.3~1.0, 주 속성은 1.0, 부 속성은 0.3~0.5
  }>;
  sourceProduct?: string; // 어떤 앵커 제품에서 나온 단점인지
}

/**
 * 추가 고려사항 태그 정의 (Step 2.5)
 * 앵커 제품에서 다루지 않는 속성들을 보완
 */
export interface AdditionalTag {
  id: string;
  text: string;
  relatedAttributes: Array<{
    attribute: CoreAttributeKey;
    weight: number; // 0.3~1.0, 주 속성은 1.0, 부 속성은 0.3~0.5
  }>;
}

export const CONS_TAGS: ConsTag[] = [
  // 보르르 제품 관련 단점 (국민템)
  {
    id: 'hygiene-gap',
    text: '뚜껑이나 패킹 틈새에 물이 고여서 찝찝해요',
    relatedAttributes: [
      { attribute: 'hygiene', weight: 1.0 }      // 주 속성: 위생 문제
    ],
    sourceProduct: '6962086794'
  },
  {
    id: 'usability-sensitive',
    text: '터치 버튼이 너무 예민하거나 반응이 안 좋아요',
    relatedAttributes: [
      { attribute: 'usability', weight: 1.0 }    // 주 속성: 조작 불편
    ],
    sourceProduct: '6962086794'
  },
  {
    id: 'material-quality',
    text: '연마제나 플라스틱 냄새가 심해요',
    relatedAttributes: [
      { attribute: 'material', weight: 1.0 },    // 주 속성: 소재 품질
      { attribute: 'hygiene', weight: 0.3 }      // 부 속성: 위생 관련
    ],
    sourceProduct: '6962086794'
  },

  // 리웨이 제품 관련 단점 (가성비)
  {
    id: 'hygiene-narrow',
    text: '입구가 좁아 손이 안 들어가서 세척이 불편해요',
    relatedAttributes: [
      { attribute: 'hygiene', weight: 1.0 },     // 주 속성: 세척 어려움
      { attribute: 'usability', weight: 0.4 }    // 부 속성: 불편한 사용
    ],
    sourceProduct: '7118428974'
  },
  {
    id: 'usability-noise',
    text: '쿨링팬이나 터치 버튼 소음이 거슬려요',
    relatedAttributes: [
      { attribute: 'usability', weight: 1.0 }    // 주 속성: 소음 불편
    ],
    sourceProduct: '7118428974'
  },
  {
    id: 'temp-slow',
    text: '물 끓는 속도나 냉각 속도가 너무 느려요',
    relatedAttributes: [
      { attribute: 'temperatureControl', weight: 1.0 }  // 주 속성: 느린 온도 변화
    ],
    sourceProduct: '7118428974'
  },
  {
    id: 'usability-operation',
    text: '버튼 조작이 복잡하거나 직관적이지 않아요',
    relatedAttributes: [
      { attribute: 'usability', weight: 1.0 }    // 주 속성: 복잡한 조작
    ],
    sourceProduct: '7118428974'
  },

  // 베이비부스트 제품 관련 단점 (프리미엄)
  {
    id: 'material-heavy',
    text: '유리 재질이라 무겁고 깨질까 봐 불안해요',
    relatedAttributes: [
      { attribute: 'material', weight: 1.0 },    // 주 속성: 소재 무게/안전성
      { attribute: 'portability', weight: 0.5 }  // 부 속성: 휴대 불편
    ],
    sourceProduct: '7647695393'
  },
  {
    id: 'portability-bulky',
    text: '무겁고 커서 이동하거나 보관이 불편해요',
    relatedAttributes: [
      { attribute: 'portability', weight: 1.0 }, // 주 속성: 휴대성
      { attribute: 'usability', weight: 0.3 }    // 부 속성: 불편한 이동
    ],
    sourceProduct: '7647695393'
  },
  {
    id: 'price-expensive',
    text: '가격이 부담스러워 선뜻 구매하기 망설여져요',
    relatedAttributes: [
      { attribute: 'priceValue', weight: 1.0 }   // 주 속성: 가격 부담
    ],
    sourceProduct: '7647695393'
  }
];

/**
 * 추가 고려사항 태그 (Step 2.5)
 * 앵커 제품 3개에서 다루지 않는 속성들을 보완하여 6개 속성 모두 커버
 */
export const ADDITIONAL_TAGS: AdditionalTag[] = [
  {
    id: 'portability-light',
    text: '가볍고 작아서 외출 시 휴대하기 편해요',
    relatedAttributes: [
      { attribute: 'portability', weight: 1.0 },      // 주 속성: 휴대성
      { attribute: 'usability', weight: 0.3 }         // 부 속성: 편의성
    ]
  },
  {
    id: 'design-aesthetic',
    text: '세련된 디자인으로 인테리어를 살려줘요',
    relatedAttributes: [
      { attribute: 'additionalFeatures', weight: 1.0 }  // 주 속성: 디자인
    ]
  },
  {
    id: 'display-intuitive',
    text: '직관적인 디스플레이로 온도와 상태를 한눈에 확인할 수 있어요',
    relatedAttributes: [
      { attribute: 'additionalFeatures', weight: 1.0 }, // 주 속성: 디스플레이
      { attribute: 'usability', weight: 0.3 }           // 부 속성: 편의성
    ]
  }
];

/**
 * 태그 선택 제한
 */
export const TAG_SELECTION_LIMITS = {
  pros: { min: 1, max: 5 },
  cons: { min: 0, max: 4 },
  additional: { min: 0, max: 3 } // 추가 고려사항은 선택적
} as const;

/**
 * 인기 태그 (가장 많이 선택되는 태그들)
 * 실제 사용자 데이터 기반으로 선정
 */
export const POPULAR_TAG_IDS = {
  pros: [
    'hygiene-thorough',  // 넓은 입구로 손세척 편함 - 위생은 최우선 관심사
    'material-safe',     // 안전한 소재 - 아기 제품이므로 매우 중요
    'temp-onetouch',     // 원터치 간편 - 육아맘의 편의성
    'temp-cooling'       // 쿨링팬 빠른 냉각 - 급할 때 빠른 조유
  ],
  cons: [
    'hygiene-gap',       // 틈새 물 고임 - 위생 불안 요소
    'hygiene-narrow',    // 입구 좁아 세척 불편 - 매우 흔한 불만
    'usability-noise'    // 소음 - 아기 깨울까 걱정
  ]
} as const;
