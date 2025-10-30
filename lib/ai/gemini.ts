import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GEMINI_API_KEY) {
  throw new Error('GEMINI_API_KEY is not defined in environment variables');
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 기본 모델 설정
export const getModel = (temperature: number = 0.7) => {
  return genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
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
