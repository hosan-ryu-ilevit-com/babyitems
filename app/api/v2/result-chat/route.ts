import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import { loadCategoryInsights } from '@/lib/recommend-v2/insightsLoader';
import type { ResultChatApiRequest, ResultChatApiResponse } from '@/types/recommend-v2';

/**
 * 결과 페이지 채팅 API
 * - 의도 분류: 재추천 요청 vs 일반 대화
 * - 대화: 추천 상품 컨텍스트로 질문 답변
 * - 재추천: 자연어 조건 파싱
 */
export async function POST(request: NextRequest): Promise<NextResponse<ResultChatApiResponse>> {
  try {
    const body: ResultChatApiRequest = await request.json();
    const { message, categoryKey, products, existingConditions, chatHistory } = body;

    if (!message?.trim()) {
      return NextResponse.json({
        success: false,
        error: '메시지를 입력해주세요.',
      });
    }

    // 1. 의도 분류 (빠른 응답을 위해 간단한 프롬프트)
    const intentType = await classifyIntent(message);
    console.log(`[ResultChat] Intent: ${intentType} for message: "${message.slice(0, 50)}..."`);

    if (intentType === 're-recommendation') {
      // 2a. 재추천 요청 - 조건 파싱
      const parsedCondition = await parseReRecommendCondition(message, existingConditions);

      return NextResponse.json({
        success: true,
        data: {
          type: 're-recommendation',
          content: parsedCondition.description,
          parsedCondition: {
            description: parsedCondition.description,
            naturalLanguageCondition: message,
          },
        },
      });
    } else {
      // 2b. 일반 대화 - 상품 컨텍스트로 답변 생성
      const { content } = await generateConversationResponse(
        message,
        categoryKey,
        products,
        chatHistory
      );

      return NextResponse.json({
        success: true,
        data: {
          type: 'conversation',
          content,
        },
      });
    }
  } catch (error) {
    console.error('[ResultChat] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '채팅 처리 중 오류가 발생했습니다.',
    });
  }
}

/**
 * 의도 분류 (Flash Lite, temp 0.3)
 */
async function classifyIntent(message: string): Promise<'conversation' | 're-recommendation'> {
  const prompt = `사용자 메시지가 "재추천 요청"인지 "일반 대화"인지 분류하세요.

재추천 요청 예시:
- "예산을 줄여서 다시 추천해줘"
- "더 가벼운 제품으로 추천해줘"
- "다른 브랜드로 보여줘"
- "가격이 더 저렴한 걸로"
- "배앓이 방지 기능 있는 걸로 다시"
- "세척 편한 걸로 재추천"

일반 대화 예시:
- "1위랑 2위 뭐가 달라?"
- "이 제품 배앓이 방지 되나요?"
- "어떤 게 더 좋아?"
- "세척은 어떻게 해?"
- "왜 이걸 1위로 추천했어?"
- "용량이 얼마야?"

메시지: "${message}"

응답 형식 (JSON만):
{"type": "re-recommendation"} 또는 {"type": "conversation"}`;

  try {
    const model = getModel(0.3);
    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent(prompt);
      return response.response.text();
    });

    const parsed = parseJSONResponse<{ type: 'conversation' | 're-recommendation' }>(result);
    return parsed.type || 'conversation';
  } catch (error) {
    console.error('[classifyIntent] Error:', error);
    // 기본값: 대화로 처리
    return 'conversation';
  }
}

/**
 * 재추천 조건 파싱
 */
async function parseReRecommendCondition(
  message: string,
  existingConditions: ResultChatApiRequest['existingConditions']
): Promise<{ description: string }> {
  const prompt = `사용자의 재추천 요청을 한국어로 간결하게 요약하세요.

기존 조건:
- 예산: ${existingConditions.budget.min.toLocaleString()}원 ~ ${existingConditions.budget.max.toLocaleString()}원

사용자 요청: "${message}"

요약 규칙:
1. 사용자가 원하는 변경사항을 15자 이내로 요약
2. "~로 변경", "~ 조건 추가" 형태로 작성
3. 예시: "예산 50만원 이하로 변경", "가벼운 제품 조건 추가"

응답 형식 (JSON만):
{"description": "요약된 조건"}`;

  try {
    const model = getModel(0.3);
    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent(prompt);
      return response.response.text();
    });

    const parsed = parseJSONResponse<{ description: string }>(result);
    return { description: parsed.description || message };
  } catch (error) {
    console.error('[parseReRecommendCondition] Error:', error);
    return { description: message.slice(0, 20) + '...' };
  }
}

