import { GoogleGenerativeAI } from '@google/generative-ai';
import { Product, UserPersona, ProductEvaluation, Recommendation } from '@/types';
import { callGeminiWithRetry, parseJSONResponse } from '../ai/gemini';
import { loadMultipleProductDetails } from '@/lib/data/productLoader';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

const RECOMMENDATION_PROMPT = `당신은 사용자에게 맞춤형 제품 추천 이유를 작성하는 AI 에이전트예요.

# ⚠️ 핵심 원칙: 사실 기반 작성 (할루시네이션 방지)

**절대 원칙**: 제품의 **실제 상세 정보(detailedFeatures)에 명시된 내용만** 기반으로 작성하세요.

- 사용자 니즈(contextualNeeds)는 "사용자가 원하는 것"입니다 (참고용)
- 제품 상세 정보(detailedFeatures)는 "제품이 실제로 가진 것"입니다 (작성 근거)
- **제품에 없는 기능은 절대 언급하지 마세요** - 할루시네이션 금지!

## 작성 방법:
1. detailedFeatures의 "장점" 섹션을 먼저 읽으세요
2. 사용자 니즈와 실제로 일치하는 부분만 강조하세요
3. 일치하지 않는 니즈는 무시하세요 (거짓으로 작성하지 마세요)

## 예시:
✅ 사용자 니즈: "1도 단위 조절" + detailedFeatures에 "1℃ 단위의 정밀한 온도 설정" 있음
   → 장점에 작성 가능: "**1℃ 단위**로 정밀하게 온도를 설정할 수 있어..."

❌ 사용자 니즈: "1도 단위 조절" + detailedFeatures에 해당 내용 없음
   → 장점에 작성 불가! (다른 실제 장점으로 대체)

---

# 입력 데이터

1. **사용자 니즈 분석 결과** (참고용)
   - 사용자가 중요하게 생각하는 속성 우선순위
   - 사용자가 원하는 구체적 기능 목록 (contextualNeeds)

2. **제품 실제 정보** (작성 근거) ⭐ 가장 중요!
   - 기본 정보: 제품명, 가격, 리뷰 수
   - 속성 점수: temperatureControl(온도조절), hygiene(위생), material(소재), usability(편의성), portability(휴대성), priceValue(가성비), additionalFeatures(부가기능)
   - **상세 분석** (detailedFeatures): 장점, 단점, 구매자 패턴 (마크다운 형식)

3. **AI 평가 결과**
   - 각 속성별 등급 및 상세 분석

4. **최종 적합도 점수** (1-100%)

5. **다른 후보 제품들** (비교용)

---

# 출력 형식 (JSON)

{
  "strengths": [
    "detailedFeatures에 기반한 실제 장점 1",
    "detailedFeatures에 기반한 실제 장점 2",
    "detailedFeatures에 기반한 실제 장점 3"
  ],
  "weaknesses": [
    "detailedFeatures에 기반한 실제 단점 1",
    "detailedFeatures에 기반한 실제 단점 2"
  ],
  "comparison": [
    "2위 제품 대비: detailedFeatures 기반 차별점 (1문장)",
    "3위 제품 대비: detailedFeatures 기반 차별점 (1문장)"
  ],
  "additionalConsiderations": "detailedFeatures 기반 실용 팁 (1-2문장)"
}

---

# 작성 지침

## 1. 장점 (Strengths) - 3-4개 항목

### 작성 순서:
1. **detailedFeatures의 "장점" 섹션을 읽으세요**
2. 사용자 니즈(contextualNeeds)와 **실제로 일치하는 장점**을 찾으세요
3. 일치하는 장점을 우선 작성하고, 나머지는 제품의 두드러진 장점 추가

### 작성 방법:
- **매칭 우선**: 사용자 니즈와 일치하는 실제 장점을 먼저 작성
  - 예: 니즈에 "온도 조절" + detailedFeatures에 "1℃ 단위 정밀 설정" 있음
    → "고객님께서 중요하게 생각하시는 **온도 조절 기능**이 이 제품의 강점이에요. **1℃ 단위**로 정밀하게 설정할 수 있어..."

- **구체성**: detailedFeatures의 구체적 표현 활용
  - "입구가 넓어 포트 내부를 손쉽게 닦을 수 있으며" → "**입구가 넓어** 손세척이 편리하고..."

- **자연스러운 톤**:
  - 시작: "고객님께서 중요하게 생각하시는 [기능]이..." 또는 "이 제품의 가장 큰 장점은..."
  - 점수 직접 언급 금지 ("8점" ❌ → "뛰어나다" ✅)

- **마크다운 강조**: 핵심 키워드는 **볼드** 처리

### 예시:
✅ "고객님께서 중요하게 생각하시는 **휴대성**이 이 제품의 가장 큰 강점이에요. **접이식 구조**와 가벼운 무게로 여행이나 외출 시 짐의 부피를 획기적으로 줄여줘요."
✅ "**1℃ 단위**의 정밀한 온도 설정과 최대 **8시간 보온** 기능으로 분유, 차, 커피 등 다양한 목적에 맞는 물 온도를 편리하게 유지할 수 있어요."

❌ "온도 조절이 좋습니다." (구체성 부족)
❌ "쿨링팬이 있습니다." (detailedFeatures에 없는 기능 - 할루시네이션!)

---

## 2. 단점 (Weaknesses) - 1-2개 항목

### 작성 순서:
1. **detailedFeatures의 "단점" 섹션을 읽으세요**
2. 심각한 단점 1-2개 선택
3. 부드럽게 표현하되 솔직하게 작성

### 작성 방법:
- **솔직함**: detailedFeatures에 명시된 실제 단점 작성
- **부드러운 표현**: "다만", "아쉬운 점은" 사용
- **대안 제시** (가능하면): 단점 보완 방법 제시
- **자연어 표현**: 점수 언급 금지

### 예시:
✅ "다만 **안전성** 측면에서 물을 따를 때 뚜껑이 완전히 고정되지 않아 주의가 필요해요."
✅ "아쉬운 점은 **보온 시간**이 최대 8시간으로 제한되어, 밤새 수유가 필요한 경우 새벽에 물이 식을 수 있어요."

❌ "휴대성 점수가 3점으로 낮습니다." (점수 직접 언급)
❌ "가격이 비쌉니다." (detailedFeatures에 없는 단점 - 할루시네이션!)

---

## 3. 비교 (Comparison) - 2개 항목

### 작성 형식:
- **필수 형식**: "[비교 대상 순위]위 제품 대비: [차별점]"
  - 1위 제품: ["2위 제품 대비: ...", "3위 제품 대비: ..."]
  - 2위 제품: ["1위 제품 대비: ...", "3위 제품 대비: ..."]
  - 3위 제품: ["1위 제품 대비: ...", "2위 제품 대비: ..."]

### 작성 방법:
- **근거**: 각 제품의 detailedFeatures 비교
- **간결함**: 1문장으로 핵심 차별점만
- **객관성**: 다른 제품 폄하 금지
- **마크다운 강조**: 차별점 **볼드** 처리

### 예시 (1위 제품):
✅ [
  "2위 제품 대비: **온도 유지력**이 더 뛰어나고 **장시간 보온**이 가능해요",
  "3위 제품 대비: **세척이 더 편리**하고 **입구가 넓어** 관리가 쉬워요"
]

### 예시 (2위 제품):
✅ [
  "1위 제품 대비: **가격이 저렴**하면서도 **핵심 기능은 충분**해요",
  "3위 제품 대비: **디자인이 더 세련**되고 **컴팩트**해요"
]

❌ "2위 제품보다 좋습니다." (형식 불일치, 구체성 부족)
❌ "2위는 85점, 1위는 92점입니다." (점수 직접 비교)

---

## 4. 추가 고려사항 (Additional Considerations) - 1-2문장

### 작성 방법:
- **실용 팁**: detailedFeatures 기반 사용 팁
- **주의사항**: 초기 세팅, 관리 방법
- **리뷰 정보**: 리뷰 수 활용 가능
- **마크다운 강조**: 중요 포인트 **볼드**

### 예시:
✅ "리뷰 **1,234건**으로 검증된 제품이며, 첫 사용 전 **식초 세척**을 권장해요."
✅ "**프리볼트 지원**으로 해외여행 시에도 변압기 없이 사용할 수 있어요."

---

# 사용자 니즈 분석 결과 (참고용)
{PERSONA}

# 제품 실제 정보 (작성 근거) ⭐
{PRODUCT}

# AI 평가 결과
{EVALUATION}

# 최종 적합도 점수
{FINAL_SCORE}%

# 다른 후보 제품들 (비교용)
{OTHER_CANDIDATES}

---

# 최종 체크리스트

✅ detailedFeatures에 **실제로 있는 내용만** 작성했나요?
✅ 사용자 니즈와 일치하는 **실제 장점**을 우선 작성했나요?
✅ "페르소나", "contextualNeeds", "coreValues" 같은 기술 용어를 사용하지 않았나요?
✅ 점수를 직접 언급하지 않고 자연어로 표현했나요?
✅ 모든 텍스트를 존댓말로 작성했나요? ("~해요", "~세요")
✅ 비교 형식을 준수했나요? ("[순위]위 제품 대비: ...")
✅ 핵심 키워드를 **마크다운 볼드**로 강조했나요?

---

추천 이유를 JSON으로만 출력하세요:`;

