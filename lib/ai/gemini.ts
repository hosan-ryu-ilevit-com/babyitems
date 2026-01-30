import { GoogleGenerativeAI } from '@google/generative-ai';

// Lazy initialization - 함수 호출 시점에 환경 변수 확인
let genAI: GoogleGenerativeAI | null = null;
let initialized = false;

function getGenAI(): GoogleGenerativeAI | null {
  if (!initialized) {
    initialized = true;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('❌ GEMINI_API_KEY is not defined in environment variables');
      console.error('   AI features will not work. Please set GEMINI_API_KEY in .env.local');
    } else {
      genAI = new GoogleGenerativeAI(apiKey);
    }
  }
  return genAI;
}

// Gemini API 사용 가능 여부 확인
export const isGeminiAvailable = (): boolean => {
  return getGenAI() !== null;
};

// 기본 모델 설정
export const getModel = (temperature: number = 0.7) => {
  const ai = getGenAI();
  if (!ai) {
    throw new Error('Gemini API is not initialized. Please set GEMINI_API_KEY environment variable.');
  }
  return ai.getGenerativeModel({
    model: 'gemini-flash-lite-latest',
    generationConfig: {
      temperature,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });
};

// Gemini flash 모델 (리뷰 분석용 - thinking 모드)
export const getProModel = (temperature: number = 0.3) => {
  const ai = getGenAI();
  if (!ai) {
    throw new Error('Gemini API is not initialized. Please set GEMINI_API_KEY environment variable.');
  }
  return ai.getGenerativeModel({
    model: 'gemini-flash-latest',
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
      const errorMsg = lastError.message || '';
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('Too Many Requests') || errorMsg.includes('quota');

      console.error(`Gemini API call failed (attempt ${attempt + 1}/${maxRetries}):`, error);

      if (attempt < maxRetries - 1) {
        // Rate limit 에러는 더 긴 대기 시간 (30초부터 시작)
        const baseDelay = isRateLimit ? 30000 : initialDelay;
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`${isRateLimit ? '⚠️ Rate limit - ' : ''}Retrying in ${delay / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(`Gemini API call failed after ${maxRetries} attempts: ${lastError?.message}`);
}

// JSON 응답을 파싱하는 헬퍼 함수
export function parseJSONResponse<T>(text: string): T {
  try {
    // 1. 마크다운 JSON 코드 블록이 있는 경우 추출
    const jsonBlockMatch = text.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonBlockMatch) {
      return JSON.parse(jsonBlockMatch[1].trim());
    }

    // 2. 일반 코드 블록이 있는 경우 추출
    const codeBlockMatch = text.match(/```\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1].trim());
    }

    // 3. 중괄호로 시작하는 JSON 객체 찾기
    const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      return JSON.parse(jsonObjectMatch[0]);
    }

    // 4. 그래도 안되면 전체 텍스트를 파싱 시도
    return JSON.parse(text.trim());
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
