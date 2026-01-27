/**
 * Knowledge Agent - Product Analysis API
 *
 * Top3 상품에 대한 상세 분석 생성:
 * - selectedConditionsEvaluation: 조건 충족도 평가 (밸런스, 단점)
 * - contextMatch: 사용자 상황과의 적합성
 * - additionalPros/cons: 추가 장단점
 *
 * recommend-v2의 product-analysis와 유사하지만 knowledge-agent 컨텍스트에 맞게 조정
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// 제품 정보 타입
interface ProductInfo {
  pcode: string;
  name: string;
  brand?: string;
  price?: number;
  specSummary?: string;
  recommendReason?: string;
  highlights?: string[];
  concerns?: string[];
  reviews?: Array<{
    content: string;
    rating: number;
  }>;
}

// 사용자 컨텍스트 타입
interface UserContext {
  collectedInfo?: Record<string, string>;  // 하드필터 질문-응답 (questionId -> 답변)
  balanceSelections?: Array<{
    questionId: string;
    selectedLabel: string;
    selectedKey: string;
  }>;
  negativeSelections?: string[];  // 피할 단점 레이블
  conversationSummary?: string;   // 대화 요약
  questionTodos?: Array<{         // 질문 목록 (질문 텍스트 복원용)
    id: string;
    question: string;
  }>;
}

// 조건 충족도 평가 타입
interface ConditionEvaluation {
  condition: string;
  conditionType: 'hardFilter' | 'balance' | 'negative';
  status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';
  evidence: string;          // "주요 포인트"용 상세 설명 (2문장)
  shortReason?: string;      // "왜 추천했나요?"용 심플 설명 (1문장)
  questionId?: string;
}

// 상황 적합성 타입
interface ContextMatch {
  explanation: string;
  matchedPoints: string[];
}

// 제품 분석 결과 타입
interface ProductAnalysis {
  pcode: string;
  selectedConditionsEvaluation: ConditionEvaluation[];
  contextMatch?: ContextMatch;
  additionalPros: Array<{ text: string; citations: number[] }>;
  cons: Array<{ text: string; citations: number[] }>;
}

// 🆕 FilterTag 타입 (final-recommend에서 전달)
interface FilterTag {
  id: string;
  label: string;
  category: string;
  sourceType?: 'balance' | 'negative' | 'collected' | 'free_input';
  originalCondition?: string;
}

// 🆕 사전 평가 결과 (final-recommend의 tagScores)
interface PreEvaluation {
  score: 'full' | 'partial' | null;
  evidence?: string;
  conditionType?: 'hardFilter' | 'balance' | 'negative';
}

// 요청 타입
interface ProductAnalysisRequest {
  categoryKey: string;
  categoryName: string;
  products: ProductInfo[];
  userContext: UserContext;
  // 🆕 final-recommend에서 전달된 사전 평가 결과
  preEvaluations?: Record<string, Record<string, PreEvaluation>>;  // pcode -> tagId -> evaluation
  filterTags?: FilterTag[];
}

// 응답 타입
interface ProductAnalysisResponse {
  success: boolean;
  data?: {
    analyses: ProductAnalysis[];
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

/**
 * 단일 제품 분석 생성
 * @param preEvaluations - final-recommend에서 전달된 사전 평가 결과 (tagScores)
 * @param filterTags - final-recommend에서 생성된 필터 태그
 */