interface RecommendationInput {
  rank: 1 | 2 | 3;
  product: Product;
  evaluation: ProductEvaluation;
  finalScore: number;
  persona: UserPersona;
  productMarkdown?: string; // 제품 상세 마크다운 정보
  otherCandidates: Array<{
    rank: number;
    product: Product;
    finalScore: number;
    productMarkdown?: string; // 비교 제품 마크다운
  }>;
}

export async function generateRecommendationReason(
  input: RecommendationInput
): Promise<{
  strengths: string[];
  weaknesses: string[];
  comparison: string[];
  additionalConsiderations: string;
}> {
  console.log(`  ✍️  Generating recommendation for Rank ${input.rank}: ${input.product.title.substring(0, 40)}...`);

  const prompt = RECOMMENDATION_PROMPT
    .replace('{RANK}', input.rank.toString())
    .replace('{PRODUCT}', JSON.stringify({
      title: input.product.title,
      price: input.product.price,
      reviewCount: input.product.reviewCount,
      ranking: input.product.ranking,
      coreValues: input.product.coreValues,
      detailedFeatures: input.productMarkdown || "상세 정보 없음" // ⭐ 마크다운 추가
    }, null, 2))
    .replace('{EVALUATION}', JSON.stringify(input.evaluation, null, 2))
    .replace('{FINAL_SCORE}', input.finalScore.toString())
    .replace('{PERSONA}', JSON.stringify(input.persona, null, 2))
    .replace('{OTHER_CANDIDATES}', JSON.stringify(
      input.otherCandidates.map(c => ({
        rank: c.rank,
        title: c.product.title,
        price: c.product.price,
        finalScore: c.finalScore,
        detailedFeatures: c.productMarkdown ? c.productMarkdown.substring(0, 500) + "..." : "상세 정보 없음" // 비교용은 요약만
      })),
      null,
      2
    ));

  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    const text = response.response.text();

    console.log(`  📝 AI Response for Rank ${input.rank} (first 200 chars):`, text.substring(0, 200));

    try {
      return parseJSONResponse<{
        strengths: string[];
        weaknesses: string[];
        comparison: string[];
        additionalConsiderations: string;
      }>(text);
    } catch (error) {
      console.error(`  ❌ Failed to parse recommendation JSON for Rank ${input.rank}`);
      console.error(`  Full AI response:`, text);
      throw error;
    }
  });

  console.log(`  ✓ Recommendation generated for Rank ${input.rank}`);

  return result;
}

