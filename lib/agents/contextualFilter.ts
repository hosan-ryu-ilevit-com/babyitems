import { GoogleGenerativeAI } from '@google/generative-ai';
import { Product, UserPersona } from '@/types';
import { callGeminiWithRetry } from '../ai/gemini';
import { loadMultipleProductDetails } from '../data/productLoader';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });

const CONTEXTUAL_FILTER_PROMPT = `당신은 사용자의 **맥락적 요구사항**을 기반으로 제품의 적합성을 판단하는 스마트 필터링 AI예요.

# 당신의 역할
Top N 제품 후보들 중에서 **사용자의 맥락적 요구사항(contextualNeeds)과 추가 요청사항**에 부합하지 않는 제품을 **정확하게 제거**하는 것이 목표예요.

# 입력
1. **사용자 페르소나**:
   - contextualNeeds: 사용자의 구체적 니즈 및 배제 조건 리스트
   - 추가 요청사항 (phase0Context): 사용자가 직접 입력한 자연어 요청
2. **Top N 제품 후보**:
   - 각 제품의 기본 정보 (ID, 제목, 가격)
   - **제품 상세 분석** (마크다운): 소재, 기능, 특징, 장단점

# 필터링 기준 (우선순위 순)

## 🚨 1순위: 배제 조건 (CRITICAL) - 절대적 우선순위
**contextualNeeds에 "❌ [항목] 절대 제외" 형식이 있는지 반드시 확인하세요.**

⚠️ **매우 중요**: 배제 조건은 사용자의 **강력한 거부 의사**입니다. 다른 모든 장점과 점수를 무시하고 **무조건 제거**해야 합니다.

배제 조건 예시:
- "❌ 유리 소재 제품 절대 제외" → 유리 포트는 **무조건 제거** (다른 장점 무관)
- "❌ 스테인리스 소재 제품 절대 제외" → 스테인리스 포트는 **무조건 제거** (다른 장점 무관)
- "❌ 플라스틱 제품 절대 제외" → 플라스틱 부품이 많은 제품 **무조건 제거** (다른 장점 무관)

**판단 방법:**
1. **제품 상세 분석의 "소재" 섹션을 최우선 확인**
2. **제품 제목에서 소재 키워드 확인** (예: "유리", "스테인리스", "플라스틱")
3. **제품 설명에서 소재 관련 내용 확인**
4. **배제 조건 위반 시 즉시 isEligible: false** (다른 검토 불필요)
5. 애매한 경우 **보수적으로 판단** (의심스러우면 제거)

🚨 **절대 규칙**: 배제 조건(❌)을 발견하면 해당 소재 제품은 **어떤 경우에도 통과시키지 마세요**.

## 2순위: 명시적 선호/회피 조건
**contextualNeeds나 추가 요청사항에 명시된 선호 또는 회피 조건:**

선호 조건 예시:
- "스테인리스 소재 선호" → 스테인리스 아닌 제품은 감점
- "쿨링팬 필수" → 쿨링팬 없는 제품 제거
- "1도 단위 정밀 온도 조절" → 이 기능 없으면 감점

회피 조건 예시:
- "유리 재질 말고" → 유리 제품 제거
- "무거운 제품 싫어요" → 1.5kg 이상 제품 감점
- "소음 싫어요" → 소음 문제 언급된 제품 감점

## 3순위: 상황적 맥락
**contextualNeeds의 상황 설명:**
- "쌍둥이 육아 중" → 동시 분유 준비 가능한 대용량 제품 선호
- "외출 많음" → 휴대성 좋은 제품 선호
- "야간 수유 빈번" → 저소음 제품 선호

# 출력 형식 (JSON)
{
  "products": [
    {
      "productId": "제품 ID",
      "isEligible": true | false,
      "reason": "판단 근거 (1-2문장, 구체적으로)"
    }
  ]
}

# 판단 지침
1. **배제 조건 최우선**: "❌" 표시가 있으면 해당 제품은 **즉시 제거** (isEligible: false)
2. **명시적 조건 준수**: 사용자가 명확히 선호/회피한 것은 **엄격히 적용**
3. **보수적 판단**: 애매하면 **포함하는 쪽으로** (나중에 Product Evaluation에서 재평가)
4. **구체적 근거**: reason에는 **제품 마크다운의 구체적 내용**을 인용
5. **소재 확인**: 제품 상세 분석의 "소재" 섹션을 **반드시 확인**

# 판단 예시

## 예시 1: 배제 조건 위반
- contextualNeeds: ["❌ 유리 소재 제품 절대 제외", "1도 단위 정밀 조절"]
- 제품 A (유리 포트): "내열 강화유리 소재"
- 판단:
  {
    "productId": "product-a",
    "isEligible": false,
    "reason": "배제 조건 위반: 사용자가 '유리 소재 제품 절대 제외'를 요청했으나, 이 제품은 내열 강화유리 소재를 사용합니다."
  }

## 예시 2: 명시적 선호 충족
- contextualNeeds: ["스테인리스 소재 선호", "빠른 냉각"]
- 제품 B (스테인리스 + 쿨링팬): "SUS304 스테인리스, 쿨링팬 탑재"
- 판단:
  {
    "productId": "product-b",
    "isEligible": true,
    "reason": "사용자가 선호하는 스테인리스 소재를 사용하며, 쿨링팬으로 빠른 냉각이 가능합니다."
  }

## 예시 3: 애매한 경우 (보수적)
- contextualNeeds: ["깨지지 않는 안전한 소재"]
- 제품 C (유리+보호 케이스): "내열 유리 + 실리콘 보호 케이스"
- 판단:
  {
    "productId": "product-c",
    "isEligible": true,
    "reason": "유리 소재이지만 실리콘 보호 케이스로 안전성을 강화했습니다. 최종 평가는 Product Evaluation 단계에서 결정됩니다."
  }
  (단, "❌ 유리 절대 제외" 같은 명시적 배제 조건이 있으면 제거!)

# 사용자 페르소나
{PERSONA}

# Top N 제품 후보
{PRODUCTS}

**각 제품의 적합성을 판단하여 JSON으로만 출력하세요 (설명 없이):**`;

