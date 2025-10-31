import { CORE_ATTRIBUTES } from '@/data/attributes';

/**
 * 인트로 메시지 생성
 */
export function generateIntroMessage(): string {
  return '안녕하세요! 분유포트 구매를 도와드릴 쇼핑 비서에요.\n\n분유포트 구매에 가장 중요한 7가지 기준을 하나씩 안내해 드릴게요. 하나씩 평가하며 고객님께 가장 맞는 분유포트를 함께 찾아봐요!';
}

/**
 * 속성별 질문 메시지 생성 (고정된 템플릿)
 * 메시지를 여러 버블로 나누기 위해 배열로 반환
 */
export function generateAttributeQuestion(attributeIndex: number): string[] {
  const attribute = CORE_ATTRIBUTES[attributeIndex];

  // 인트로 설정 (첫 번째일 때만 특별, 나머지는 conversationalIntro 사용)
  let intro: string;
  if (attributeIndex === 0) {
    intro = `분유포트 구매 시 가장 중요하게 고려해야 할 첫 번째 요소는 바로 **'${attribute.name}'**입니다. 이 기능은 수면 부족에 시달리는 야간 및 새벽 수유 시 부모님의 만족도를 좌우하는 핵심입니다.`;
  } else {
    intro = attribute.conversationalIntro || `다음은 **'${attribute.name}'**입니다.`;
  }

  // 세부 사항 리스트
  const detailsText = attribute.details
    .map((detail) => `• ${detail}`)
    .join('\n');

  // 첫 번째 버블: 인트로 + 세부사항을 하나로 통합
  const combinedMessage = `${intro}\n\n${detailsText}`;

  // 중요도 옵션 설명
  const examplesText = attribute.importanceExamples
    ? `\n\n**매우 중요**: ${attribute.importanceExamples.veryImportant}\n**중요함**: ${attribute.importanceExamples.important}\n**보통**: ${attribute.importanceExamples.normal}`
    : '';

  // 두 번째 버블: 질문 (하늘색 배경)
  const questionMessage = `고객님께서는 **'${attribute.name}'**에 대해 어느 정도 중요하게 생각하시나요?${examplesText}`;

  // 2개의 분리된 메시지로 반환
  return [combinedMessage, questionMessage];
}

/**
 * 중요도 선택에 대한 피드백 메시지 생성
 */
export function generateImportanceFeedback(
  attributeName: string,
  importance: '매우 중요' | '중요' | '보통'
): string {
  // 버튼 클릭이든 자연어든 동일하게 확인 메시지 스타일로 처리
  const displayImportance = importance === '매우 중요' ? '매우 중요함' : importance === '중요' ? '중요함' : '보통';
  return `'${attributeName}'을(를) '${displayImportance}'으로 기록`;
}

/**
 * Chat2 전환 메시지 생성
 */
export function generateChat2TransitionMessage(): string {
  return '모든 항목에 대한 답변 감사합니다! 😊\n\n혹시 추가로 고려해야 할 개인적인 상황이 있으신가요?\n\n추가로 고려해야 할 정보가 없다면, 아래 **추천 받기** 버튼을 눌러주세요!';
}
