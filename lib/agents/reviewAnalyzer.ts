import { callGeminiWithRetry, parseJSONResponse, getProModel } from '@/lib/ai/gemini';

interface ReviewAnalysisInput {
  coupangId: string;
  productTitle: string;
  price: number;
  reviewCount: number;
  ranking: number;
  reviewData: string;
}

interface CoreValues {
  temperatureControl: number;
  hygiene: number;
  material: number;
  usability: number;
  portability: number;
  priceValue: number;
  durability: number;
  additionalFeatures: number;
}

interface CoreValuesWithComments {
  temperatureControl: { score: number; comment: string };
  hygiene: { score: number; comment: string };
  material: { score: number; comment: string };
  usability: { score: number; comment: string };
  portability: { score: number; comment: string };
  priceValue: { score: number; comment: string };
  durability: { score: number; comment: string };
  additionalFeatures: { score: number; comment: string };
}

interface MarkdownSections {
  strengths: string[];
  weaknesses: string[];
  buyerPatterns: string[];
  additionalInfo: string[];
}

export interface ReviewAnalysisResult {
  coreValues: CoreValues;
  coreValuesComments: CoreValuesWithComments;
  markdownSections: MarkdownSections;
}

/**
 * 리뷰 데이터를 분석하여 CoreValues와 Markdown 콘텐츠를 생성
 */