interface FilterResult {
  productId: string;
  isEligible: boolean;
  reason: string;
}

interface FilterResponse {
  products: FilterResult[];
}

/**
 * Contextual Filtering: Top N 제품 중 맥락적 요구사항에 부합하지 않는 제품 제거
 *
 * @param products - Top N 제품 후보 리스트
 * @param persona - 사용자 페르소나 (contextualNeeds 포함)
 * @returns 필터링 결과 (각 제품의 적합성 판단)
 */
export async function filterProductsByContext(
  products: Product[],
  persona: UserPersona
): Promise<FilterResponse> {
  console.log(`\n🔍 Starting contextual filtering for ${products.length} products...`);
  console.log(`📋 Persona contextual needs: ${persona.contextualNeeds.length} items`);

  // 1. 제품 상세 정보 로드
  console.log(`📚 Loading detailed markdown for ${products.length} products...`);
  const productIds = products.map(p => p.id);
  const allDetails = await loadMultipleProductDetails(productIds);

  // 2. LLM에 전달할 제품 정보 구성
  const productsWithDetails = products.map(product => ({
    id: product.id,
    title: product.title,
    price: product.price,
    details: allDetails[product.id] || '상세 정보 없음'
  }));

  // 3. 프롬프트 생성
  const prompt = CONTEXTUAL_FILTER_PROMPT
    .replace('{PERSONA}', JSON.stringify({
      summary: persona.summary,
      contextualNeeds: persona.contextualNeeds,
      budget: persona.budget
    }, null, 2))
    .replace('{PRODUCTS}', JSON.stringify(productsWithDetails, null, 2));

  // 4. LLM 호출
  console.log('🤖 Calling LLM for contextual filtering...');
  const result = await callGeminiWithRetry(async () => {
    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // JSON 추출
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from contextual filter response');
    }

    const jsonText = jsonMatch[1] || jsonMatch[0];
    return JSON.parse(jsonText);
  });

  const filterResponse = result as FilterResponse;

  // 5. 결과 로깅
  const eligible = filterResponse.products.filter(p => p.isEligible);
  const ineligible = filterResponse.products.filter(p => !p.isEligible);

  console.log(`✅ Eligible products: ${eligible.length}`);
  eligible.forEach(p => {
    const product = products.find(prod => prod.id === p.productId);
    console.log(`  ✓ ${product?.title.substring(0, 40)} - ${p.reason}`);
  });

  console.log(`❌ Ineligible products: ${ineligible.length}`);
  ineligible.forEach(p => {
    const product = products.find(prod => prod.id === p.productId);
    console.log(`  ✗ ${product?.title.substring(0, 40)} - ${p.reason}`);
  });

  return filterResponse;
}

/**
 * Top N 제품에서 부적합 제품을 제거하고, 필요시 추가 제품으로 보충
 *
 * @param topProducts - Top N 제품 리스트
 * @param allFilteredProducts - 예산 필터링된 전체 제품 리스트
 * @param persona - 사용자 페르소나
 * @param targetCount - 목표 개수 (기본 5개)
 * @returns 필터링 후 제품 리스트 (targetCount개 이상)
 */
export async function applyContextualFiltering(
  topProducts: Product[],
  allFilteredProducts: Product[],
  persona: UserPersona,
  targetCount: number = 5
): Promise<Product[]> {
  console.log(`\n=== Contextual Filtering (Phase 3.5) ===`);

  // 1. Top N 제품 필터링
  const filterResult = await filterProductsByContext(topProducts, persona);

  // 2. 적합한 제품만 추출
  const eligibleIds = new Set(
    filterResult.products
      .filter(p => p.isEligible)
      .map(p => p.productId)
  );

  const eligibleProducts = topProducts.filter(p => eligibleIds.has(p.id));
  const removedCount = topProducts.length - eligibleProducts.length;

  console.log(`📊 Filtering result: ${eligibleProducts.length}/${topProducts.length} products eligible`);

  // 3. 부족한 개수만큼 추가 제품으로 보충
  if (eligibleProducts.length < targetCount && removedCount > 0) {
    console.log(`⚠️  Need ${targetCount - eligibleProducts.length} more products to replace removed ones`);

    // Top N 이후의 제품들을 가져옴 (이미 가중치 점수로 정렬되어 있음)
    const remainingProducts = allFilteredProducts.filter(
      p => !topProducts.some(top => top.id === p.id)
    );

    // 추가로 필요한 개수만큼 필터링
    const neededCount = Math.min(targetCount - eligibleProducts.length, remainingProducts.length);
    if (neededCount > 0) {
      const additionalCandidates = remainingProducts.slice(0, neededCount * 2); // 여유있게 2배 가져오기
      console.log(`🔄 Filtering ${additionalCandidates.length} additional candidates...`);

      const additionalFilterResult = await filterProductsByContext(additionalCandidates, persona);
      const additionalEligibleIds = new Set(
        additionalFilterResult.products
          .filter(p => p.isEligible)
          .map(p => p.productId)
      );

      const additionalProducts = additionalCandidates
        .filter(p => additionalEligibleIds.has(p.id))
        .slice(0, neededCount);

      console.log(`✅ Added ${additionalProducts.length} replacement products`);
      eligibleProducts.push(...additionalProducts);
    }
  }

  console.log(`✓ Final product count: ${eligibleProducts.length}`);
  return eligibleProducts;
}
