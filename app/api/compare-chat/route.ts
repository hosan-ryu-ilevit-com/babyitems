import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry, getModel } from '@/lib/ai/gemini';
import { loadProductById, loadProductDetails } from '@/lib/data/productLoader';
import { products as allProducts } from '@/data/products';

/**
 * POST /api/compare-chat
 * Handle user questions in compare page
 * - Detect intent: general question vs product replacement/addition
 * - Answer general questions about products
 * - Suggest alternative products for replacement/addition
 */
export async function POST(req: NextRequest) {
  try {
    const { message, productIds, conversationHistory } = await req.json();

    if (!message || !productIds || !Array.isArray(productIds)) {
      return NextResponse.json(
        { error: 'message and productIds are required' },
        { status: 400 }
      );
    }

    // Load current products with detailed markdown
    const currentProducts = await Promise.all(
      productIds.map(async (id) => {
        const product = await loadProductById(id);
        const markdown = await loadProductDetails(id);
        return { product, markdown };
      })
    );

    // Step 1: Analyze user intent
    const intent = await analyzeIntent(message, currentProducts, conversationHistory);

    // Step 2: Handle based on intent
    if (intent.type === 'replace' || intent.type === 'add') {
      // Suggest alternative products
      const suggestions = await suggestAlternativeProducts(
        message,
        currentProducts,
        intent,
        conversationHistory
      );

      return NextResponse.json({
        type: intent.type,
        response: suggestions.response,
        suggestedProducts: suggestions.products,
        productToReplace: intent.productToReplace || null
      });
    } else {
      // Answer general question
      const answer = await answerGeneralQuestion(
        message,
        currentProducts,
        conversationHistory
      );

      return NextResponse.json({
        type: 'answer',
        response: answer
      });
    }
  } catch (error) {
    console.error('Compare chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Analyze user intent: general question vs product replacement/addition
 */
async function analyzeIntent(
  message: string,
  currentProducts: any[],
  conversationHistory: string
) {
  const prompt = `당신은 사용자 의도를 분석하는 전문가입니다.

**현재 비교 중인 제품들:**
${currentProducts.map((p, idx) => `${idx + 1}. ${p.product.title} (${p.product.price.toLocaleString()}원)`).join('\n')}

**대화 이력:**
${conversationHistory || '(없음)'}

**사용자 질문:**
"${message}"

**분석 요청:**
사용자가 다음 중 어떤 의도를 가지고 있는지 판단하세요:

1. **"replace"**: 현재 제품 중 하나를 다른 제품으로 교체하고 싶음
   - 예: "A 대신 다른 거 보여줘", "B를 빼고 다른 걸로", "C가 마음에 안들어"
   - productToReplace: 교체할 제품의 이름 (정확히)

2. **"add"**: 비교 제품을 추가하고 싶음 (현재 3개 미만인 경우)
   - 예: "다른 제품도 보고 싶어", "추가로 뭐가 있어?"

3. **"answer"**: 일반적인 질문 (제품 비교, 특징 설명 등)
   - 예: "가장 세척하기 편한 건?", "소음이 적은 건?", "가격 차이가 뭐야?"

**출력 형식 (JSON):**
\`\`\`json
{
  "type": "replace" | "add" | "answer",
  "productToReplace": "제품명" | null,
  "reasoning": "판단 근거"
}
\`\`\`

간결하게 답변하세요.`;

  const response = await callGeminiWithRetry(
    async () => {
      const model = getModel(0.3); // Low temperature for classification
      const result = await model.generateContent(prompt);
      return result.response.text();
    },
    3
  );

  // Parse JSON
  let jsonStr = response.trim();
  if (jsonStr.includes('```json')) {
    jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
  } else if (jsonStr.includes('```')) {
    jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(jsonStr);
  return parsed;
}

/**
 * Suggest alternative products for replacement/addition
 */
async function suggestAlternativeProducts(
  message: string,
  currentProducts: any[],
  intent: any,
  conversationHistory: string
) {
  const currentProductIds = currentProducts.map(p => p.id);
  const availableProducts = allProducts.filter(p => !currentProductIds.includes(p.id));

  const prompt = `당신은 육아 제품 추천 전문가입니다.

**현재 비교 중인 제품들:**
${currentProducts.map((p, idx) => `
${idx + 1}. ${p.title} (${p.price.toLocaleString()}원)
   - 온도 조절: ${p.coreValues.temperatureControl}/10
   - 위생: ${p.coreValues.hygiene}/10
   - 소재: ${p.coreValues.material}/10
   - 사용 편의성: ${p.coreValues.usability}/10
   - 휴대성: ${p.coreValues.portability}/10
   - 부가 기능: ${p.coreValues.additionalFeatures}/10
`).join('\n')}

**사용 가능한 다른 제품들:**
${availableProducts.slice(0, 10).map((p, idx) => `
${idx + 1}. ${p.title} (${p.price.toLocaleString()}원)
   - 온도 조절: ${p.coreValues.temperatureControl}/10
   - 위생: ${p.coreValues.hygiene}/10
   - 소재: ${p.coreValues.material}/10
   - 사용 편의성: ${p.coreValues.usability}/10
   - 휴대성: ${p.coreValues.portability}/10
   - 부가 기능: ${p.coreValues.additionalFeatures}/10
`).join('\n')}

**대화 이력:**
${conversationHistory || '(없음)'}

**사용자 요청:**
"${message}"

**의도 분석 결과:**
- 타입: ${intent.type === 'replace' ? '제품 교체' : '제품 추가'}
${intent.productToReplace ? `- 교체 대상: ${intent.productToReplace}` : ''}

**요청사항:**
1. 사용자의 요청을 이해하고, 적절한 대체 제품 1-2개를 추천하세요
2. 추천 이유를 간결하게 설명하세요 (각 50자 이내)
3. 사용자에게 친근하고 공감적인 톤으로 답변하세요

**출력 형식 (JSON):**
\`\`\`json
{
  "response": "사용자에게 보여줄 답변 (친근한 톤, 추천 이유 포함)",
  "products": [
    {
      "id": "제품 ID",
      "reason": "추천 이유 (50자 이내)"
    }
  ]
}
\`\`\``;

  const response = await callGeminiWithRetry(
    async () => {
      const model = getModel(0.7); // Higher temperature for creative response
      const result = await model.generateContent(prompt);
      return result.response.text();
    },
    3
  );

  // Parse JSON
  let jsonStr = response.trim();
  if (jsonStr.includes('```json')) {
    jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
  } else if (jsonStr.includes('```')) {
    jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(jsonStr);

  // Load full product details
  const productsWithDetails = await Promise.all(
    parsed.products.map(async (p: any) => {
      const product = await loadProductById(p.id);
      return {
        ...product,
        reason: p.reason
      };
    })
  );

  return {
    response: parsed.response,
    products: productsWithDetails
  };
}

/**
 * Answer general question about products
 */
async function answerGeneralQuestion(
  message: string,
  currentProducts: any[],
  conversationHistory: string
) {
  const prompt = `당신은 육아 제품 비교 전문가입니다. 사용자는 3개의 분유포트를 비교 중이며, 제품명을 직접 언급하면서 질문합니다.

**현재 비교 중인 제품들:**
${currentProducts.map((p, idx) => `
${idx + 1}. **${p.product.title}** (${p.product.price.toLocaleString()}원)

   **속성 점수:**
   - 온도 조절/유지: ${p.product.coreValues.temperatureControl}/10
   - 위생/세척: ${p.product.coreValues.hygiene}/10
   - 소재/안전성: ${p.product.coreValues.material}/10
   - 사용 편의성: ${p.product.coreValues.usability}/10
   - 휴대성: ${p.product.coreValues.portability}/10
   - 가격 대비 가치: ${p.product.coreValues.priceValue}/10
   - 부가 기능: ${p.product.coreValues.additionalFeatures}/10

   **상세 분석:**
${p.markdown.substring(0, 1500)}...
`).join('\n\n')}

**대화 이력:**
${conversationHistory || '(없음)'}

**사용자 질문:**
"${message}"

**답변 가이드라인:**
1. 사용자가 제품명을 언급하면 (예: "리웨이", "끌리젠", "유베라") 정확히 그 제품을 참조하세요
2. "이 중에서 가장 ~" 형태의 질문이면 3개 제품을 모두 비교하여 가장 우수한 것을 선정하세요
3. "A가 B보다 ~?" 형태의 질문이면 두 제품의 차이점을 구체적으로 설명하세요
4. 답변은 **상세 분석 정보를 반드시 활용**하여 구체적으로 작성하세요
5. 단순히 점수만 언급하지 말고, 실제 특징과 기능을 설명하세요
6. 친근하고 공감적인 톤으로 3-4문장 내외로 답변하세요
7. 필요시 제품명을 직접 언급하여 명확하게 구분하세요

**예시:**
- 질문: "이중에서 가장 소음 적은건?"
  답변: "소음 측면에서는 리웨이가 가장 조용합니다! 리웨이는 소음 억제 기술이 적용되어 야간에도 조용하게 사용할 수 있어요. 끌리젠은 중간 수준의 소음이 있고, 유베라는 가열 시 약간의 소리가 날 수 있습니다."

- 질문: "리웨이가 끌리젠보다 좋은점?"
  답변: "리웨이는 끌리젠보다 온도 유지력이 우수하고 세척이 더 편리합니다! 특히 분리형 구조로 설계되어 구석구석 깨끗하게 세척할 수 있어요. 또한 보온 성능도 더 뛰어나서 적정 온도를 오래 유지할 수 있습니다."

답변:`;

  const response = await callGeminiWithRetry(
    async () => {
      const model = getModel(0.7);
      const result = await model.generateContent(prompt);
      return result.response.text();
    },
    3
  );

  return response.trim();
}