export async function analyzeReviews(
  input: ReviewAnalysisInput
): Promise<ReviewAnalysisResult> {
  const prompt = `당신은 분유포트(전기포트) 전문가입니다.
사용자가 제공한 리뷰 데이터를 분석하여, 정확한 점수와 상세 분석 내용을 생성해야 합니다.

# 제품 기본 정보
- 쿠팡 ID: ${input.coupangId}
- 제품명: ${input.productTitle}
- 가격: ${input.price.toLocaleString()}원
- 리뷰 개수: ${input.reviewCount.toLocaleString()}개
- 랭킹: ${input.ranking}위

# 리뷰 데이터
${input.reviewData}

---

# 분석 지침

## 1. 8가지 핵심 속성 점수 (coreValues)

다음 8가지 속성에 대해 **1~10점** 사이의 정수로 점수를 매기세요.
리뷰 내용을 **철저히** 분석하여, 각 속성의 장단점을 종합적으로 고려해야 합니다.

### 점수 기준:
- **10점 (매우 충족)**: 해당 속성에서 압도적으로 우수함. 리뷰에서 칭찬 일색.
- **8점 (충족)**: 해당 속성이 만족스러움. 일부 아쉬운 점 있지만 전반적으로 좋음.
- **5점 (보통)**: 평범함. 장단점이 섞여 있음.
- **3점 (미달)**: 해당 속성에 문제가 있음. 불만이 많음.
- **1점 (매우 미달)**: 해당 속성이 심각한 문제. 치명적 결함.

### 8가지 속성:

1. **temperatureControl (온도 조절/유지)**
   - 자동 온도 조절 기능 (원터치 분유 모드, 1도 단위 조절 등)
   - 보온 기능 (영구 보온, 12시간 보온 등)
   - 냉각 기능 (냉각팬 등)
   - 온도 유지 정확도
   - **중요**: 일반 전기포트처럼 온도 조절 기능이 전혀 없으면 1점

2. **hygiene (위생/청소 편의성)**
   - 통세척 가능 여부 (완전 분리형 구조)
   - 입구 넓이 (손이 바닥까지 닿는지)
   - 물때, 이물질 발생 여부
   - 고온살균 기능
   - 연마제 발생 여부

3. **material (소재/안전성)**
   - 스테인리스 등급 (SUS316 > SUS304)
   - 유리/실리콘 재질의 안전성
   - BPA-Free, KC 인증 등
   - 환경호르몬 우려
   - 녹, 이물질 발생 여부
   - **중요**: 유리 제품이 쉽게 깨진다는 리뷰가 많으면 점수 하락

4. **usability (사용 편의성)**
   - 버튼/터치 조작 편의성
   - 뚜껑 여닫기 편의성
   - 무게감
   - 용량 (1.7L는 대용량, 500ml는 소용량)
   - 물 따르기 편의성
   - 전원선 길이
   - 소음 (냉각팬, 끓는 소리 등)

5. **portability (휴대성)**
   - 접이식 여부
   - 무선 충전 (배터리 내장)
   - 프리볼트 (110V~240V)
   - 크기/무게
   - **중요**: 유리 제품, 가정용 대용량 제품은 1점

6. **priceValue (가격 대비 가치)**
   - 기능 대비 가격의 합리성
   - 경쟁 제품 대비 가성비
   - **중요**: 5만원 내 올스텐 제품은 10점, 10만원 기능 제품이 5만원이면 10점

7. **durability (내구성/A/S)**
   - 초기 불량률
   - 장기 사용 시 고장 여부
   - 녹, 파손 등의 내구성 문제
   - A/S 품질
   - **중요**: 유리가 쉽게 깨진다는 리뷰 多 → 낮은 점수

8. **additionalFeatures (추가 기능/디자인)**
   - 찜기, 계란 삶기 등 부가 기능
   - 디자인 심미성
   - LCD 디스플레이
   - 차망, 요거트 기능 등
   - 세척 솔, 파우치 등 구성품

---

각 속성에 대해 **점수**와 함께 **한 줄 코멘트**를 작성하세요.
코멘트는 간결하게 핵심만 담아야 하며, 기존 제품의 코멘트 스타일을 따라야 합니다.

예시:
- "매우 충족 - 원터치, 영구보온, 1도 조절"
- "미달 - 온도조절 기능 전무"
- "보통 - 넓은 입구지만 실리콘 냉새 배임"

---

## 2. Markdown 콘텐츠 생성 (상세 분석)

리뷰를 종합하여 다음 4개 섹션을 작성하세요.
**기존 제품의 markdown 파일 스타일과 톤을 정확히 따라야 합니다.**

### 2-1. 장점 (strengths)
- 배열 형태로 3~7개의 장점을 나열
- 각 장점은 **"핵심 키워드"** + 상세 설명 형식
- 예: "**압도적인 가성비:** 10만 원에 육박하는 유명 브랜드 제품의 핵심 기능을 절반 수준의 가격으로 모두 누릴 수 있습니다."

### 2-2. 단점 (weaknesses)
- 배열 형태로 3~5개의 단점을 나열
- 각 단점은 **"문제점 키워드"** + 상세 설명 형식
- 예: "**내구성 문제 (강화유리 파손 위험):** 가장 심각한 문제로, 작은 충격에도 유리가 쉽게 깨지거나 금이 갔다는 후기가 반복적으로 확인됩니다."

### 2-3. 구매 패턴 (buyerPatterns)
- 배열 형태로 3~4개의 구매 패턴 유형을 나열
- 각 패턴은 **"패턴 유형"** + 상세 설명 형식
- 예: "**가성비 추구형 부모:** 고가의 유명 브랜드 제품 구매를 망설이다가, 필수 기능은 동일하면서 가격은 훨씬 저렴한 대안으로 이 제품을 최종 선택하는 경우가 많습니다."

### 2-4. 기타 (additionalInfo)
- 배열 형태로 1~3개의 추가 정보를 나열
- 초기 사용 팁, 재구매율, 특이사항 등
- 예: "초기 사용 시 식용유를 묻힌 키친타월로 스테인리스 부분을 닦아내는 '연마제 제거' 작업은 필수이며, 대부분의 리뷰에서 연마제가 거의 묻어 나오지 않아 만족했다는 평입니다."

---

# 출력 형식 (JSON)

\`\`\`json
{
  "coreValues": {
    "temperatureControl": 10,
    "hygiene": 8,
    "material": 5,
    "usability": 5,
    "portability": 1,
    "priceValue": 10,
    "durability": 3,
    "additionalFeatures": 8
  },
  "coreValuesComments": {
    "temperatureControl": { "score": 10, "comment": "매우 충족 - 원터치, 냉각팬, 영구보온" },
    "hygiene": { "score": 8, "comment": "충족 - 통세척 (일부 패킹 문제)" },
    "material": { "score": 5, "comment": "보통 - SUS316이지만 유리 쉽게 깨짐" },
    "usability": { "score": 5, "comment": "보통 - 민감한 터치, 냉각팬 소음" },
    "portability": { "score": 1, "comment": "매우 미달" },
    "priceValue": { "score": 10, "comment": "매우 충족 - 최고 가성비" },
    "durability": { "score": 3, "comment": "미달 - 유리 파손 빈번" },
    "additionalFeatures": { "score": 8, "comment": "충족 - 다양한 모드" }
  },
  "markdownSections": {
    "strengths": [
      "**압도적인 가성비:** 10만 원에 육박하는 유명 브랜드 제품의 핵심 기능(원터치 자동 모드, 냉각팬, 영구 보온)을 절반 수준의 가격으로 모두 누릴 수 있습니다.",
      "**완벽한 분유 모드:** 100℃ 가열 → 5분 염소 제거 → 냉각팬 작동 → 설정 온도까지 자동 냉각 및 24시간 영구 보온 기능은 특히 수면이 부족한 부모들의 새벽 수유 부담을 획기적으로 줄여줍니다."
    ],
    "weaknesses": [
      "**내구성 문제 (강화유리 파손 위험):** 가장 심각한 문제로, 작은 충격에도 유리가 쉽게 깨지거나 금이 갔다는 후기가 반복적으로 확인됩니다.",
      "**민감한 터치패널:** 의도치 않은 가벼운 스침에도 터치패널이 반응해, 식혀놓은 물이 다시 100℃로 끓기 시작하는 경우가 많다는 불만이 제기됩니다."
    ],
    "buyerPatterns": [
      "**가성비 추구형 부모:** 고가의 유명 브랜드 제품 구매를 망설이다가, 필수 기능은 동일하면서 가격은 훨씬 저렴한 대안으로 이 제품을 최종 선택하는 경우가 많습니다.",
      "**긴급 교체/서브용 구매자:** 기존에 사용하던 분유포트가 갑자기 파손되어 당일/새벽 배송이 가능한 제품을 급하게 찾는 부모들이 많이 구매합니다."
    ],
    "additionalInfo": [
      "초기 사용 시 식용유를 묻힌 키친타월로 스테인리스 부분을 닦아내는 '연마제 제거' 작업은 필수이며, 대부분의 리뷰에서 연마제가 거의 묻어 나오지 않아 만족했다는 평입니다.",
      "유리 파손의 위험성에도 불구하고 기능과 가격에 대한 만족도가 높아, 파손 후에도 동일 제품을 재구매했다는 후기가 상당수 존재합니다."
    ]
  }
}
\`\`\`

**중요**:
- 반드시 위 JSON 형식을 정확히 따라야 합니다.
- 리뷰 내용을 철저히 읽고 분석하여 정확한 점수를 매기세요.
- 코멘트와 markdown 내용은 기존 제품들의 스타일과 톤을 따라야 합니다.
- 장점/단점은 과장하지 말고, 리뷰에 근거하여 작성하세요.
`;

  const response = await callGeminiWithRetry(async () => {
    const model = getProModel(0.3); // Gemini Pro 2.5 thinking 모델 사용
    const result = await model.generateContent(prompt);
    return result.response.text();
  });

  const parsed = parseJSONResponse<ReviewAnalysisResult>(response);

  if (!parsed) {
    throw new Error('AI 응답을 파싱할 수 없습니다.');
  }

  // 검증
  const requiredKeys = [
    'temperatureControl',
    'hygiene',
    'material',
    'usability',
    'portability',
    'priceValue',
    'durability',
    'additionalFeatures',
  ];

  for (const key of requiredKeys) {
    if (typeof parsed.coreValues[key as keyof CoreValues] !== 'number') {
      throw new Error(`coreValues.${key}가 숫자가 아닙니다.`);
    }
  }

  return parsed;
}
