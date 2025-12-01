import { NextRequest, NextResponse } from 'next/server';
import { generateAIResponse } from '@/lib/ai/gemini';
import { Message, PrioritySettings } from '@/types';
import { ASSISTANT_CHAT2_PROMPT } from '@/data/attributes';

/**
 * Priority 설정을 자연스러운 한국어로 요약
 * @param settings - Priority 설정
 * @param phase0Context - 추가 요청사항 (선택적)
 */
function generatePrioritySummary(settings: PrioritySettings, phase0Context?: string): string {
  const attributeNames: { [key: string]: string } = {
    temperatureControl: '온도 조절/유지 성능',
    hygiene: '위생/세척 편의성',
    material: '소재 안전성',
    usability: '사용 편의성',
    portability: '휴대성',
    additionalFeatures: '부가 기능'
  };

  const highPriority = Object.entries(settings)
    .filter(([, level]) => level === 'high')
    .map(([key]) => attributeNames[key] || key);

  const mediumPriority = Object.entries(settings)
    .filter(([, level]) => level === 'medium')
    .map(([key]) => attributeNames[key] || key);

  let summary = '';

  if (highPriority.length > 0) {
    summary += `평가해주신 기준을 보니, **${highPriority.join(', ')}**을(를) 중요하게 생각하시는군요!`;
  }

  // if (mediumPriority.length > 0) {
  //   if (summary) summary += '\n';
  //   summary += `${mediumPriority.join(', ')}도 적당히 고려하시고 싶으시고요.`;
  // }

  // phase0Context가 있으면 추가 (단, "없어요", "상관없어요" 등은 제외)
  const negativePhrases = ['없어요', '없습니다', '상관없어요', '상관없습니다', '특별한 상황 없어요', '해당 없음'];
  const hasValidContext = phase0Context &&
    phase0Context.trim() &&
    !negativePhrases.some(phrase => phase0Context.trim().toLowerCase().includes(phrase.toLowerCase()));

  if (hasValidContext) {
    if (summary) summary += '\n\n';
    summary += `추가로 말씀하신 **"${phase0Context}"** 같은 상황도 모두 이해했습니다.`;
  }

  return summary;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, phase, action, attributeName, phase0Context, attributeDetails, conversationHistory, currentTurn, prioritySettings } = body;

    // 재추천 입력 검증 (의미 있는 요청인지 확인)
    if (action === 'validate_rerecommendation_input') {
      const { userInput, currentRecommendations } = body;

      // 현재 추천된 제품 정보 포맷팅
      const productsContext = currentRecommendations
        ? `\n**현재 추천된 Top 3 제품**:\n${currentRecommendations.map((r: { title: string; price: number }, i: number) =>
            `${i + 1}. ${r.title} (${r.price.toLocaleString()}원)`
          ).join('\n')}\n`
        : '';

      const prompt = `사용자가 분유포트 재추천을 위해 입력한 내용이 **의미 있는 요청**인지 판단해주세요.
${productsContext}
**의미 있는 요청**:
- 예산 변경 (예: "5만원 아래로", "더 저렴하게", "10만원 이내")
- 특정 기능 요청 (예: "쿨링팬 있는 걸로", "온도 조절 정확한 거", "세척 쉬운 제품")
- 상황 변경 (예: "외출이 많아져서", "쌍둥이라", "야간 수유 빈번")
- 소재/안전성 요구 (예: "스테인리스로", "플라스틱 없는 거", "BPA 프리")
- 부가 기능 (예: "자동 출수", "타이머 기능", "디지털 온도계")
- **제품 비교/변경** (예: "벤하임보다 더 좋은 거", "1번 대신 다른 걸로", "이것보다 저렴한 거", "비슷한데 더 싼 거")
  - 위 Top 3 제품 이름이나 순위(1번, 2번, 3번)를 언급하면서 비교하는 경우
  - "~보다", "~같은", "~대신", "비슷한" 등의 비교 표현 사용

**의미 없는 요청** (재추천 불필요):
- 단순 인사 (예: "안녕하세요", "감사합니다", "좋아요")
- 질문만 (예: "이게 뭐예요?", "어떤 게 좋아요?" - 단, 구체적 기준 포함 시 의미 있음)
- 매우 모호한 표현 (예: "더 좋은 거", "다른 거", "바꿔주세요" - 아무 기준 없음)
  - 단, 제품명 언급이나 구체적 비교가 있으면 의미 있음
- 관련 없는 내용 (예: "날씨가 좋네요", "배고파요")

사용자 입력: "${userInput}"

응답 형식 (JSON):
{
  "isValid": true/false,
  "reason": "간단한 설명 (1문장)"
}

JSON만 출력하세요:`;

      try {
        const aiResponse = await generateAIResponse(prompt, [
          { role: 'user', parts: [{ text: prompt }] }
        ]);

        // JSON 파싱
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error('Failed to parse validation response:', aiResponse);
          // 파싱 실패 시 안전하게 유효한 것으로 간주 (false negative 방지)
          return NextResponse.json({ isValid: true, reason: '입력을 처리하겠습니다.' });
        }

        const result = JSON.parse(jsonMatch[0]);
        return NextResponse.json(result);
      } catch (error) {
        console.error('Error validating input:', error);
        // 에러 시 안전하게 유효한 것으로 간주
        return NextResponse.json({ isValid: true, reason: '입력을 처리하겠습니다.' });
      }
    }

    // Priority 요약 메시지 생성 (신규 태그 기반)
    if (action === 'generate_priority_summary') {
      const { prosTexts, consTexts, additionalTexts, budgetText } = body;

      // 태그 기반 요약 생성 (신규)
      if (prosTexts || consTexts || additionalTexts) {
        try {
          const prompt = `사용자가 분유포트를 선택할 때 중요하게 생각하는 조건들을 간결한 리스트로 정리해주세요.

**선택한 장점** (포기할 수 없는 장점):
${prosTexts && prosTexts.length > 0 ? prosTexts.map((t: string) => `- ${t}`).join('\n') : '(없음)'}

**선택한 단점** (절대 타협할 수 없는 단점):
${consTexts && consTexts.length > 0 ? consTexts.map((t: string) => `- ${t}`).join('\n') : '(없음)'}

**추가 고려사항**:
${additionalTexts && additionalTexts.length > 0 ? additionalTexts.map((t: string) => `- ${t}`).join('\n') : '(없음)'}

**예산**: ${budgetText}

요구사항:
1. 인사말이나 서론 없이 바로 리스트만 출력
2. "**중요하게 생각하시는 점**"과 "**예산**" 섹션으로 구분
3. 각 항목은 최대한 짧고 간결하게 (한 줄)
4. 어려운 용어는 쉽게 풀어서 설명 (예: "정밀한 온도 설정" → "1도 단위로 온도 조절")
5. ~입니다, ~원하십니다 같은 딱딱한 문체 대신 간결한 표현 사용
6. 마크다운 리스트 형식 (-)만 사용
7. 이모지 사용 금지

좋은 예시:
**주요 구매 조건**
- 1도 단위로 온도 조절 가능
- 물 끓이는 소리가 조용함
- 스테인리스 소재로 안전함

**예산**
- 5~10만원

나쁜 예시 (이렇게 작성하지 마세요):
고객님께서 중요하게 생각하시는 점을 정리해드렸습니다!
- 1도 단위의 정밀한 온도 설정 기능은 필수입니다.
- 쿨링팬 작동이나 버튼 조작 시 발생하는 소음이 없는 제품을 원하십니다.`;

          const aiResponse = await generateAIResponse(prompt, [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ]);

          const summary = aiResponse.trim();
          return NextResponse.json({ summary });
        } catch (error) {
          console.error('LLM 요약 생성 실패:', error);
          // Fallback: 단순 리스트 생성
          let fallbackSummary = '**중요하게 생각하시는 점**\n';
          if (prosTexts && prosTexts.length > 0) {
            prosTexts.forEach((t: string) => fallbackSummary += `- ${t}\n`);
          }
          if (consTexts && consTexts.length > 0) {
            fallbackSummary += '\n**피하고 싶은 점**\n';
            consTexts.forEach((t: string) => fallbackSummary += `- ${t}\n`);
          }
          if (additionalTexts && additionalTexts.length > 0) {
            fallbackSummary += '\n**추가 고려사항**\n';
            additionalTexts.forEach((t: string) => fallbackSummary += `- ${t}\n`);
          }
          fallbackSummary += `\n**예산**\n- ${budgetText}`;
          return NextResponse.json({ summary: fallbackSummary });
        }
      }

      // 기존 prioritySettings 기반 요약 (호환성 유지)
      if (prioritySettings) {
        const summary = generatePrioritySummary(prioritySettings, phase0Context);
        return NextResponse.json({ summary });
      }
    }

    // 재추천 시 Priority Summary 업데이트 (재추천 바텀시트 전용)
    if (action === 'update_priority_summary') {
      const { previousSummary, userInputs, prioritySettings, budget } = body;

      try {
        // Priority 설정을 텍스트로 변환
        const priorityText = prioritySettings ? Object.entries(prioritySettings)
          .filter(([, level]) => level === 'high')
          .map(([key]) => {
            const names: Record<string, string> = {
              temperatureControl: '온도 조절/유지',
              hygiene: '위생/세척 편의성',
              material: '소재/안전성',
              usability: '사용 편의성',
              portability: '휴대성',
              additionalFeatures: '부가 기능'
            };
            return names[key] || key;
          })
          .join(', ') : '';

        // 예산을 텍스트로 변환
        const budgetMap: Record<string, string> = {
          '0-50000': '최대 5만원',
          '50000-100000': '최대 10만원',
          '100000-150000': '최대 15만원',
          '150000+': '15만원+'
        };
        const budgetText = budget ? budgetMap[budget] || budget : '';

        const prompt = `사용자가 재추천을 요청하면서 추가 입력을 제공했습니다.
기존 조건 요약을 바탕으로 **업데이트된 요약**을 생성해주세요.

**기존 조건 요약** (사용자가 처음 설정한 Priority):
${previousSummary}

**사용자의 추가 입력들** (재추천 요청 시 제공):
${userInputs && userInputs.length > 0 ? userInputs.map((input: string, i: number) => `${i + 1}. ${input}`).join('\n') : '(없음)'}

**현재 Priority 설정**: ${priorityText || '(없음)'}
**현재 예산**: ${budgetText || '(없음)'}

⚠️ **오타 수정 규칙** (매우 중요):
- 사용자 입력에 명백한 오타가 있으면 자동으로 수정하세요
- 수정된 단어를 Summary에 반영할 때는 올바른 표현만 사용

🎯 **업데이트 지침**:
1. **예산 변경 감지**: 추가 입력에서 예산 관련 언급이 있으면 "**예산**" 섹션을 업데이트하세요
   - 예: "5만원 아래로" → 예산을 "5만원 이하"로 변경
   - 예: "더 저렴하게" → 예산을 "5만원 이하"로 변경

2. **조건 추가 감지**: 새로운 기능/소재 요구가 있으면 "**중요하게 생각하시는 점**" 섹션에 추가
   - 예: "쿨링팬 있는 걸로" → "쿨링팬을 통한 빠른 냉각" 추가
   - 예: "스테인리스로" → "스테인리스 소재" 추가
   - 기존 항목과 중복되지 않게 추가

3. **배제 조건 감지**: 특정 소재/기능을 배제하는 요청은 **별도 항목**으로 명시
   - 예: "유리 배제" → "❌ 유리 소재 제외" 추가 (최우선 항목으로)
   - 예: "스테인리스 말고" → "❌ 스테인리스 소재 제외" 추가

4. **조건 강화 감지**: 기존 조건을 더 구체화하거나 강조하는 경우 해당 항목 업데이트
   - 예: "온도 조절이 더 정확한 걸로" → "1도 단위 정밀 온도 조절"로 강화

5. **조건 제거 감지**: 특정 조건이 "상관없어요", "필요없어요"라고 하면 해당 항목 제거
   - 예: "휴대성은 상관없어요" → 휴대성 관련 항목 제거

6. **조건 모순 감지 (CRITICAL)**: 새 입력이 기존 조건과 **정반대**인 경우:
   - 기존 조건에 취소선 적용: ~~기존 조건~~
   - 새 조건을 화살표로 연결: ~~기존 조건~~ → 새 조건
   - 예: "유리 재질이 아닌 안전한 소재 선호" + "유리 재질이였으면 좋겟어요"
     → "~~유리 재질이 아닌 안전한 소재 선호~~ → 유리 재질 선호"
   - 모순 감지 예시:
     • "X 아님/배제/제외" ↔ "X 선호/원함/좋겠어요"
     • "저렴하게/싸게" ↔ "프리미엄으로/비싸도"
     • "가벼운 것" ↔ "무거운 것"
     • "유리 소재" ↔ "유리 아닌 소재"
     • "스테인리스 제외" ↔ "스테인리스로"
   - ⚠️ 모순이 발견되면 **새 조건이 우선**하며, 기존 조건은 취소선 처리

7. **형식 유지**:
   - "**중요하게 생각하시는 점**"과 "**예산**" 섹션으로 구분
   - 마크다운 리스트 형식 (-) 사용
   - 간결하고 명확하게 (각 항목 한 줄)
   - 이모지 사용 금지 (배제 조건의 ❌ 제외)
   - 인사말이나 설명 없이 바로 리스트만 출력

**출력 예시**:
**중요하게 생각하시는 점**
- ~~유리 재질이 아닌 안전한 소재 선호~~ → 유리 재질 선호
- 1도 단위 정밀 온도 조절
- 쿨링팬을 통한 빠른 냉각
- 손세척 가능한 넓은 입구

**예산**
- 5만원 이하

**출력 예시 2 (배제 조건)**:
**중요하게 생각하시는 점**
- ❌ 스테인리스 소재 제외
- 빠른 가열 속도
- 쉬운 세척

**예산**
- 10~15만원

업데이트된 요약만 출력하세요 (설명 없이):`;

        const aiResponse = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        const updatedSummary = aiResponse.trim();
        return NextResponse.json({ summary: updatedSummary });
      } catch (error) {
        console.error('Summary 업데이트 실패:', error);
        // Fallback: 기존 Summary 유지하고 추가 입력만 append
        const fallback = `${previousSummary}\n\n**추가 요청**\n${userInputs.map((input: string) => `- ${input}`).join('\n')}`;
        return NextResponse.json({ summary: fallback });
      }
    }

    // 재추천 변경사항 설명 생성 (특징 중심)
    if (action === 'generate_change_explanation') {
      const { userInput, removedProducts, addedProducts, changeType, updatedSummary } = body;

      try {
        // 제품 특징 요약 함수
        const summarizeFeatures = (products: Array<{ title: string; price: number; coreValues: Record<string, number> }>) => {
          if (!products || products.length === 0) return '없음';

          return products.map((p) => {
            const features = [];
            const cv = p.coreValues || {};

            // 높은 점수 속성 추출 (8점 이상)
            if (cv.temperatureControl >= 8) features.push('정밀한 온도 조절');
            if (cv.hygiene >= 8) features.push('세척 편의성');
            if (cv.material >= 8) features.push('안전한 소재');
            if (cv.usability >= 8) features.push('사용 편의성');
            if (cv.portability >= 8) features.push('뛰어난 휴대성');
            if (cv.priceValue >= 8) features.push('가격 대비 가치');

            return `${p.title} (${features.join(', ') || '기본 기능'})`;
          }).join('\n');
        };

        const prompt = `사용자가 분유포트 재추천을 요청했습니다. 제품 변경사항을 **특징 중심**으로 자연스럽게 설명해주세요.

**사용자 요청**: ${userInput || '변경 요청'}

**업데이트된 조건 요약** (사용자의 현재 요구사항):
${updatedSummary || '(요약 없음)'}

**제거된 제품** (${removedProducts?.length || 0}개):
${summarizeFeatures(removedProducts)}

**추가된 제품** (${addedProducts?.length || 0}개):
${summarizeFeatures(addedProducts)}

**변경 유형**: ${changeType === 'all' ? '전체 변경 (3개 모두)' : changeType === 'partial' ? '일부 변경' : '변경 없음'}

🎯 **설명 작성 가이드**:

0. **업데이트된 조건 요약을 우선적으로 참고하세요** (매우 중요)
   - 요약에 "❌ 유리 소재 제외"가 있으면 → 유리를 **배제/제외**한 것으로 해석
   - 요약에 "유리 소재 선호"가 있으면 → 유리를 **선호**하는 것으로 해석
   - 요약과 사용자 요청이 다르면 **요약이 정답**입니다

1. **상품명을 직접 언급하지 마세요**
   - ❌ "벤하임 온도조절 분유포트를 해피베베 스마트포트로 변경했어요"
   - ✅ "유리 소재 제품을 깨지지 않는 스테인리스 제품으로 대체했어요"

2. **사용자 요청사항과 제품 특징을 연결하세요**
   - 요청: "유리 재질은 싫어" → "유리 소재를 배제하고 스테인리스 제품으로 가져왔어요"
   - 요청: "더 저렴하게" → "예산에 맞춘 가성비 좋은 제품들로 대체했어요"
   - 요청: "휴대성 좋은 걸로" → "휴대가 간편한 제품들로 변경했어요"

3. **변경 유형별 표현**:
   - 전체 변경: "요청하신 조건에 맞춰 **3개 제품 모두** 새롭게 선정했어요"
   - 일부 변경: "조건에 더 잘 맞는 제품들로 **일부 교체**했어요"
   - 변경 없음: "현재 추천 제품들이 이미 가장 적합하다고 판단되어 유지했어요"

4. **긍정적이고 친근한 톤**:
   - 이모지 1개 사용 (😊)
   - "~했어요", "~로 가져왔어요" 같은 부드러운 표현
   - 1-2문장으로 간결하게

5. **예시**:
   - "유리 소재 제품을 스테인리스 소재의 안전한 제품들로 대체했어요! 😊"
   - "더 저렴한 가격대의 가성비 좋은 제품들로 변경했어요! 😊"
   - "휴대성이 뛰어난 컴팩트한 제품들로 교체했어요! 😊"
   - "요청하신 조건에 맞춰 세척이 편리한 제품들로 가져왔어요! 😊"

**1-2문장으로 간결한 설명만 출력하세요 (JSON이나 마크다운 없이 텍스트만):**`;

        const aiResponse = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        const explanation = aiResponse.trim();
        return NextResponse.json({ explanation });
      } catch (error) {
        console.error('변경사항 설명 생성 실패:', error);
        // Fallback: 간단한 템플릿
        let fallback = '';
        if (changeType === 'all') {
          fallback = `요청하신 조건에 맞춰 추천 제품 3개 모두 새롭게 선정했어요! 😊`;
        } else if (changeType === 'partial' && addedProducts && addedProducts.length > 0) {
          fallback = `조건에 더 잘 맞는 제품들로 일부 교체했어요! 😊`;
        } else {
          fallback = `현재 추천 제품들이 이미 가장 적합하다고 판단되어 유지했어요. 다른 요구사항이 있으시면 말씀해주세요! 😊`;
        }
        return NextResponse.json({ explanation: fallback });
      }
    }

    // 자연어 예산 파싱
    if (action === 'parse_budget') {
      try {
        const { userInput } = body;

        const prompt = `사용자가 입력한 예산 정보를 분석하여 BudgetRange로 변환하세요.

사용자 입력: "${userInput}"

BudgetRange 옵션:
- "0-50000": 최대 5만원
- "50000-100000": 최대 10만원
- "100000-150000": 최대 15만원
- "150000+": 15만원+
- null: 예산 제한 없음 (사용자가 "상관없어요", "제한없어요" 등으로 표현한 경우)

예시:
- "7만원" → "50000-100000"
- "최대 5만원" → "0-50000"
- "10만원 정도" → "100000-150000"
- "5~8만원" → "50000-100000"
- "15만원+" → "150000+"
- "상관없어요" → null
- "제한 없어요" → null

JSON 형식으로 답변하세요:
{
  "budget": "0-50000" 또는 "50000-100000" 또는 "100000-150000" 또는 "150000+" 또는 null
}`;

        const aiResponse = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ budget: parsed.budget });
        }

        return NextResponse.json({ budget: null });
      } catch (error) {
        console.error('Failed to parse budget:', error);
        return NextResponse.json({ budget: null });
      }
    }

    // Priority 플로우: 전환 의도 분석
    if (action === 'analyze_transition_intent') {
      try {
        const { userMessage } = body;

        const prompt = `사용자가 다음 속성으로 넘어가고 싶은지 의도를 분석하세요.

사용자 메시지: "${userMessage}"

이 메시지가 "다음으로 넘어가겠다"는 긍정적 의사를 표현하는지 판단하세요.

예시:
- "네" / "예" / "넵" / "응" → YES
- "좋아요" / "그래요" / "오케이" → YES
- "넘어가요" / "다음으로" / "넘어갑시다" → YES
- "아니요" / "좀 더 얘기하고 싶어요" → NO
- "잘 모르겠어요" / "질문 있어요" → NO

JSON 형식으로 답변하세요:
{
  "shouldTransition": true 또는 false
}`;

        const aiResponse = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({ shouldTransition: parsed.shouldTransition || false });
        }

        return NextResponse.json({ shouldTransition: false });
      } catch (error) {
        console.error('Failed to analyze transition intent:', error);
        return NextResponse.json({ shouldTransition: false });
      }
    }

    // Priority 플로우: 속성별 자유 대화 모드
    if (action === 'generate_attribute_conversation' && attributeName) {
      try {
        const { currentTurn } = body;

        // 최대 5턴 제한 (강제 전환)
        if (currentTurn >= 5) {
          return NextResponse.json({
            message: `${attributeName}에 대해 충분히 파악했습니다! 다음 기준으로 넘어갈게요.`,
            shouldTransition: true,
            forceTransition: true, // 강제 전환 플래그
          });
        }

        const prompt = `당신은 분유포트 추천 전문가 AI입니다. 분유포트를 처음으로 구매하는 사용자의 **${attributeName}**에 대한 니즈를 파악하기 위해 대화하고 있습니다.

## 사용자의 초기 상황 (Phase 0 컨텍스트):
${phase0Context || '(정보 없음)'}

## ${attributeName}의 세부 사항:
${attributeDetails?.map((d: string, i: number) => `${i + 1}. ${d}`).join('\n') || ''}

## 지금까지의 대화 히스토리:
${conversationHistory || '(첫 대화)'}

## 현재 대화 턴: ${currentTurn}/5 (최대 5턴)

---

## 대화 구조 (최대 5턴, 3턴 권장):
- **턴 1-2**: 세부사항을 기초로 한 구체적 상황 파악 질문
- **턴 3 이상**: 사용자 답변에 공감 후 **반드시 전환 제안 포함**
- **턴 4-5**: 사용자가 더 말하고 싶어하는 경우만

## 응답 가이드:
- **톤**: 친근하고 공감하는 육아용품 구매자를 대상으로 하는 상담사 스타일
- **전제**: 사용자는 분유포트를 **아직 구매하지 않은** 초보자 (준비 중 또는 구매 고려 중)
- **질문 원칙** (매우 중요):

  ✅ **미래 상황/계획 질문** (분유포트 없이 대답 가능):
    - "새벽 수유가 많으실 것 같으세요?"
    - "주로 집에서 사용하실 계획이신가요, 아니면 외출 시에도 쓰실 건가요?"
    - "빠르게 준비하는 게 중요하실까요, 아니면 천천히 준비해도 괜찮으실까요?"
    - "밤에 아기가 깨면 빨리 분유를 타야 할 것 같으세요?"

  ✅ **현재 경험 질문** (분유포트 없이도 대답 가능):
    - "지금은 물을 끓인 후 식혀서 분유를 타시나요?"
    - "물을 식히는 데 시간이 오래 걸려서 불편하신 적 있으세요?"
    - "보온병이나 주전자를 사용해보신 적 있으신가요?"

  ✅ **일반 육아 상황 질문**:
    - "쌍둥이를 키우시나요, 아니면 아기가 한 명이신가요?"
    - "아기가 태어난 지 얼마나 되셨어요?" (준비 중이면 "출산 예정일이 언제세요?")

  ❌ **분유포트 사용 전제 질문 절대 금지**:
    - ❌ "지금 사용하는 분유포트는 어떤 기능이 있나요?"
    - ❌ "물 온도를 몇 도로 맞추고 계신가요?"
    - ❌ "지금 분유를 탈 때 물 온도가 잘 맞나요?"
    - ❌ "끓인 물을 식히는 데 시간이 얼마나 걸리시나요?" (분유포트 없이는 측정 안 함)
    - ❌ "보온 기능을 자주 쓰시나요?"

  ❌ **기술적 질문 금지**:
    - "몇 도의 물이 필요하세요?", "냉각 속도가 중요한가요?"

  ❌ **전문 용어 금지**:
    - "보온 성능", "열효율", "온도 편차", "용량 대비 효율"

  ❌ **복잡한 비교 금지**:
    - "A 기능과 B 기능 중 뭐가 더 나은가요?" (사용자가 둘 다 모를 수 있음)

  ⚠️ **기능 설명이 필요한 경우**:
    - 먼저 쉬운 예시로 설명 → 미래 상황/계획에 대해 질문
    - 예: "분유포트 중에는 물을 미리 맞춰두면 밤새 온도를 유지해주는 제품도 있어요. 새벽에 아기가 깨면 바로 쓸 수 있어서 편하죠. 새벽 수유가 자주 있으실 것 같으세요?"

- **설명 방식**: "예를 들어 [구체적 상황]할 때 [기능]이 도움이 돼요" 형식
- **길이**: 정확히 2문장 (턴 1-2) 또는 2-3문장 (턴 3+, 전환 제안 포함)
- **구조**: (공감/반응 + 쉬운 설명/예시) → 미래 상황/계획 질문 (턴 1-2) / 전환 제안 (턴 3+)
- **필수**: 항상 질문으로 끝나야 함 (? 로 종료)

## **절대 금지 사항**:
❌ "파악했습니다", "확인했습니다", "충분히 알게 되었습니다" 같은 내적 프로세스 표현
❌ "이 정보를 바탕으로", "분석 결과" 같은 AI 사고 과정 노출
❌ 전문 용어 (예: "냉각 속도", "열효율" 등) - 쉬운 표현 사용
❌ 턴 3 이상에서 전환 제안 없이 계속 질문만 하기

## 턴별 응답 방식:

### **턴 1-2** (정보 수집):
{
  "message": "[사용자 답변 공감] + [실용적 팁/예시]. [미래 상황 질문]?",
  "shouldTransition": false
}

**좋은 예시** (턴 1):
{
  "message": "온도 조절이 중요하시군요! 분유포트 중에는 원하는 온도로 미리 맞춰두면 밤새 유지해주는 제품들이 있어요. 새벽 수유가 자주 있으실 것 같으세요?",
  "shouldTransition": false
}

**나쁜 예시** (분유포트 사용 전제):
{
  "message": "온도 조절이 중요하시군요! 지금 물 온도를 몇 도로 맞추고 계신가요?",
  "shouldTransition": false
}
→ ❌ "지금 물 온도를 몇 도로 맞추고 계신가요?"는 분유포트 사용 중이라는 전제

### **턴 3 이상** (전환 제안 필수):
{
  "message": "[사용자 답변 공감] + [간단한 팁]. ${attributeName}에 대해서는 잘 알게 됐어요! 혹시 더 궁금한 점 있으시면 말씀해 주시고, 괜찮으시면 다음으로 넘어가도 될까요?",
  "shouldTransition": true
}

**좋은 예시** (턴 3):
{
  "message": "새벽 수유 시 빠른 준비가 정말 중요하시겠어요! 끓이는 시간이 짧은 제품이 딱 맞을 것 같아요. 온도 조절/유지 성능에 대해서는 잘 알게 됐어요! 혹시 더 궁금한 점 있으시면 말씀해 주시고, 괜찮으시면 다음으로 넘어가도 될까요?",
  "shouldTransition": true
}

**나쁜 예시** (내적 프로세스 노출):
{
  "message": "사용자님께서 빠른 기능을 중요하게 생각하시는 것을 확인했으니, 충분히 파악된 것 같습니다!",
  "shouldTransition": true
}
→ ❌ "확인했으니", "파악된 것 같습니다" 같은 내부 사고 표현 금지

## **핵심 규칙**:
1. 턴 1-2: shouldTransition = false
2. 턴 3+: shouldTransition = true (전환 제안 반드시 포함)
3. 턴 5: 자동 강제 전환
4. 내적 프로세스 절대 금지
5. 자연스럽고 공감적인 톤 유지
6. 쉬운 표현 사용

**JSON 형식으로만 응답하세요.**`;

        const aiResponse = await generateAIResponse(prompt, [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ]);

        // JSON 파싱
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return NextResponse.json({
            message: parsed.message || aiResponse.trim(),
            shouldTransition: parsed.shouldTransition || false,
            transitionMessage: parsed.transitionMessage || null,
          });
        }

        return NextResponse.json({
          message: aiResponse.trim(),
          shouldTransition: false,
          transitionMessage: null,
        });
      } catch (error) {
        console.error('Failed to generate attribute conversation:', error);
        return NextResponse.json(
          { error: 'Failed to generate conversation response' },
          { status: 500 }
        );
      }
    }

    // ==========================================
    // DEPRECATED: 기존 플로우 액션들 (Priority 도입으로 사용 안 함)
    // - reassess_importance: Follow-up 답변 기반 중요도 재평가
    // - generate_followup: Phase 0 맥락 기반 follow-up 질문 생성
    //
    // Priority 플로우에서는 'generate_attribute_conversation' 사용
    // ==========================================

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // ==========================================
    // DEPRECATED: 기존 Chat1 플로우 (Priority 도입으로 사용 안 함)
    // Priority 페이지에서 중요도를 먼저 설정하므로,
    // 이 분기는 더 이상 실행되지 않습니다.
    //
    // Phase 'chat1' 요청은 더 이상 지원되지 않음
    // Priority 플로우에서는 action 파라미터가 필수
    // ==========================================
    if (phase === 'chat1') {
      return NextResponse.json(
        { error: 'Chat1 phase requests must include a valid action parameter. Use action=generate_attribute_conversation for Priority flow.' },
        { status: 400 }
      );
    }

    // Chat2 단계: 추가 컨텍스트 수집
    if (phase === 'chat2') {
      // Gemini API용 메시지 형식으로 변환
      const conversationHistory = messages.map((msg: Message) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

      const systemPrompt = ASSISTANT_CHAT2_PROMPT;

      // AI 응답 생성
      const aiResponse = await generateAIResponse(
        systemPrompt,
        conversationHistory
      );

      // Chat 2에서 진행률 계산 (간단한 휴리스틱)
      const chat2Messages = messages.filter((m: Message) => m.phase === 'chat2');
      const userMessages = chat2Messages.filter((m: Message) => m.role === 'user');
      const totalLength = userMessages.reduce(
        (sum: number, m: Message) => sum + m.content.length,
        0
      );

      // 간단한 계산: 메시지가 많고 길수록 정확도 증가
      const accuracy = Math.min(100, userMessages.length * 20 + totalLength / 10);

      return NextResponse.json({
        message: aiResponse,
        accuracy,
      });
    }

    return NextResponse.json(
      { error: 'Invalid phase' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate response' },
      { status: 500 }
    );
  }
}
