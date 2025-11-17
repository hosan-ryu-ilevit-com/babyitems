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
    const { message, productIds, conversationHistory, userContext } = await req.json();

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
        conversationHistory,
        userContext
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
        conversationHistory,
        userContext
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
  conversationHistory: string,
  userContext?: {
    prioritySettings?: Record<string, string>;
    budget?: { min: number; max: number };
    phase0Context?: string;
    chatConversations?: Record<string, Array<{ role: string; content: string }>>;
  }
) {
  const currentProductIds = currentProducts.map(p => p.id);
  const availableProducts = allProducts.filter(p => !currentProductIds.includes(p.id));

  // Build user context section if available
  let contextSection = '';
  if (userContext && userContext.prioritySettings) {
    const priorities = Object.entries(userContext.prioritySettings)
      .filter(([, value]) => value === 'high')
      .map(([key]) => {
        const names: Record<string, string> = {
          temperatureControl: '온도 조절/유지',
          hygiene: '위생/세척',
          material: '소재/안전성',
          usability: '사용 편의성',
          portability: '휴대성',
          additionalFeatures: '부가 기능'
        };
        return names[key] || key;
      });

    if (priorities.length > 0) {
      contextSection = `\n**사용자가 중요하게 생각하는 속성:**\n${priorities.map(p => `- ${p}`).join('\n')}\n`;
    }

    if (userContext.budget && userContext.budget.min !== undefined && userContext.budget.max !== undefined) {
      const { min, max } = userContext.budget;
      contextSection += `\n**사용자 예산:** ${min.toLocaleString()}원 ~ ${max === Infinity ? '제한 없음' : max.toLocaleString() + '원'}\n`;
    }

    if (userContext.phase0Context) {
      contextSection += `\n**사용자 상황:** ${userContext.phase0Context}\n`;
    }
  }

  // 점수를 자연스러운 언어로 변환하는 함수
  const toNaturalLanguage = (score: number): string => {
    if (score >= 9) return '매우 우수';
    if (score >= 8) return '우수';
    if (score >= 7) return '좋음';
    if (score >= 6) return '적절함';
    if (score >= 5) return '평범함';
    return '보통 이하';
  };

  const prompt = `당신은 육아 제품 추천 전문가입니다.
${contextSection}
**현재 비교 중인 제품들:**
${currentProducts.map((p, idx) => `
${idx + 1}. ${p.title} (${p.price.toLocaleString()}원)
   - 온도 조절: ${toNaturalLanguage(p.coreValues.temperatureControl)}
   - 위생: ${toNaturalLanguage(p.coreValues.hygiene)}
   - 소재: ${toNaturalLanguage(p.coreValues.material)}
   - 사용 편의성: ${toNaturalLanguage(p.coreValues.usability)}
   - 휴대성: ${toNaturalLanguage(p.coreValues.portability)}
   - 부가 기능: ${toNaturalLanguage(p.coreValues.additionalFeatures)}
`).join('\n')}

**사용 가능한 다른 제품들:**
${availableProducts.slice(0, 10).map((p, idx) => `
${idx + 1}. ${p.title} (${p.price.toLocaleString()}원)
   - 온도 조절: ${toNaturalLanguage(p.coreValues.temperatureControl)}
   - 위생: ${toNaturalLanguage(p.coreValues.hygiene)}
   - 소재: ${toNaturalLanguage(p.coreValues.material)}
   - 사용 편의성: ${toNaturalLanguage(p.coreValues.usability)}
   - 휴대성: ${toNaturalLanguage(p.coreValues.portability)}
   - 부가 기능: ${toNaturalLanguage(p.coreValues.additionalFeatures)}
`).join('\n')}

**대화 이력:**
${conversationHistory || '(없음)'}

**사용자 요청:**
"${message}"

**의도 분석 결과:**
- 타입: ${intent.type === 'replace' ? '제품 교체' : '제품 추가'}
${intent.productToReplace ? `- 교체 대상: ${intent.productToReplace}` : ''}

**요청사항:**
1. **사용자가 중요하게 생각하는 속성**을 고려하여 대체 제품을 추천하세요
2. 사용자의 예산 범위 내에서 제품을 선택하세요
3. 사용자의 특별한 상황(phase0Context)을 고려하세요
4. 적절한 대체 제품 1-2개를 추천하세요
5. 추천 이유를 간결하게 설명하세요 (각 50자 이내)
6. 사용자에게 친근하고 공감적인 톤으로 답변하세요
7. **⚠️ 중요: "8점", "9점", "10점" 등 숫자 점수를 절대 언급하지 마세요!** 대신 실제 기능과 특징을 자연스럽게 설명하세요

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
  conversationHistory: string,
  userContext?: {
    prioritySettings?: Record<string, string>;
    budget?: { min: number; max: number };
    phase0Context?: string;
    chatConversations?: Record<string, Array<{ role: string; content: string }>>;
  }
) {
  // Build user context section if available
  let contextSection = '';
  if (userContext && userContext.prioritySettings) {
    const priorities = Object.entries(userContext.prioritySettings)
      .filter(([, value]) => value === 'high')
      .map(([key]) => {
        const names: Record<string, string> = {
          temperatureControl: '온도 조절/유지',
          hygiene: '위생/세척',
          material: '소재/안전성',
          usability: '사용 편의성',
          portability: '휴대성',
          additionalFeatures: '부가 기능'
        };
        return names[key] || key;
      });

    if (priorities.length > 0) {
      contextSection = `\n**사용자가 중요하게 생각하는 속성:**\n${priorities.map(p => `- ${p}`).join('\n')}\n`;
    }

    if (userContext.budget && userContext.budget.min !== undefined && userContext.budget.max !== undefined) {
      const { min, max } = userContext.budget;
      contextSection += `\n**사용자 예산:** ${min.toLocaleString()}원 ~ ${max === Infinity ? '제한 없음' : max.toLocaleString() + '원'}\n`;
    }

    if (userContext.phase0Context) {
      contextSection += `\n**사용자 상황:** ${userContext.phase0Context}\n`;
    }
  }

  const prompt = `당신은 육아 제품 비교 전문가입니다. 사용자는 3개의 분유포트를 비교 중이며, 제품명을 직접 언급하면서 질문합니다.
${contextSection}
**현재 비교 중인 제품들:**
${currentProducts.map((p, idx) => {
    // 점수를 자연스러운 언어로 변환
    const toNaturalLanguage = (score: number): string => {
      if (score >= 9) return '매우 우수';
      if (score >= 8) return '우수';
      if (score >= 7) return '좋음';
      if (score >= 6) return '적절함';
      if (score >= 5) return '평범함';
      return '보통 이하';
    };

    return `
${idx + 1}. **${p.product.title}** (${p.product.price.toLocaleString()}원)

   **제품 특징 요약:**
   - 온도 조절/유지: ${toNaturalLanguage(p.product.coreValues.temperatureControl)}
   - 위생/세척: ${toNaturalLanguage(p.product.coreValues.hygiene)}
   - 소재/안전성: ${toNaturalLanguage(p.product.coreValues.material)}
   - 사용 편의성: ${toNaturalLanguage(p.product.coreValues.usability)}
   - 휴대성: ${toNaturalLanguage(p.product.coreValues.portability)}
   - 가격 대비 가치: ${toNaturalLanguage(p.product.coreValues.priceValue)}
   - 부가 기능: ${toNaturalLanguage(p.product.coreValues.additionalFeatures)}

   **상세 분석 및 실제 스펙:**
${p.markdown.substring(0, 2000)}...
`;
  }).join('\n\n')}

**대화 이력:**
${conversationHistory || '(없음)'}

**사용자 질문:**
"${message}"

**답변 가이드라인:**
1. **사용자가 중요하게 생각하는 속성을 우선적으로 고려**하여 답변하세요
2. 사용자의 예산과 상황을 염두에 두고 답변하세요
3. 사용자가 제품명을 언급하면 (예: "리웨이", "끌리젠", "유베라") 정확히 그 제품을 참조하세요
4. "이 중에서 가장 ~" 형태의 질문이면 3개 제품을 모두 비교하여 가장 우수한 것을 선정하세요
5. "A가 B보다 ~?" 형태의 질문이면 두 제품의 차이점을 구체적으로 설명하세요
6. 답변은 **상세 분석의 구체적인 스펙과 기능 정보를 반드시 활용**하여 작성하세요
7. **⚠️ 중요: "8점", "9점", "10점" 등 숫자 점수를 절대 언급하지 마세요!** 대신 실제 기능과 특징을 자연스러운 언어로 설명하세요
8. 친근하고 공감적인 톤으로 핵심적인 2-3문장 내외로 답변하세요
9. 필요시 제품명을 직접 언급하여 명확하게 구분하세요

**답변 예시 (좋은 예):**
- 질문: "이중에서 가장 소음 적은건?"
  답변: "소음 측면에서는 **리웨이**가 가장 조용합니다! 리웨이는 소음 억제 기술이 적용되어 야간에도 조용하게 사용할 수 있어요. 끌리젠은 중간 수준의 소음이 있고, 유베라는 가열 시 약간의 소리가 날 수 있습니다."

- 질문: "리웨이가 끌리젠보다 좋은점?"
  답변: "**리웨이**는 끌리젠보다 온도 유지력이 우수하고 세척이 더 편리합니다! 특히 분리형 구조로 설계되어 구석구석 깨끗하게 세척할 수 있어요. 또한 보온 성능도 더 뛰어나서 적정 온도를 오래 유지할 수 있습니다."

- 질문: "가장 세척하기 편한 제품은?"
  답변: "세척 편의성은 **끌리젠**이 단연 최고입니다! 분리형 상판과 넓은 입구 덕분에 손이 쉽게 들어가 구석구석 세척할 수 있어요. 스테인리스 소재라 물때도 잘 안 생기고요."

**⚠️ 나쁜 예 (절대 금지):**
- ❌ "리웨이는 온도 조절이 9점이라 우수합니다"
- ❌ "끌리젠은 위생 점수가 8점으로 좋아요"
- ❌ "유베라는 휴대성이 7점으로 적절합니다"

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
