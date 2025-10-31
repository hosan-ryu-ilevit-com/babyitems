import { GoogleGenerativeAI } from '@google/generative-ai';
import { Product, UserPersona, ProductEvaluation, Recommendation } from '@/types';
import { callGeminiWithRetry } from '../ai/gemini';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

const RECOMMENDATION_PROMPT = `당신은 사용자에게 맞춤형 제품 추천 이유를 작성하는 AI 에이전트입니다.

# 입력
1. 사용자 페르소나
2. 추천할 제품 정보 및 평가
3. 다른 후보 제품들 (비교용)
4. 최종 적합도 점수

# 출력 형식 (JSON)
{
  "strengths": [
    "장점 1 (사용자 니즈와 연결)",
    "장점 2 (구체적 특징)",
    "장점 3 (페르소나 맥락 반영)"
  ],
  "weaknesses": [
    "단점 1 (솔직한 평가)",
    "단점 2 (개선 필요 부분)"
  ],
  "comparison": "다른 후보들과 비교한 종합 설명 (2-3문장)",
  "additionalConsiderations": "추가 고려사항 또는 팁 (1-2문장)"
}

# 작성 지침

## 1. 장점 (Strengths)
- **개인화**: "고객님께서 중요하게 생각하시는 [속성]을..." 형태로 시작
- **구체성**: 추상적 표현 X, 구체적 특징과 수치 언급
- **맥락 반영**: 페르소나의 contextualNeeds와 연결
- **3-4개 항목**: 가장 두드러진 장점만 선별

예시:
✅ "고객님께서 가장 중요하게 생각하시는 온도 조절 기능이 뛰어나, 온도 유지가 가능합니다."
❌ "온도 조절이 좋습니다."

## 2. 단점 (Weaknesses)
- **솔직함**: 과장하지 않고 실제 단점 명시
- **상대적 평가**: "다만", "아쉬운 점은" 같은 부드러운 표현 사용
- **대안 제시**: 가능하면 단점을 보완할 방법 제시
- **1-2개 항목**: 심각한 단점이 아니면 1개로 충분

예시:
✅ "다만 휴대성이 다소 떨어져, 여행용보다는 가정용으로 적합합니다."
❌ "휴대하기 어렵습니다."

## 3. 비교 (Comparison)
- **순위 언급**: "[N]위 제품과 비교했을 때" 형태
- **차별점 강조**: 왜 이 제품을 선택했는지 명확히 설명
- **균형**: 다른 제품을 폄하하지 않고 객관적으로 비교
- **2-3문장**: 간결하고 명확하게

예시:
"2위 제품 대비 온도 유지력이 우수하며, 3위 제품보다 세척이 편리합니다. 고객님의 우선순위인 온도 조절과 위생 관리 측면에서 가장 균형 잡힌 선택입니다."

## 4. 추가 고려사항 (Additional Considerations)
- **실용 팁**: 사용 시 유용한 정보
- **구매 후 주의사항**: 초기 세팅이나 관리 방법
- **리뷰 정보**: 실제 사용자 리뷰 수나 평점
- **1-2문장**: 간결하게

예시:
"리뷰 1,234건으로 검증된 제품이며, 첫 사용 전 식초 세척을 권장합니다."

# 사용자 페르소나
{PERSONA}

# 추천 제품 (순위: {RANK})
{PRODUCT}

# 평가 결과
{EVALUATION}

# 최종 적합도 점수
{FINAL_SCORE}%

# 다른 후보 제품들
{OTHER_CANDIDATES}

# 중요 지침
- 모든 텍스트는 존댓말 사용 ("~입니다", "~세요")
- 과장 금지, 객관적이고 신뢰할 수 있는 톤
- 페르소나의 summary와 contextualNeeds를 반드시 반영
- 적합도 점수가 낮으면(<70%) 솔직하게 "완벽한 매치는 아니지만..." 표현

추천 이유를 JSON으로만 출력하세요:`;

interface RecommendationInput {
  rank: 1 | 2 | 3;
  product: Product;
  evaluation: ProductEvaluation;
  finalScore: number;
  persona: UserPersona;
  otherCandidates: Array<{
    rank: number;
    product: Product;
    finalScore: number;
  }>;
}

export async function generateRecommendationReason(
  input: RecommendationInput
): Promise<{
  strengths: string[];
  weaknesses: string[];
  comparison: string;
  additionalConsiderations: string;
}> {
  const prompt = RECOMMENDATION_PROMPT
    .replace('{RANK}', input.rank.toString())
    .replace('{PRODUCT}', JSON.stringify({
      title: input.product.title,
      price: input.product.price,
      reviewCount: input.product.reviewCount,
      ranking: input.product.ranking,
      coreValues: input.product.coreValues
    }, null, 2))
    .replace('{EVALUATION}', JSON.stringify(input.evaluation, null, 2))
    .replace('{FINAL_SCORE}', input.finalScore.toString())
    .replace('{PERSONA}', JSON.stringify(input.persona, null, 2))
    .replace('{OTHER_CANDIDATES}', JSON.stringify(
      input.otherCandidates.map(c => ({
        rank: c.rank,
        title: c.product.title,
        price: c.product.price,
        finalScore: c.finalScore
      })),
      null,
      2
    ));

  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from recommendation response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonText);
  });

  return result;
}

/**
 * Top 3 제품에 대한 추천 이유를 일괄 생성 (병렬 처리)
 */
export async function generateTop3Recommendations(
  rankedProducts: Array<{
    product: Product;
    evaluation: ProductEvaluation;
    finalScore: number;
  }>,
  persona: UserPersona
): Promise<Recommendation[]> {
  const top3 = rankedProducts.slice(0, 3);

  // 각 제품에 대한 추천 이유 생성 (병렬 처리로 속도 개선)
  const recommendationPromises = top3.map(async (current, i) => {
    const rank = (i + 1) as 1 | 2 | 3;

    // 다른 후보들 정보
    const otherCandidates = top3
      .map((item, idx) => ({
        rank: idx + 1,
        product: item.product,
        finalScore: item.finalScore
      }))
      .filter((_, idx) => idx !== i);

    const reason = await generateRecommendationReason({
      rank,
      product: current.product,
      evaluation: current.evaluation,
      finalScore: current.finalScore,
      persona,
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
  });

  // 병렬 실행
  const recommendations = await Promise.all(recommendationPromises);

  // rank 순서대로 정렬하여 반환
  return recommendations.sort((a, b) => a.rank - b.rank);
}
