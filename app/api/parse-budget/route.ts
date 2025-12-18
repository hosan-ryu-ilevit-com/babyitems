import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

interface ParseBudgetRequest {
  input: string; // 사용자 입력 (예: "7만 이하", "10만원 정도", "150000")
}

interface ParseBudgetResponse {
  success: boolean;
  budgetRange?: string; // "0-70000", "90000-110000" 등
  error?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { input }: ParseBudgetRequest = await req.json();

    if (!input || input.trim() === '') {
      return NextResponse.json(
        { success: false, error: '입력값이 비어있습니다' },
        { status: 400 }
      );
    }

    const prompt = `사용자가 입력한 예산을 분석해서 최소값-최대값 범위로 변환해주세요.

**입력:** "${input}"

**변환 규칙:**
1. "N만원 이하" → 0-N0000 (예: "7만 이하" → "0-70000")
2. "N만원 정도" → (N-1)0000-(N+1)0000 (예: "10만원 정도" → "90000-110000")
3. "N~M만원" → N0000-M0000 (예: "15~20만원" → "150000-200000")
4. "N만원 이상" → N0000+ (예: "20만원 이상" → "200000+")
5. 숫자만 입력 (예: "80000") → 해당 금액의 ±20% 범위
6. "N만원" (정확한 금액) → (N-0.5)0000-(N+0.5)0000 (예: "10만원" → "95000-105000")
7. 기타의 경우에도 적절히 형식에 맞게 변환하세요. 

**출력 형식 (JSON만 출력):**
\`\`\`json
{
  "budgetRange": "0-70000"
}
\`\`\`

**중요:**
- 반드시 JSON 형식만 출력
- budgetRange 필드만 포함
- 최소값-최대값 형식 (예: "0-70000", "90000-110000", "200000+")
- 금액은 항상 원 단위 (예: 70000, 100000)`;

    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // 가장 빠르고 저렴한 모델
      contents: prompt,
      config: {
        temperature: 0.1, // 일관성 있는 파싱을 위해 낮은 temperature
      },
    });

    if (!result.text) {
      throw new Error('LLM returned no text');
    }

    let responseText = result.text.trim();

    // JSON 코드 블록 제거
    const jsonMatch = responseText.match(/```json\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      responseText = jsonMatch[1].trim();
    }

    // JSON 파싱
    const parsed = JSON.parse(responseText);

    if (!parsed.budgetRange || typeof parsed.budgetRange !== 'string') {
      throw new Error('Invalid budgetRange format');
    }

    // budgetRange 검증 (형식: "N-M" 또는 "N+")
    const isValid =
      /^\d+-\d+$/.test(parsed.budgetRange) || /^\d+\+$/.test(parsed.budgetRange);

    if (!isValid) {
      throw new Error(`Invalid budget range format: ${parsed.budgetRange}`);
    }

    return NextResponse.json({
      success: true,
      budgetRange: parsed.budgetRange,
    });
  } catch (error) {
    console.error('[parse-budget] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
