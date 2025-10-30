import { CORE_ATTRIBUTES, AttributeInfo } from '@/data/attributes';

/**
 * 인트로 메시지 생성
 */
export function generateIntroMessage(): string {
  return '안녕하세요! 분유포트 구매를 도와드릴 AI 쇼핑 비서입니다.\n\n육아에 지치신 부모님께 편안하고 안전한 수유 환경을 만들어 드릴 수 있도록, 제가 핵심적인 7가지 기준을 하나씩 안내해 드리고, 고객님께 가장 중요한 요소가 무엇인지 함께 찾아보겠습니다.';
}

/**
 * 속성별 질문 메시지 생성 (고정된 템플릿)
 */
export function generateAttributeQuestion(attributeIndex: number): string {
  const attribute = CORE_ATTRIBUTES[attributeIndex];

  // 인트로 설정
  let intro: string;
  if (attributeIndex === 0) {
    intro = `분유포트 구매 시 가장 중요하게 고려해야 할 첫 번째 요소는 바로 **'${attribute.name}'**입니다. 이 기능은 특히 수면 부족에 시달리는 야간 및 새벽 수유 시 부모님의 만족도를 좌우하는 핵심입니다.`;
  } else {
    intro = attribute.conversationalIntro || `다음은 **'${attribute.name}'**입니다.`;
  }

  // 속성 설명 (description)
  const description = attribute.description;

  // 세부 사항 리스트
  const detailsText = attribute.details
    .map((detail) => `• ${detail}`)
    .join('\n');

  // 중요도 옵션 설명
  const examplesText = attribute.importanceExamples
    ? `\n\n**매우 중요**: ${attribute.importanceExamples.veryImportant}\n**중요함**: ${attribute.importanceExamples.important}\n**보통**: ${attribute.importanceExamples.normal}`
    : '';

  // 전체 메시지 조합
  return `${intro}\n\n**${attribute.name}**\n${description}\n\n${detailsText}\n\n고객님께서는 **'${attribute.name}'**에 대해 어느 정도 중요하게 생각하시나요?${examplesText}`;
}

/**
 * 중요도 선택에 대한 피드백 메시지 생성
 */
export function generateImportanceFeedback(
  attributeName: string,
  importance: '매우 중요' | '중요' | '보통',
  isNaturalLanguage: boolean = false,
  userMessage?: string
): string {
  if (isNaturalLanguage && userMessage) {
    // 자연어 답변에 대한 맥락 반영 피드백
    return `네, 말씀 감사합니다. '${attributeName}'을(를) **${importance}**하게 생각하시는 것으로 이해했습니다.`;
  }

  // 버튼 클릭에 대한 간단한 피드백
  return `네, 고객님의 의견 감사합니다. '${attributeName}'을(를) **${importance}**(으)로 기록해 두겠습니다.`;
}

/**
 * Chat2 전환 메시지 생성
 */
export function generateChat2TransitionMessage(): string {
  return '모든 핵심 항목에 대한 답변 감사합니다! 😊\n\n혹시 추가로 고려하시는 사항이 있으신가요? 예를 들어 쌍둥이 육아, 야간 수유 빈도, 예산 등 무엇이든 편하게 말씀해주세요. \n\n 추가로 말씀하실 사항이 없다면, 아래 **추천 받기**버튼을 눌러주세요!';
}
