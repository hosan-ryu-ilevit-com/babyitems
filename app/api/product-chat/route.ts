import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry, getModel, parseJSONResponse } from '@/lib/ai/gemini';
import { products } from '@/data/products';
import { Product } from '@/types';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// 마크다운 파일에서 섹션 추출
function extractMarkdownSection(content: string, sectionTitle: string): string[] {
  const lines = content.split('\n');
  const items: string[] = [];
  let inSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // 섹션 시작 감지
    if (line.includes(sectionTitle)) {
      inSection = true;
      continue;
    }

    // 다음 섹션 시작시 종료
    if (inSection && line.startsWith('####')) {
      break;
    }

    // 리스트 아이템 추출
    if (inSection && line.startsWith('-')) {
      const item = line.replace(/^-\s*\*\*/, '').replace(/\*\*:?/, ':').trim();
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

// 상품 정보를 마크다운으로 변환 (마크다운 파일 읽기 포함)
function productToMarkdown(product: Product): string {
  // 마크다운 파일에서 상세 정보 읽기
  let features: string[] = [];
  let pros: string[] = [];
  let cons: string[] = [];

  try {
    const mdPath = path.join(process.cwd(), 'data', 'products', `${product.id}.md`);
    if (fs.existsSync(mdPath)) {
      const mdContent = fs.readFileSync(mdPath, 'utf-8');

      // 각 섹션 추출
      pros = extractMarkdownSection(mdContent, '장점');
      cons = extractMarkdownSection(mdContent, '단점');

      // 특징은 장점의 앞부분을 사용 (간략화)
      features = pros.slice(0, 3);
    }
  } catch (error) {
    console.error(`Failed to read markdown for product ${product.id}:`, error);
  }

  const featuresText = features.length > 0 ? features.join('\n- ') : '정보 없음';
  const prosText = pros.length > 0 ? pros.join('\n- ') : '정보 없음';
  const consText = cons.length > 0 ? cons.join('\n- ') : '정보 없음';

  return `
# ${product.title}

**가격**: ${product.price.toLocaleString()}원
**리뷰 수**: ${product.reviewCount.toLocaleString()}개

## 핵심 성능 지표
- 온도 조절/유지: ${product.coreValues?.temperatureControl || 0}/10
- 위생/세척 편의성: ${product.coreValues?.hygiene || 0}/10
- 소재/안전성: ${product.coreValues?.material || 0}/10
- 사용 편의성: ${product.coreValues?.usability || 0}/10
- 휴대성: ${product.coreValues?.portability || 0}/10
- 가격 대비 가치: ${product.coreValues?.priceValue || 0}/10
- 부가 기능 및 디자인: ${product.coreValues?.additionalFeatures || 0}/10

## 제품 특징
- ${featuresText}

## 장점
- ${prosText}

## 단점
- ${consText}
`;
}

// 초기 상품 설명 생성
async function generateInitialDescription(productId: string) {
  const product = products.find((p) => p.id === productId);
  if (!product) {
    return { message: '상품을 찾을 수 없습니다.' };
  }

  const productInfo = productToMarkdown(product);

  const prompt = `당신은 분유포트 전문가입니다. 아래 제품 정보를 바탕으로 사용자에게 이 제품을 친근하고 간결하게 소개해주세요.

제품 정보:
${productInfo}

요구사항:
- 2-3문장으로 핵심 특징을 소개
- 육아맘 관점에서 공감하는 톤
- 장점을 중심으로 설명하되, 객관적으로
- 이모지는 사용하지 마세요`;

  const response = await callGeminiWithRetry(async () => {
    const model = getModel(0.7);
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
  return { message: response };
}

// 다른 상품 추천이 필요한지 판단
async function checkProductRecommendationIntent(userMessage: string): Promise<boolean> {
  const prompt = `사용자의 메시지를 분석해서, 다른 상품을 추천받고 싶어하는지 판단해주세요.

사용자 메시지: "${userMessage}"

다음과 같은 경우 true를 반환:
- "다른 상품", "비슷한 상품", "대신", "추천", "더 좋은", "더 저렴한", "대체", "비교" 등의 키워드
- 현재 제품의 단점을 언급하며 다른 선택지를 원하는 경우

다음과 같은 경우 false를 반환:
- 현재 제품에 대한 질문 (단점, 장점, 사용법, 특징 등)
- 단순 정보 요청

JSON 형식으로만 답변하세요:
{
  "needsRecommendation": true/false,
  "reason": "판단 이유"
}`;

  const response = await callGeminiWithRetry(async () => {
    const model = getModel(0.3);
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
  const parsed = parseJSONResponse<{ needsRecommendation: boolean; reason: string }>(response);
  return parsed.needsRecommendation;
}

// 다른 상품 추천
async function recommendAlternativeProduct(
  currentProduct: Product,
  userMessage: string,
  conversationHistory: Message[]
): Promise<{ message: string; recommendedProduct?: { productId: string; reason: string } }> {
  // 현재 상품 제외한 제품 목록
  const otherProducts = products.filter((p) => p.id !== currentProduct.id);
  const productList = otherProducts.map((p) => `- ${p.id}: ${p.title} (${p.price.toLocaleString()}원)`).join('\n');

  const conversationContext = conversationHistory
    .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
    .join('\n');

  const prompt = `당신은 분유포트 전문가입니다. 사용자의 요청을 바탕으로 적합한 대체 상품을 추천해주세요.

현재 상품: ${currentProduct.title} (${currentProduct.price.toLocaleString()}원)

대화 내역:
${conversationContext}

사용자 요청: "${userMessage}"

추천 가능한 상품 목록:
${productList}

요구사항:
1. 사용자의 요청에 가장 적합한 상품 1개를 선택
2. 왜 이 상품이 더 나은지 2-3문장으로 설명
3. 현재 상품과의 주요 차이점 강조

JSON 형식으로만 답변하세요:
{
  "recommendedProductId": "상품 ID",
  "message": "추천 이유 설명"
}`;

  const response = await callGeminiWithRetry(async () => {
    const model = getModel(0.7);
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
  const parsed = parseJSONResponse<{ recommendedProductId: string; message: string }>(response);

  return {
    message: parsed.message,
    recommendedProduct: {
      productId: parsed.recommendedProductId,
      reason: parsed.message,
    },
  };
}

// 일반 상품 질문 답변
async function answerProductQuestion(
  product: Product,
  userMessage: string,
  conversationHistory: Message[]
): Promise<string> {
  const productInfo = productToMarkdown(product);
  const conversationContext = conversationHistory
    .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
    .join('\n');

  const prompt = `당신은 분유포트 전문가입니다. 아래 제품 정보를 바탕으로 사용자의 질문에 답변해주세요.

제품 정보:
${productInfo}

대화 내역:
${conversationContext}

사용자 질문: "${userMessage}"

요구사항:
- 제품 정보를 기반으로 정확하게 답변
- 육아맘 관점에서 공감하는 톤
- 2-3문장으로 간결하게
- 객관적이고 솔직하게
- 이모지는 사용하지 마세요

답변:`;

  const response = await callGeminiWithRetry(async () => {
    const model = getModel(0.7);
    const result = await model.generateContent(prompt);
    return result.response.text();
  });
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, productId, userMessage, conversationHistory } = body;

    if (action === 'initial_description') {
      const result = await generateInitialDescription(productId);
      return NextResponse.json(result);
    }

    if (action === 'chat') {
      const product = products.find((p) => p.id === productId);
      if (!product) {
        return NextResponse.json({ message: '상품을 찾을 수 없습니다.' }, { status: 404 });
      }

      // 다른 상품 추천이 필요한지 확인
      const needsRecommendation = await checkProductRecommendationIntent(userMessage);

      if (needsRecommendation) {
        // 다른 상품 추천
        const result = await recommendAlternativeProduct(product, userMessage, conversationHistory);
        return NextResponse.json(result);
      } else {
        // 일반 질문 답변
        const answer = await answerProductQuestion(product, userMessage, conversationHistory);
        return NextResponse.json({ message: answer });
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Product chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
