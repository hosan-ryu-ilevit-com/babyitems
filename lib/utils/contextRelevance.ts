import { callGeminiWithRetry } from '@/lib/ai/gemini';

/**
 * 연관도 판단 결과 타입
 */
export type ContextRelevance = 'strong' | 'weak' | 'none';

/**
 * Phase 0 맥락과 현재 속성의 연관도를 LLM으로 판단합니다.
 * Flash lite 모델을 사용하여 빠르고 정확하게 판단합니다.
 *
 * ⚠️ 서버 사이드 전용 함수입니다.
 */
export async function assessContextRelevance(
  phase0Context: string,
  attributeName: string
): Promise<ContextRelevance> {
  // 맥락이 없으면 'none'
  if (!phase0Context || phase0Context.trim() === '없어요' || phase0Context.trim().length < 3) {
    console.log(`[연관도 판단] 맥락 없음 → none`);
    return 'none';
  }

  const prompt = `사용자가 Phase 0 인트로에서 말한 내용과 현재 질문할 속성의 연관도를 판단해주세요.

**Phase 0 사용자 컨텍스트:**
${phase0Context}

**현재 속성:**
${attributeName}

**판단 기준:**
- "strong": Phase 0 내용이 이 속성과 직접적으로 강하게 연관됨 (예: "보온이 중요해요" → 온도 조절/보온 속성)
- "weak": Phase 0 내용이 이 속성과 간접적으로 연관됨 (예: "새벽 수유가 힘들어요" → 온도 조절/보온 속성)
- "none": Phase 0 내용이 이 속성과 전혀 연관 없음

다음 JSON 형식으로만 응답하세요:
{
  "relevance": "strong" | "weak" | "none",
  "reason": "판단 이유 (한 문장)"
}`;

  try {
    const response = await callGeminiWithRetry(async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({
        model: 'gemini-flash-lite-latest',
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 256,
        },
      });

      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    // JSON 추출 (마크다운 코드 블록 제거)
    let jsonText = response.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```\n?$/g, '').trim();
    }

    const parsed = JSON.parse(jsonText);
    const relevance = parsed.relevance as ContextRelevance;

    console.log(
      `[연관도 판단 (LLM)] "${attributeName}" ← ${relevance} (이유: ${parsed.reason})`
    );

    return relevance;
  } catch (error) {
    console.error('[연관도 판단 실패]', error);
    // 에러 시 안전하게 'none' 반환
    return 'none';
  }
}