async function analyzeProduct(
  product: ProductInfo,
  categoryName: string,
  userContext: UserContext,
  preEvaluations?: Record<string, PreEvaluation>,
  filterTags?: FilterTag[]
): Promise<ProductAnalysis> {
  if (!ai) {
    return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
  }

  // 🆕 preEvaluations가 있고 대부분의 태그에 대한 평가가 있으면 바로 사용 (PLP-PDP 일관성 보장)
  if (preEvaluations && filterTags && filterTags.length > 0) {
    const evaluatedCount = filterTags.filter(tag => preEvaluations[tag.id]?.score).length;
    const coverageRatio = evaluatedCount / filterTags.length;

    // 50% 이상 평가가 있으면 fallback 사용 (PLP와 동일한 결과 보장)
    if (coverageRatio >= 0.5) {
      console.log(`[product-analysis] Using preEvaluations directly for ${product.pcode} (${evaluatedCount}/${filterTags.length} tags, ${Math.round(coverageRatio * 100)}%)`);
      return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
    }
  }

  // preEvaluations에서 evidence 추출 (LLM 프롬프트에 참고 정보로 제공)
  const preEvalHints: string[] = [];
  if (preEvaluations && filterTags) {
    filterTags.forEach(tag => {
      const preEval = preEvaluations[tag.id];
      if (preEval && preEval.score && preEval.evidence) {
        const statusText = tag.sourceType === 'negative'
          ? (preEval.score === 'full' ? '회피됨' : preEval.score === 'partial' ? '부분회피' : '회피안됨')
          : (preEval.score === 'full' ? '충족' : preEval.score === 'partial' ? '부분충족' : '불충족');
        preEvalHints.push(`- "${tag.label}": ${statusText} - ${preEval.evidence}`);
      }
    });
    if (preEvalHints.length > 0) {
      console.log(`[product-analysis] Using ${preEvalHints.length} preEvaluation hints for ${product.pcode}`);
    }
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.5,
      maxOutputTokens: 4096,
    },
  });

  // 리뷰 정보 포맷팅
  const reviewStr = product.reviews && product.reviews.length > 0
    ? product.reviews.slice(0, 10).map((r, i) =>
        `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 100)}${r.content.length > 400 ? '...' : ''}"`
      ).join('\n')
    : '리뷰 없음';

  // 사용자 선택 조건들 준비 (questionId -> 질문 텍스트 매핑)
  const questionIdToText: Record<string, string> = {};
  if (userContext.questionTodos) {
    userContext.questionTodos.forEach(q => {
      questionIdToText[q.id] = q.question;
    });
  }

  const hardFilterConditions: Array<{ questionId: string; questionText: string; label: string }> = [];
  if (userContext.collectedInfo) {
    Object.entries(userContext.collectedInfo).forEach(([questionId, answer]) => {
      // 내부 키(__로 시작)는 제외
      if (questionId.startsWith('__')) return;
      if (answer && answer !== '상관없어요' && answer !== 'any') {
        // questionTodos에서 질문 텍스트 복원, 없으면 questionId 그대로 사용
        const questionText = questionIdToText[questionId] || questionId;
        hardFilterConditions.push({ questionId, questionText, label: answer });
      }
    });
  }

  // balanceSelections에서 questionText 포함된 객체로 변환
  const balanceConditions = (userContext.balanceSelections || []).map(b => ({
    questionId: b.questionId,
    questionText: (b as any).questionText || b.selectedLabel, // questionText가 있으면 사용, 없으면 selectedLabel
    selectedLabel: b.selectedLabel,
  }));
  const negativeConditions = userContext.negativeSelections || [];

  const hasUserConditions = hardFilterConditions.length > 0 || balanceConditions.length > 0 || negativeConditions.length > 0;
  const hasConversation = !!userContext.conversationSummary;

  // 조건 평가 섹션 (질문 텍스트 + 답변 함께 표시)
  const conditionSection = hasUserConditions ? `
## 사용자 선택 조건
${hardFilterConditions.length > 0 ? `### 필수 조건 (맞춤 질문 응답)
${hardFilterConditions.map((c, i) => `${i + 1}. **${c.questionText}** → "${c.label}"`).join('\n')}` : ''}
${balanceConditions.length > 0 ? `### 선호 속성 (사용자 선호)
${balanceConditions.map((c, i) => `${i + 1}. **${c.questionText}** → "${c.selectedLabel}"`).join('\n')}` : ''}
${negativeConditions.length > 0 ? `### 피할 단점
${negativeConditions.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}
` : '';

  const conditionFormat = hasUserConditions ? `
  "selectedConditionsEvaluation": [
    ${hardFilterConditions.map(c => `{
      "condition": "${c.questionText}: ${c.label}",
      "conditionType": "hardFilter",
      "questionId": "${c.questionId}",
      "status": "충족 또는 불충족",
      "shortReason": "심플한 1문장 (왜 추천했나요?용)",
      "evidence": "자세한 2문장 (주요 포인트용)"
    }`).join(',\n    ')}${hardFilterConditions.length > 0 && balanceConditions.length > 0 ? ',' : ''}
    ${balanceConditions.map(c => `{
      "condition": "${c.questionText}: ${c.selectedLabel}",
      "conditionType": "balance",
      "questionId": "${c.questionId}",
      "status": "충족/부분충족/불충족 중 하나",
      "shortReason": "심플한 1문장 (왜 추천했나요?용)",
      "evidence": "자세한 2문장 (주요 포인트용)"
    }`).join(',\n    ')}${(hardFilterConditions.length > 0 || balanceConditions.length > 0) && negativeConditions.length > 0 ? ',' : ''}
    ${negativeConditions.map(c => `{
      "condition": "${c}",
      "conditionType": "negative",
      "status": "회피됨/부분회피/회피안됨 중 하나",
      "shortReason": "심플한 1문장 (왜 추천했나요?용)",
      "evidence": "자세한 2문장 (주요 포인트용)"
    }`).join(',\n    ')}
  ],` : '';

  // 상황 적합성 섹션
  const userConditions = userContext.collectedInfo
    ? Object.entries(userContext.collectedInfo)
        .filter(([key]) => !key.startsWith('__'))
        .map(([q, a]) => `- ${q}: ${a}`)
        .join('\n')
    : '';

  const userPriorities = userContext.balanceSelections && userContext.balanceSelections.length > 0
    ? userContext.balanceSelections.map(b => `- ${b.selectedLabel}`).join('\n')
    : '';

  const contextSection = hasConversation ? `
