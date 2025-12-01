import { NextRequest, NextResponse } from 'next/server';
import { callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import { PrioritySettings } from '@/types';
import { PRIORITY_ATTRIBUTES } from '@/data/attributes';

const PARSE_QUERY_PROMPT = `당신은 분유포트 제품 추천 전문가입니다.

사용자가 입력한 자연어 쿼리를 분석하여, 6개 속성의 중요도와 예산을 판단해주세요.

**6가지 속성**:
${PRIORITY_ATTRIBUTES.map((attr, i) => `${i + 1}. ${attr.name} (${attr.key}): ${attr.description}`).join('\n')}

**중요도 레벨**:
- high (중요함): 사용자가 명시적으로 언급했거나 강조한 속성
- medium (보통): 사용자의 상황에서 어느 정도 중요할 것으로 추론되는 속성
- low (중요하지 않음): 언급되지 않았고 중요하지 않은 속성

**규칙**:
1. "중요함(high)"은 **반드시 1~3개**만 선택하세요.
2. 사용자가 명시적으로 언급한 키워드를 우선순위로 판단하세요.
3. 예시:
   - "쌍둥이라 동시에 분유를 자주 타요" → usability: high, hygiene: high, temperatureControl: medium
   - "외출이 많아서" → portability: high, temperatureControl: high
   - "세척을 자주 할 거예요" → hygiene: high
   - "조용한 제품" → usability: high, additionalFeatures: medium

**예산 파싱**:
사용자가 예산을 언급했다면 다음 중 하나로 매핑하세요:
- "0-50000": 최대 5만원 (예: "최대 5만원", "5만원 이하", "저렴한", "가성비", "5만원", "50000원 이하")
- "50000-100000": 최대 10만원 (예: "최대 10만원", "10만원 이하", "7만원", "8만원", "80000원")
- "100000-150000": 최대 15만원 (예: "최대 15만원", "15만원 이하", "12만원", "13만원", "120000원")
- "150000+": 15만원+ (예: "15만원+", "15만원 이상", "고급", "프리미엄", "20만원")
- null: 예산 언급 없음

**응답 형식** (JSON):
\`\`\`json
{
  "prioritySettings": {
    "temperatureControl": "medium",
    "hygiene": "high",
    "material": "low",
    "usability": "high",
    "portability": "low",
    "additionalFeatures": "low"
  },
  "budget": "50000-100000"
}
\`\`\`

사용자 쿼리: "{query}"

위 쿼리를 분석하여 JSON 형식으로 응답해주세요.`;

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string' || !query.trim()) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // Gemini API로 자연어 쿼리 분석
    const prompt = PARSE_QUERY_PROMPT.replace('{query}', query.trim());

    const response = await callGeminiWithRetry(async () => {
      const { getModel } = await import('@/lib/ai/gemini');
      const model = getModel(0.3); // 분류 작업이므로 낮은 temperature
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    // JSON 파싱
    const parsed = parseJSONResponse<{ prioritySettings: PrioritySettings; budget: string | null }>(response);
    const prioritySettings = parsed.prioritySettings;
    const budget = parsed.budget;

    // 유효성 검사
    const keys = Object.keys(prioritySettings);
    if (keys.length !== 6) {
      throw new Error('Invalid priority settings: must have exactly 6 attributes');
    }

    // 'high' 개수 검증
    const highCount = Object.values(prioritySettings).filter(v => v === 'high').length;
    if (highCount < 1 || highCount > 3) {
      // AI가 규칙을 어긴 경우, 강제로 조정
      console.warn(`AI returned ${highCount} high priorities, adjusting...`);

      // high를 3개 이하로 조정 (높은 우선순위부터 유지)
      const entries = Object.entries(prioritySettings);
      const sorted = entries.sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a[1] as 'high' | 'medium' | 'low'] - order[b[1] as 'high' | 'medium' | 'low'];
      });

      // 상위 1-3개는 high, 나머지는 medium/low로 조정
      const adjusted: PrioritySettings = {} as PrioritySettings;
      sorted.forEach(([key, value], index) => {
        if (index < Math.min(highCount, 3)) {
          adjusted[key as keyof PrioritySettings] = 'high';
        } else if (value === 'high') {
          adjusted[key as keyof PrioritySettings] = 'medium';
        } else {
          adjusted[key as keyof PrioritySettings] = value as 'low' | 'medium';
        }
      });

      return NextResponse.json({ prioritySettings: adjusted, budget });
    }

    return NextResponse.json({ prioritySettings, budget });
  } catch (error) {
    console.error('Parse query error:', error);
    return NextResponse.json(
      { error: 'Failed to parse query' },
      { status: 500 }
    );
  }
}