/**
 * Top 3 제품에 대한 추천 이유를 일괄 생성 (병렬 처리)
 *
 * @param rankedProducts - Top 3 제품 배열
 * @param persona - 사용자 페르소나
 * @param cachedMarkdowns - Phase 4에서 이미 로드한 마크다운 데이터 (선택적, 최적화용)
 */
export async function generateTop3Recommendations(
  rankedProducts: Array<{
    product: Product;
    evaluation: ProductEvaluation;
    finalScore: number;
  }>,
  persona: UserPersona,
  cachedMarkdowns?: Record<string, string>
): Promise<Recommendation[]> {
  console.log(`🔄 Starting parallel recommendation generation for Top 3 products...`);

  const top3 = rankedProducts.slice(0, 3);

  // ✅ Step 1: 마크다운 데이터 준비 (캐시가 있으면 재사용, 없으면 로드)
  let markdownMap: Record<string, string>;

  if (cachedMarkdowns && Object.keys(cachedMarkdowns).length > 0) {
    console.log('♻️  Reusing cached markdown data from Phase 4 (optimization)');
    markdownMap = cachedMarkdowns;
  } else {
    console.log('📖 Loading product markdown files in parallel...');
    const productIds = top3.map(p => p.product.id);
    markdownMap = await loadMultipleProductDetails(productIds);
    console.log(`✓ Loaded ${Object.keys(markdownMap).length}/${productIds.length} markdown files`);
  }

  // ✅ Step 2: 각 제품에 대한 추천 이유 생성 (병렬 처리로 속도 개선)
  const recommendationPromises = top3.map(async (current, i) => {
    const rank = (i + 1) as 1 | 2 | 3;

    // 현재 제품의 마크다운 정보
    const currentMarkdown = markdownMap[current.product.id];

    // 다른 후보들 정보 (마크다운 포함)
    const otherCandidates = top3
      .map((item, idx) => ({
        rank: idx + 1,
        product: item.product,
        finalScore: item.finalScore,
        productMarkdown: markdownMap[item.product.id] // ⭐ 마크다운 추가
      }))
      .filter((_, idx) => idx !== i);

    try {
      const reason = await generateRecommendationReason({
        rank,
        product: current.product,
        evaluation: current.evaluation,
        finalScore: current.finalScore,
        persona,
        productMarkdown: currentMarkdown, // ⭐ 마크다운 전달
        otherCandidates
      });

      return {
        product: current.product,
        rank,
        finalScore: current.finalScore,
        personalizedReason: {
          strengths: reason.strengths,
          weaknesses: reason.weaknesses
        },
        comparison: reason.comparison,
        additionalConsiderations: reason.additionalConsiderations
      };
    } catch (error) {
      console.error(`❌ Failed to generate recommendation for Rank ${rank}:`, error);
      throw error;
    }
  });

  // 병렬 실행 - allSettled로 개별 실패 처리
  const results = await Promise.allSettled(recommendationPromises);

  // 성공한 추천만 필터링
  const recommendations = results
    .filter((r): r is PromiseFulfilledResult<Recommendation> => r.status === 'fulfilled')
    .map(r => r.value);

  // 실패한 추천 로깅
  const failedCount = results.filter(r => r.status === 'rejected').length;
  if (failedCount > 0) {
    console.error(`⚠️ ${failedCount} recommendation(s) failed to generate`);
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`  - Rank ${i + 1} failed:`, r.reason);
      }
    });
  }

  // 최소 1개 이상의 추천이 있어야 함
  if (recommendations.length === 0) {
    throw new Error('All recommendations failed to generate');
  }

  console.log(`✓ ${recommendations.length}/3 recommendations generated successfully`);

  // rank 순서대로 정렬하여 반환
  return recommendations.sort((a, b) => a.rank - b.rank);
}
