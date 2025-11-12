import { CORE_ATTRIBUTES } from '@/data/attributes';

/**
 * 인트로 메시지 생성
 * @param phase0Context - Priority 페이지에서 입력한 추가 요청사항
 */
export function generateIntroMessage(phase0Context?: string): string {
  const baseMessage = '안녕하세요! 분유포트 구매 도우미에요.\n**실시간 판매량 베스트 상품들** 중에서, 고객님께 딱 맞는 상품을 찾아드려요 😀';


  return baseMessage;
}

/**
 * Phase 0: 워밍업 질문 (자유 맥락 수집)
 */
export function generateWarmupQuestion(): string {
  return '본격적으로 시작하기 전에, 분유포트 구매와 관련된 상황을 편하게 이야기해주세요. 어떤 것이든 좋아요. (예산 고민, 첫 아이, 쌍둥이, 중요  구매기준 등)';
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
  return '말씀 잘 들었어요! 😊\n혹시 마지막으로 더 궁금하거나 고민되는 부분이 있으실까요?.';
}

/**
 * Chat2 추천 확인 메시지 생성
 */
export function generateChat2ReadyMessage(): string {
  return '준비 완료!\n딱 맞는 상품들을 골라드릴게요. [추천 받기] 버튼을 눌러주세요!';
}

/**
 * Follow-up 질문 생성 (맥락 없을 때 속성 세부사항 기반)
 */
export function generateVeryImportantFollowUp(
  attributeName: string,
  attributeDetails?: string[]
): string {
  // 속성별 세부 사항 기반 질문 생성
  if (attributeDetails && attributeDetails.length > 0) {
    // 속성별 맞춤 질문 패턴
    if (attributeName.includes('온도')) {
      return `${attributeName}이 중요하시군요!\n혹시 빠른 냉각이나 24시간 보온 같은 기능이 필요하신가요?`;
    } else if (attributeName.includes('위생') || attributeName.includes('세척')) {
      return `${attributeName}이 중요하시군요!\n입구가 넓거나 뚜껑이 완전 분리되는 게 중요하신가요?`;
    } else if (attributeName.includes('소재') || attributeName.includes('안전')) {
      return `${attributeName}이 중요하시군요!\n의료용 등급 소재나 유해물질 제로가 꼭 필요하신가요?`;
    } else if (attributeName.includes('사용 편의')) {
      return `${attributeName}이 중요하시군요!\n용량, 무게, 소음 중에서 특히 신경 쓰이는 부분이 있으신가요?`;
    } else if (attributeName.includes('휴대')) {
      return `${attributeName}이 중요하시군요!\n접이식이나 무선 타입이 필요하신가요?`;
    } else if (attributeName.includes('가격')) {
      return `${attributeName}이 중요하시군요!\n예산 범위가 어느 정도이신가요?`;
    } else if (attributeName.includes('부가') || attributeName.includes('디자인')) {
      return `${attributeName}이 중요하시군요!\n티포트나 찜기처럼 다용도로 쓰고 싶으신가요?`;
    }
  }

  // 세부사항 없거나 매칭 안되면 일반 질문
  return `${attributeName}이 중요하시군요!\n어떤 점이 특히 중요하신가요?`;
}

// DEPRECATED: createFollowUpPrompt() and createReassessmentPrompt() removed
// These functions were part of the legacy Chat1 flow (Phase 0 context relevance + follow-up reassessment)
// Current Priority flow doesn't use these - attributes are pre-selected in Priority page
// Removed in Phase 2 cleanup (2025-01-11)
