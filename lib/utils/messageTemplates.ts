import { CORE_ATTRIBUTES } from '@/data/attributes';

/**
 * 인트로 메시지 생성
 */
export function generateIntroMessage(): string {
  return '안녕하세요! 분유포트 구매 도우미에요.\n제가 딱 맞는 고객님께 상품을 찾아드릴게요. 구매시 고려해야 할 중요한 기준들을 여쭤보는 것으로 시작할게요!';
}

/**
 * Phase 0: 워밍업 질문 (자유 맥락 수집)
 */
export function generateWarmupQuestion(): string {
  return '먼저, 분유포트 구매와 관련된 사용자님의 상황을 자유롭게 이야기해주세요! 어떤 것이든 좋아요. (고려 예산, 직장 여부, 쌍둥이, 중요하게 생각하는 기준 등)';
}

/**
 * 속성별 질문 메시지 생성 (고정된 템플릿)
 * 메시지를 여러 버블로 나누기 위해 배열로 반환
 * 세부 사항은 별도 필드로 반환하여 토글 형식으로 표시
 */
export function generateAttributeQuestion(attributeIndex: number): Array<{
  text: string;
  details?: string[];
  isImportanceQuestion?: boolean;
}> {
  const attribute = CORE_ATTRIBUTES[attributeIndex];

  // 인트로 설정 (첫 번째일 때만 특별, 나머지는 conversationalIntro 사용)
  let intro: string;
  if (attributeIndex === 0) {
    intro = `첫 번째는 **'${attribute.name}'**이에요.\n새벽 수유할 때 가장 중요한 기능이죠.`;
  } else {
    intro = attribute.conversationalIntro || `다음은 **'${attribute.name}'**이에요.`;
  }

  // 중요도 옵션 설명
  const examplesText = attribute.importanceExamples
    ? `\n\n**중요함**: ${attribute.importanceExamples.important}\n**보통**: ${attribute.importanceExamples.normal}\n**중요하지 않음**: ${attribute.importanceExamples.notImportant}`
    : '';

  // 두 번째 버블: 질문 (하늘색 배경)
  const questionMessage = `**'${attribute.name}'**이 얼마나 중요하신가요?${examplesText}`;

  // 2개의 분리된 메시지로 반환 (첫 번째는 인트로 + 토글 가능한 디테일, 두 번째는 질문)
  return [
    { text: intro, details: attribute.details },
    { text: questionMessage, isImportanceQuestion: true },
  ];
}

/**
 * 중요도 선택에 대한 피드백 메시지 생성
 */
export function generateImportanceFeedback(
  attributeName: string,
  importance: '중요함' | '보통' | '중요하지 않음'
): string {
  // 버튼 클릭이든 자연어든 동일하게 확인 메시지 스타일로 처리
  return `'${attributeName}'을(를) '${importance}'으로 기록`;
}

/**
 * Chat2 전환 메시지 생성
 */
export function generateChat2TransitionMessage(): string {
  return '말씀 잘 들었어요! 😊\n혹시 더 고려할 점이 있으신가요?\n편하게 말씀해주세요.';
}

/**
 * Chat2 추천 확인 메시지 생성
 */
export function generateChat2ReadyMessage(): string {
  return '준비 완료!\n딱 맞는 제품 3개 골라봤어요. 추천 받기 버튼을 눌러주세요!';
}

/**
 * "매우 중요" 선택 시 follow-up 질문 생성 (기본 템플릿)
 */
export function generateVeryImportantFollowUp(
  attributeName: string
): string {
  // 기본 템플릿 - Phase 0 맥락 기반 질문은 AI가 생성
  return `${attributeName}이(가) 많이 중요하시군요!\n구체적으로 어떤 상황에서 특히 중요하신가요?`;
}

/**
 * Phase 0 맥락을 기반으로 속성별 맞춤 follow-up 질문 생성 프롬프트
 * AI가 자연스러운 질문을 생성하도록 유도
 */
export function createFollowUpPrompt(
  attributeName: string,
  phase0Context: string,
  importance?: string
): string {
  const importanceText = importance === '중요함'
    ? '매우 중요하다고'
    : importance === '보통'
    ? '보통이라고'
    : '중요하지 않다고';

  return `사용자가 이전에 다음과 같이 말했습니다:
"${phase0Context}"

이제 사용자가 "${attributeName}" 속성을 "${importanceText}" 선택했습니다.
이 속성에 대해 좀 더 구체적으로 물어보는 짧고 친근한 질문(1-2문장)을 생성해주세요.

**Phase 0 맥락 사용 지침:**
- Phase 0 맥락과 현재 속성이 **명확히 연관**될 때만 자연스럽게 언급
- 연관이 약하거나 억지스러우면 맥락을 언급하지 말고 일반적인 질문만
- 매번 반복하지 말고 필요할 때만 사용

중요도에 따른 톤 가이드:
- "매우 중요": 적극적으로 상세한 정보 요청 (예: "구체적으로 어떤 상황에서 불편하셨나요?")
- "보통": 부담 없이 가볍게 물어보기 (예: "혹시 특별히 고려하시는 부분이 있으신가요?")
- "중요하지 않음": 매우 가볍게 확인 (예: "참고로, 이 부분은 어떤 점이 덜 중요하신가요?")

예시:
- Phase 0: "밤중 수유가 힘들어요" + 속성: "온도 조절/유지력" + 중요도: "중요함"
  → "밤중 수유 말씀하셨으니 온도 유지가 정말 중요하시겠어요! 혹시 구체적으로 어떤 상황에서 불편하셨나요?" (연관 있음, 언급)

- Phase 0: "밤중 수유가 힘들어요" + 속성: "위생/세척 편의성" + 중요도: "보통"
  → "세척이 중요하시군요! 혹시 특별히 원하시는 부분이 있으신가요?" (연관 약함, 언급 안 함)

- Phase 0: "외출이 많아요" + 속성: "휴대성" + 중요도: "중요함"
  → "외출 많으시다고 하셨으니 휴대성이 정말 중요하시겠네요! 주로 어떤 상황에서 사용하실 예정인가요?" (연관 있음, 언급)

질문만 생성하고, 다른 설명은 추가하지 마세요.`;
}
