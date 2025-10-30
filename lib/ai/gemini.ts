import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not defined in environment variables');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 기본 모델 설정
export const getModel = (temperature: number = 0.7) => {
  return genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp', // 최신 Gemini 모델
    generationConfig: {
      temperature,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });
};

// 재시도 로직을 포함한 API 호출
export async function callGeminiWithRetry<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error as Error;
      console.error(`Gemini API call failed (attempt ${attempt + 1}/${maxRetries}):`, error);

      if (attempt < maxRetries - 1) {
        // Exponential backoff
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Gemini API call failed after ${maxRetries} attempts: ${lastError?.message}`);
}

// JSON 응답을 파싱하는 헬퍼 함수
export function parseJSONResponse<T>(text: string): T {
  try {
    // 마크다운 코드 블록 제거
    const jsonText = text
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse JSON response:', text);
    throw new Error(`JSON parsing failed: ${(error as Error).message}`);
  }
}

// 대화형 AI 응답 생성
export async function generateAIResponse(
  systemPrompt: string,
  conversationHistory: { role: string; parts: { text: string }[] }[]
): Promise<string> {
  return callGeminiWithRetry(async () => {
    const model = getModel(0.8); // 대화에는 조금 더 높은 temperature

    // 시스템 프롬프트를 첫 메시지로 추가
    const messages = [
      {
        role: 'user',
        parts: [{ text: systemPrompt }],
      },
      {
        role: 'model',
        parts: [{ text: '네, 이해했습니다. 친절하고 전문적으로 사용자를 도와드리겠습니다.' }],
      },
      ...conversationHistory,
    ];

    const chat = model.startChat({
      history: messages.slice(0, -1), // 마지막 메시지 제외
    });

    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage.parts[0].text);
    const response = result.response;

    return response.text();
  });
}