## 사용자 조건 및 우선순위
${userConditions ? `### 질문 응답\n${userConditions}\n` : ''}
${userPriorities ? `### 우선순위\n${userPriorities}\n` : ''}
${userContext.conversationSummary ? `### 대화 요약\n"${userContext.conversationSummary}"\n` : ''}
위 조건들을 기반으로 이 제품이 사용자에게 **얼마나 적합한지** contextMatch.explanation에 작성해주세요.
` : '';

  const contextFormat = hasConversation ? `
  "contextMatch": {
    "explanation": "사용자 맞춤형 추천 이유 (2-3문장, 아래 규칙 참고)",
    "matchedPoints": ["매칭 포인트1", "매칭 포인트2"]
  },` : '';

  const prompt = `당신은 ${categoryName} 전문 큐레이터입니다.
사용자가 선택한 조건을 이 제품이 얼마나 충족하는지 분석해주세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 제품 정보
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- 제품명: ${product.name}
- 브랜드: ${product.brand || '미상'}
- 가격: ${product.price ? `${product.price.toLocaleString()}원` : '미정'}
- 스펙: ${product.specSummary || '정보 없음'}
- 추천 이유: ${product.recommendReason || '정보 없음'}

## 리뷰
${reviewStr}
${conditionSection}${contextSection}${preEvalHints.length > 0 ? `
## 참고: 사전 분석 결과 (이 정보를 우선 활용하세요)
${preEvalHints.join('\n')}
` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 응답 필드 작성 규칙 (매우 중요!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

각 조건마다 **shortReason**과 **evidence** 두 개의 필드를 모두 생성해야 합니다.

### 1️⃣ shortReason - "왜 추천했나요?" 섹션용

**용도**: PDP 상단의 "왜 추천했나요?" 리스트 항목으로 표시
**형식**: 심플한 1문장 (15-25자 내외)
**톤**: 핵심만 간결하게

#### ✅ Good Examples
- "IH 압력 방식으로 빠르고 균일하게 가열돼요."
- "에코 스테인리스 내솥을 사용해 내구성이 뛰어나요."
- "10인용 대용량으로 대가족도 충분히 사용할 수 있어요."
- "쿠쿠전자의 프리미엄 라인으로 품질이 검증됐어요."
- "저소음 설계로 조용한 사용 환경을 제공해요."

#### ❌ Bad Examples
- "IH 압력밥솥 방식을 선호하시는군요. 이 제품은 IH 압력밥솥입니다." ← 사용자 조건 반복
- "좋은 제품입니다." ← 구체성 없음

### 2️⃣ evidence - "주요 포인트" 섹션용

**용도**: PDP의 "주요 포인트" Q/A 섹션에서 상세 설명으로 표시
**형식**: 자세한 2문장 (첫 문장: 핵심 특성, 두 번째 문장: 구체적 근거/리뷰)
**톤**: 설득력 있고 전문적

#### ✅ Good Examples
- "IH 압력 방식으로 빠르고 균일하게 가열돼요. 리뷰에서도 '밥이 고르게 익어 맛있다'는 평가가 많습니다."
- "에코 스테인리스 내솥을 사용해 내구성이 뛰어나요. 코팅이 벗겨질 걱정 없이 오래 사용할 수 있습니다."
- "10인용 대용량으로 대가족도 충분히 사용할 수 있어요. 실제 리뷰에서 '한번에 많이 지어도 문제없다'는 의견이 많습니다."
- "쿠쿠전자의 프리미엄 라인으로 품질이 검증됐어요. A/S도 전국 서비스센터에서 신속하게 받을 수 있습니다."

#### ❌ Bad Examples
- "IH 압력밥솥입니다." ← 1문장만, 근거 없음
- "좋은 제품입니다. 추천합니다." ← 구체적 근거 없음

### 공통 규칙
1. **제품 관점**으로 작성 - "이 제품은 ~해요" 형식
2. **이점 중심** - 스펙만 나열하지 말고 사용자가 얻는 이점 설명
3. **자연스러운 톤** - 전문적이면서도 친근하게
4. **사용자 조건 반복 금지** - "~하시는군요", "~를 원하시는군요" 사용 금지
5. 근거가 없으면 절대 추측하지 말고, "확인 필요" 문장 사용

### 근거 부족 시
- status: "부분충족" 또는 "불충족"
- shortReason: "상세 스펙에서 확인이 어려워요."
- evidence: "스펙이나 리뷰에서 관련 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## contextMatch.explanation 작성 규칙 (PDP 상단 표시)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

이 필드는 PDP 모달 상단의 "왜 추천했나요?" 섹션 **최상단에 표시**되는 핵심 추천 이유입니다.
사용자의 조건/상황과 제품 특성을 **명확하게 연결**해주세요.

### 작성 원칙
1. **2-3문장**으로 작성 (50-120자)
2. 사용자가 답변한 조건/우선순위를 **구체적으로 언급**
3. "~하신다고 하셨는데", "~를 중요하게 생각하시는데" 등으로 자연스럽게 시작
4. 제품이 해당 조건을 어떻게 충족하는지 **근거와 함께** 설명
5. 리뷰 인용 시 "리뷰에서도 ~라는 평가가 많아요" 형식 사용
6. **개별 조건을 반복하지 말고**, 전체적인 추천 이유를 종합적으로 설명

### ✅ Good Examples
- "조용한 제품을 원하신다고 하셨는데, 이 제품은 수면풍 모드가 있어 밤에도 조용하게 사용할 수 있어요. 실제 리뷰에서도 소음이 거의 없다는 평가가 많습니다."
- "IH 압력 방식과 스테인리스 내솥을 선호하신다고 하셨는데, 이 제품은 두 조건을 모두 충족하며 리뷰에서도 밥맛이 우수하다는 평가가 많아요."
- "대용량과 합리적인 가격을 중요하게 생각하신다고 하셨는데, 이 제품은 10인용 대용량이면서 24만원대로 가성비가 뛰어나요."

### ❌ Bad Examples (피할 것)
- "이 제품은 좋은 제품입니다." (사용자 조건 언급 없음)
- "실제 사용자들이 좋다고 평가한 제품입니다." (구체성 없음)
- "리뷰에 따르면..." (금지 패턴)
- "말씀하신 조건들을 종합적으로 고려해 선정한 제품이에요." (너무 일반적)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 응답 JSON 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{${conditionFormat}${contextFormat}
  "additionalPros": [
    { "text": "추가 장점 1", "citations": [] },
    { "text": "추가 장점 2", "citations": [] }
  ],
  "cons": [
    { "text": "주의점 1", "citations": [] },
    { "text": "주의점 2", "citations": [] }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 주의사항
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- JSON만 응답
- status 값은 정확히 지정된 값만 사용
- evidence에 이모티콘, 볼드(**) 사용 금지
- 추측성 표현 금지
- "사용자는 ~를 선택했습니다" 같은 기계적 표현 금지`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // JSON 추출
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[product-analysis] No JSON found in response');
      return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 🔧 LLM 장단점이 비어있으면 highlights/concerns 사용
    const additionalPros = (parsed.additionalPros && parsed.additionalPros.length > 0)
      ? parsed.additionalPros
      : (product.highlights || []).map((text: string) => ({ text, citations: [] }));

    const cons = (parsed.cons && parsed.cons.length > 0)
      ? parsed.cons
      : (product.concerns || []).map((text: string) => ({ text, citations: [] }));

    return {
      pcode: product.pcode,
      selectedConditionsEvaluation: parsed.selectedConditionsEvaluation || [],
      contextMatch: parsed.contextMatch,
      additionalPros,
      cons,
    };
  } catch (error) {
    console.error(`[product-analysis] Failed to analyze ${product.pcode}:`, error);
    return generateFallbackAnalysis(product, userContext, preEvaluations, filterTags);
  }
}

/**
 * Fallback 분석 생성 (preEvaluations 우선 사용)
 */
function generateFallbackAnalysis(
  product: ProductInfo,
  userContext: UserContext,
  preEvaluations?: Record<string, PreEvaluation>,
  filterTags?: FilterTag[]
): ProductAnalysis {
  const selectedConditionsEvaluation: ConditionEvaluation[] = [];

  // 🆕 preEvaluations가 있으면 우선 사용
  if (preEvaluations && filterTags && filterTags.length > 0) {
    filterTags.forEach(tag => {
      const preEval = preEvaluations[tag.id];
      if (preEval && preEval.score) {
        const conditionType = tag.sourceType === 'balance' ? 'balance' :
                              tag.sourceType === 'negative' ? 'negative' : 'hardFilter';

        let status: ConditionEvaluation['status'];
        if (conditionType === 'negative') {
          status = preEval.score === 'full' ? '회피됨' :
                   preEval.score === 'partial' ? '부분회피' : '회피안됨';
        } else {
          status = preEval.score === 'full' ? '충족' :
                   preEval.score === 'partial' ? '부분충족' : '불충족';
        }

        const fullEvidence = preEval.evidence || '상세 스펙에서 해당 정보를 확인하기 어려워요.';
        // 첫 문장 추출 (shortReason용)
        const firstSentenceMatch = fullEvidence.match(/^[^.!?]+[.!?]/);
        const shortReason = firstSentenceMatch ? firstSentenceMatch[0] : fullEvidence;

        selectedConditionsEvaluation.push({
          condition: tag.label,  // PLP 태그와 동일한 label 사용 (일관성)
          conditionType,
          status,
          evidence: fullEvidence,
          shortReason: shortReason,
        });
      }
    });

    // preEvaluations로 처리했으면 여기서 리턴
    if (selectedConditionsEvaluation.length > 0) {
      const additionalPros = (product.highlights || []).map(text => ({ text, citations: [] }));
      const cons = (product.concerns || []).map(text => ({ text, citations: [] }));

      // contextMatch.explanation 생성 (fallback)
      let contextExplanation = '말씀하신 조건들을 종합적으로 고려해 선정한 제품이에요.';

      // 사용자 조건에서 주요 조건 추출 시도
      const mainConditions: string[] = [];
      if (userContext.collectedInfo) {
        Object.values(userContext.collectedInfo)
          .filter((val) => val && val !== '상관없어요' && typeof val === 'string')
          .slice(0, 2)
          .forEach((val) => mainConditions.push(val as string));
      }
      if (userContext.balanceSelections && userContext.balanceSelections.length > 0) {
        mainConditions.push(userContext.balanceSelections[0].selectedLabel);
      }

      if (mainConditions.length > 0) {
        const condStr = mainConditions.slice(0, 2).join(', ');
        contextExplanation = `${condStr} 등 말씀하신 조건들을 고려해 선정한 제품이에요. 상세 스펙과 리뷰를 확인해보시면 더 많은 정보를 얻으실 수 있어요.`;
      }

      return {
        pcode: product.pcode,
        selectedConditionsEvaluation,
        contextMatch: userContext.conversationSummary || (userContext.collectedInfo && Object.keys(userContext.collectedInfo).length > 0) ? {
          explanation: contextExplanation,
          matchedPoints: [],
        } : undefined,
        additionalPros,
        cons,
      };
    }
  }

  // questionId -> 질문 텍스트 매핑
  const questionIdToText: Record<string, string> = {};
  if (userContext.questionTodos) {
    userContext.questionTodos.forEach(q => {
      questionIdToText[q.id] = q.question;
    });
  }

  // 하드필터 조건
  if (userContext.collectedInfo) {
    Object.entries(userContext.collectedInfo).forEach(([questionId, answer]) => {
      // 내부 키(__로 시작)는 제외
      if (questionId.startsWith('__')) return;
      if (answer && answer !== '상관없어요' && answer !== 'any') {
        const questionText = questionIdToText[questionId] || questionId;
        selectedConditionsEvaluation.push({
          condition: `${questionText}: ${answer}`,
          conditionType: 'hardFilter',
          questionId: questionId,
          status: '부분충족',
          shortReason: '상세 스펙에서 확인이 어려워요.',
          evidence: '상세 스펙에서 해당 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요.',
        });
      }
    });
  }

  // 밸런스 선택 (선호 속성)
  userContext.balanceSelections?.forEach(b => {
    const questionText = (b as any).questionText || b.selectedLabel;
    selectedConditionsEvaluation.push({
      condition: `${questionText}: ${b.selectedLabel}`,
      conditionType: 'balance',
      questionId: b.questionId,
      status: '부분충족',
      shortReason: '상세 스펙에서 확인이 어려워요.',
      evidence: '상세 스펙에서 해당 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요.',
    });
  });

  // 피할 단점
  userContext.negativeSelections?.forEach(neg => {
    selectedConditionsEvaluation.push({
      condition: neg,
      conditionType: 'negative',
      status: '부분회피',
      shortReason: '상세 스펙에서 확인이 어려워요.',
      evidence: '상세 스펙에서 해당 정보를 확인하기 어려워요. 판매처에서 직접 확인해보세요.',
    });
  });

  // 기존 highlights/concerns 활용
  const additionalPros = (product.highlights || []).map(text => ({
    text,
    citations: [],
  }));

  const cons = (product.concerns || []).map(text => ({
    text,
    citations: [],
  }));

  // contextMatch.explanation 생성 (fallback)
  let contextExplanation = '말씀하신 조건들을 종합적으로 고려해 선정한 제품이에요.';

  // 사용자 조건에서 주요 조건 추출 시도
  const mainConditions: string[] = [];
  if (userContext.collectedInfo) {
    Object.values(userContext.collectedInfo)
      .filter((val) => val && val !== '상관없어요' && typeof val === 'string')
      .slice(0, 2)
      .forEach((val) => mainConditions.push(val as string));
  }
  if (userContext.balanceSelections && userContext.balanceSelections.length > 0) {
    mainConditions.push(userContext.balanceSelections[0].selectedLabel);
  }

  if (mainConditions.length > 0) {
    const condStr = mainConditions.slice(0, 2).join(', ');
    contextExplanation = `${condStr} 등 말씀하신 조건들을 고려해 선정한 제품이에요. 상세 스펙과 리뷰를 확인해보시면 더 많은 정보를 얻으실 수 있어요.`;
  }

  return {
    pcode: product.pcode,
    selectedConditionsEvaluation,
    contextMatch: userContext.conversationSummary || (userContext.collectedInfo && Object.keys(userContext.collectedInfo).length > 0) ? {
      explanation: contextExplanation,
      matchedPoints: [],
    } : undefined,
    additionalPros,
    cons,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse<ProductAnalysisResponse>> {
  try {
    const body: ProductAnalysisRequest = await request.json();
    const { categoryKey, categoryName, products, userContext, preEvaluations, filterTags } = body;

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    const hasPreEvaluations = preEvaluations && Object.keys(preEvaluations).length > 0;
    console.log(`[knowledge-agent/product-analysis] Analyzing ${products.length} products for ${categoryKey}${hasPreEvaluations ? ' (with preEvaluations)' : ''}`);

    // 병렬로 분석 (preEvaluations 전달) - Top 5 지원
    const ANALYSIS_LIMIT = 5;  // 기존 3 → 5
    const analysisPromises = products.slice(0, ANALYSIS_LIMIT).map(product => {
      const productPreEval = preEvaluations?.[product.pcode];
      return analyzeProduct(product, categoryName || categoryKey, userContext, productPreEval, filterTags);
    });

    const analyses = await Promise.all(analysisPromises);
    const generated_by = ai ? 'llm' : 'fallback';

    console.log(`[knowledge-agent/product-analysis] Complete: ${analyses.length} analyses (${generated_by})`);

    return NextResponse.json({
      success: true,
      data: {
        analyses,
        generated_by,
      },
    });
  } catch (error) {
    console.error('[knowledge-agent/product-analysis] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to analyze products' },
      { status: 500 }
    );
  }
}
