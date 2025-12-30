'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getModel, callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';
import fs from 'fs';
import path from 'path';

// 카테고리 인사이트 로드
function loadCategoryInsights(category: string): Record<string, unknown> | null {
  try {
    const filePath = path.join(process.cwd(), 'data', 'category-insights', `${category}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error(`Failed to load category insights for ${category}:`, error);
  }
  return null;
}

interface GenerateExamplesRequest {
  category: string;
  categoryName: string;
  userSelections?: {
    hardFilters?: Array<{ questionText: string; selectedLabels: string[] }>;
    balanceGames?: Array<{ title: string; selectedOption: string }>;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateExamplesRequest = await request.json();
    const { category, categoryName, userSelections } = body;

    // 카테고리 인사이트 로드
    const insights = loadCategoryInsights(category);

    // 사용자 선택 정보 포맷팅
    let selectionsContext = '';
    if (userSelections) {
      const parts: string[] = [];

      if (userSelections.hardFilters && userSelections.hardFilters.length > 0) {
        const hardFilterSummary = userSelections.hardFilters
          .filter(hf => hf.selectedLabels.length > 0)
          .map(hf => `${hf.questionText}: ${hf.selectedLabels.join(', ')}`)
          .join('\n');
        if (hardFilterSummary) {
          parts.push(`[사용자가 선택한 조건]\n${hardFilterSummary}`);
        }
      }

      if (userSelections.balanceGames && userSelections.balanceGames.length > 0) {
        const balanceSummary = userSelections.balanceGames
          .filter(bg => bg.selectedOption)
          .map(bg => `${bg.title}: ${bg.selectedOption}`)
          .join('\n');
        if (balanceSummary) {
          parts.push(`[사용자 밸런스 게임]\n${balanceSummary}`);
        }
      }

      if (parts.length > 0) {
        selectionsContext = parts.join('\n\n');
      }
    }

    // 인사이트 컨텍스트
    let insightsContext = '';
    if (insights) {
      const priceInfo = (insights as { guide?: { price_insight?: string } }).guide?.price_insight;
      const commonConcerns = (insights as { question_context?: { common_concerns?: string[] } }).question_context?.common_concerns;

      if (priceInfo || commonConcerns) {
        insightsContext = `
[카테고리 정보]
${priceInfo ? `가격 인사이트: ${priceInfo}` : ''}
${commonConcerns ? `일반적인 고민: ${commonConcerns.slice(0, 3).join(', ')}` : ''}
`;
      }
    }

    const systemPrompt = `당신은 육아용품 예산 상담 전문가입니다. 사용자가 자신의 상황을 말하면, AI가 적절한 예산 범위를 추천해줍니다.

**목표:** 사용자가 입력할 만한 "상황 설명" 예시 3개를 생성하세요.
- 사용자가 상황을 입력하면 → "이 상황이면 X만원~Y만원 정도가 적당해요"라고 예산을 추천할 것입니다.
- 따라서 지금 생성되는 예시는 예산 결정에 영향을 주는 사용자의 상황/맥락이어야 합니다.

**좋은 예시 (상황 기반):**
- "첫째 아이라 좋은 거 사주고 싶어요" → 프리미엄 예산 추천 가능
- "둘째라 가성비 위주로 보고 있어요" → 중저가 예산 추천 가능
- "한 달만 쓰고 지인한테 넘길 거예요" → 저가 예산 추천 가능
- "오래 쓸 거라 투자할 생각이에요" → 고가 예산 추천 가능
- "쌍둥이라 두 개 사야해요" → 총 예산 고려 필요

**나쁜 예시 (피해야 할 것):**
- "10만원 이하로 추천해주세요" (이미 예산을 정함)
- "제일 좋은 거 뭐예요?" (예산과 무관한 질문)
- "어떤 브랜드가 좋아요?" (예산과 무관한 질문)

**규칙:**
1. 각 예시는 15자 내외의 짧은 문장으로 (반말 존댓말 혼용 OK)
2. 예산 결정에 영향을 주는 상황/맥락을 담은 표현
3. 사용자가 이미 선택한 조건을 참고하여 연관된 상황 추측
4. 반드시 한글로 작성
5. 다양한 예산 성향 반영 (가성비, 투자, 특수상황 등)

**응답 형식 (JSON):**
{
  "examples": ["예시1", "예시2", "예시3"]
}`;

    const userPrompt = `**제품 카테고리:** ${categoryName}

${selectionsContext ? selectionsContext : '(아직 선택한 조건이 없습니다)'}

${insightsContext}

위 정보를 바탕으로 예산 관련 예시 질문 3개를 생성해주세요.`;

    const model = getModel(0.7); // 창의적 생성을 위해 높은 temperature

    const response = await callGeminiWithRetry(async () => {
      const result = await model.generateContent([
        { text: systemPrompt },
        { text: userPrompt },
      ]);
      return result.response.text();
    });

    const parsed = parseJSONResponse<{ examples: string[] }>(response);

    // 유효성 검증
    if (!parsed.examples || !Array.isArray(parsed.examples) || parsed.examples.length === 0) {
      throw new Error('Invalid response format');
    }

    return NextResponse.json({ examples: parsed.examples.slice(0, 3) });

  } catch (error) {
    console.error('Budget examples generation error:', error);
    // 폴백 예시
    return NextResponse.json({
      examples: [
        '첫째 아이라 좋은 거 사주고 싶어요',
        '가성비 좋은 제품이면 충분해요',
        '오래 쓸 거라 투자할 생각이에요',
      ]
    });
  }
}