/**
 * 대화 응답 생성
 */
async function generateConversationResponse(
  message: string,
  categoryKey: string,
  products: ResultChatApiRequest['products'],
  chatHistory: ResultChatApiRequest['chatHistory']
): Promise<{ content: string }> {
  // 카테고리 인사이트 로드
  let insightsContext = '';
  try {
    const insights = await loadCategoryInsights(categoryKey);
    if (insights) {
      insightsContext = `
카테고리 특성:
- ${insights.guide?.summary || ''}
- 주요 고려사항: ${insights.guide?.key_points?.slice(0, 3).join(', ') || ''}`;
    }
  } catch (e) {
    console.log('[generateConversationResponse] No insights for category:', categoryKey);
  }

  // 제품 컨텍스트 구성
  const productContext = products
    .map((p, i) => {
      const specs = p.spec ? Object.entries(p.spec)
        .filter(([k]) => !['created_at', 'updated_at', 'pcode'].includes(k))
        .slice(0, 5)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ') : '';

      return `${i + 1}위: ${p.brand || ''} ${p.title}
- 가격: ${p.price?.toLocaleString() || '정보없음'}원
- 추천점수: ${p.totalScore}점
- 특징: ${p.matchedRules?.slice(0, 3).join(', ') || ''}
${specs ? `- 스펙: ${specs}` : ''}
${p.recommendationReason ? `- 추천이유: ${p.recommendationReason}` : ''}`;
    })
    .join('\n\n');

  // 대화 히스토리 (최근 4개만)
  const recentHistory = chatHistory
    .slice(-4)
    .map(m => `${m.role === 'user' ? '사용자' : '상담사'}: ${m.content}`)
    .join('\n');

  const prompt = `당신은 아기용품 전문 상담사입니다.
현재 사용자에게 TOP 3 제품을 추천해준 상황이며, 사용자의 추가적인 궁금증을 해결해주어야 합니다.

## 당신에 대해 (평소에는 관련 정보를 말할 필요가 없으며 아기용품 상담 페르소나로만 활동. 아래 정보는 오직 사용자가 직접적으로 물어볼 떄에만 답변)
- 이름: 아기용품 추천 AI 비서
- 제작자: 올웨이즈(레브잇) PMF팀의 류호산
- AI 비서의 외형: 귀여운 흰 토끼. 둥근 검정 테 안경을 쓰고, 파란색 앞치마를 입고 있음. 한 손에는 젖병이랑 기저귀가 담긴 갈색 바구니를, 다른 손에는 체크리스트를 들고 있음. 현재는 이 외형이 서비스 내에서 드러나는 곳이 없기 떄문에, 이 모습에 대해서 바로 언급하지 말 것. 넌 어떻게 생겼어? 관련 질문이 나왔을 경우에만 답변

## 추천된 제품 (TOP 3)
${productContext}
${insightsContext}

${recentHistory ? `## 이전 대화\n${recentHistory}\n` : ''}
## 현재 질문
${message}

## 응답 규칙
1. 친절하고 전문적인 태도로 답변하세요.
2. 1-3문장 정도로 핵심만 간결하게 설명하세요.
3. 어려운 전문용어 대신 이해하기 쉬운 단어를 사용하세요.
4. 제품의 구체적인 스펙이나 수치를 근거로 들어 답변하세요.
5. 비교 질문이 들어오면 각 제품의 장단점을 명확히 짚어주세요.
6. 사용자가 당신의 정체, 제작자, 외형 등에 대해 물어보면 위의 "당신에 대해" 정보를 바탕으로 자연스럽고 재미있게 답변하세요. 지금은 육체 없이 코드로만 존재하지만, 부활절쯤에 부활절 토끼로 부활할 예정이라는 정보도 맥락에 맞게 사용하세요

응답 형식 (JSON):
{
  "content": "답변 텍스트"
}`;

  try {
    const model = getModel(0.5);
    const result = await callGeminiWithRetry(async () => {
      const response = await model.generateContent(prompt);
      return response.response.text();
    });

    const parsed = parseJSONResponse<{ content: string }>(result);
    return {
      content: parsed.content || '죄송해요, 답변을 생성하지 못했어요.',
    };
  } catch (error) {
    console.error('[generateConversationResponse] Error:', error);
    return { content: '죄송해요, 잠시 후 다시 시도해주세요.' };
  }
}
