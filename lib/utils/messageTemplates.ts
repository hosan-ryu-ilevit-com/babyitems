import { CORE_ATTRIBUTES } from '@/data/attributes';

/**
 * 인트로 메시지 생성
 */
export function generateIntroMessage(): string {
  return '안녕하세요! 분유포트 구매 도우미에요.\n고객님께 딱 맞는 상품을 찾아드릴게요 😀 구매시 고려해야 할 중요한 기준들을 하나씩 여쭤볼게요!';
}

/**
 * Phase 0: 워밍업 질문 (자유 맥락 수집)
 */
export function generateWarmupQuestion(): string {
  return '본격적으로 시작하기 전에, 분유포트 구매와 관련된 고객님의 상황을 자유롭게 이야기해주세요! 어떤 것이든 좋아요. (예산, 직장 여부, 쌍둥이, 중요하게 생각하는 구매 기준 등)';
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

/**
 * Phase 0 맥락을 기반으로 속성별 맞춤 follow-up 질문 생성 프롬프트
 * AI가 자연스러운 질문을 생성하도록 유도
 */
export function createFollowUpPrompt(
  attributeName: string,
  phase0Context: string,
  importance?: string,
  attributeDetails?: string[]
): string {
  const importanceText = importance === '중요함'
    ? '매우 중요하다고'
    : importance === '보통'
    ? '보통이라고'
    : '중요하지 않다고';

  const detailsContext = attributeDetails && attributeDetails.length > 0
    ? `\n\n**${attributeName}의 세부 요소들:**\n${attributeDetails.map((d, i) => `${i + 1}. ${d}`).join('\n')}`
    : '';

  // Phase 0 맥락 유무 확인
  const hasContext = phase0Context && phase0Context.trim() !== '' && phase0Context !== '없어요';

  if (hasContext) {
    // 맥락이 있는 경우 - 3단계 전략
    return `사용자가 이전에 다음과 같이 말했습니다:
"${phase0Context}"

이제 사용자가 "${attributeName}" 속성을 "${importanceText}" 선택했습니다.${detailsContext}

**임무:** Phase 0 맥락과 현재 속성의 연관도를 분석하여, 가장 적절한 질문 유형을 선택하세요.

**3단계 질문 전략:**

**1️⃣ 강한 연관 (이미 명확히 언급됨)**
- 조건: Phase 0에서 현재 속성과 관련된 니즈를 **명확하게** 언급한 경우
  예시: "출퇴근용 포터블 필요해요" → 휴대성 속성
  예시: "예산 5-8만원" → 가격/가성비 속성
  예시: "세척이 쉬워야 해요" → 위생/세척 편의성 속성
- 전략: **확인형 질문 + 중요도 제안**
- 패턴: "앞서 [Phase 0 내용]하셨죠? '[속성명]'을(를) '[사용자가 선택한 중요도]'으로 체크할까요?"
- 예시:
  * "앞서 출퇴근용으로 포터블이 필요하다고 하셨죠? '휴대성'을 '중요함'으로 체크할까요?"
  * "예산이 5-8만원이라고 하셨는데, '가격/가성비'를 '중요함'으로 체크할까요?"

**2️⃣ 약한 연관 (간접적 언급 또는 추론 가능)**
- 조건: Phase 0에서 직접 언급하지 않았지만, 간접적으로 관련된 경우
  예시: "출퇴근 한다" → 휴대성 속성 (직접 언급 X, 간접 추론 O)
  예시: "쌍둥이 키운다" → 사용 편의성 (용량, 속도 등)
- 전략: **맥락 기반 확장 질문** (이미 언급한 내용을 다시 묻지 말 것!)
- 패턴: "[Phase 0 맥락]하신다고 하셨는데, [세부 요소] 같은 부분도 중요하신가요?"
- 예시:
  * "출퇴근하신다고 하셨는데, 무게나 접이식 같은 부분도 중요하신가요?"
  * "쌍둥이를 키우신다고 하셨는데, 큰 용량이나 빠른 조리 속도가 중요하신가요?"

**3️⃣ 연관 없음**
- 조건: Phase 0 맥락과 현재 속성이 관련 없는 경우
- 전략: **일반형 follow-up 질문** (세부 요소 기반)
- **중요**: Phase 0 맥락을 절대 언급하지 말 것! "파악하기 어렵다", "관련이 없다" 같은 메타 설명도 금지
- 패턴: 세부 요소만 활용하여 자연스러운 질문 (마치 Phase 0 맥락이 없는 것처럼)
- 예시:
  * "혹시 빠른 냉각이나 24시간 보온 같은 기능이 필요하신가요?"
  * "입구가 넓거나 뚜껑이 완전 분리되는 게 중요하신가요?"

**중요한 원칙:**
- Phase 0에서 **이미 명확히 답변한 내용은 절대 다시 묻지 말 것**
- 1️⃣ 강한 연관: 반드시 "~하셨죠?" + "~으로 체크할까요?" 패턴 사용
- 2️⃣ 약한 연관: Phase 0 내용을 **확장**하는 방향으로 질문
- 3️⃣ 연관 없음: Phase 0 맥락을 **완전히 무시**하고 세부 요소 기반 질문만 (마치 맥락이 없는 것처럼 행동)
  - "연관이 없다", "파악하기 어렵다" 같은 설명 절대 금지
  - Phase 0을 전혀 언급하지 않은 자연스러운 질문만

중요도에 따른 톤 조절:
- "중요함": 적극적으로 확인/상세 요청
- "보통": 가볍게 확인/물어보기
- "중요하지 않음": 매우 가볍게

질문만 생성하고, 다른 설명은 추가하지 마세요.`;
  } else {
    // 맥락이 없는 경우
    return `사용자가 "${attributeName}" 속성을 "${importanceText}" 선택했습니다.${detailsContext}

사용자의 특별한 맥락은 없지만, 세부 요소들을 기반으로 구체적이고 자연스러운 질문(1-2문장)을 생성해주세요.

**질문 생성 가이드:**
- 세부 요소들을 참고하여 구체적인 질문 (예: "빠른 냉각이 중요하신가요?", "입구가 넓은 게 좋으신가요?")
- 너무 형식적이지 않고 대화하듯이, 1-2문장으로

중요도에 따른 톤:
- "중요함": 적극적으로 상세 요청 (예: "빠른 냉각 기능이 필요하신가요?")
- "보통": 가볍게 물어보기 (예: "혹시 특별히 원하시는 기능 있으신가요?")
- "중요하지 않음": 매우 가볍게 (예: "참고로, 어떤 점이 덜 중요하신가요?")

예시:
- 속성: "온도 조절/유지력" + details: ["빠른 냉각", "24시간 보온"...] → "혹시 빠른 냉각이나 24시간 보온 같은 기능이 필요하신가요?"
- 속성: "위생/세척 편의성" + details: ["입구가 넓음", "뚜껑 분리"...] → "입구가 넓거나 뚜껑이 완전 분리되는 게 중요하신가요?"

질문만 생성하고, 다른 설명은 추가하지 마세요.`;
  }
}

/**
 * Follow-up 답변 기반 중요도 재평가 프롬프트
 */
export function createReassessmentPrompt(
  attributeName: string,
  initialImportance: string,
  followUpQuestion: string,
  userAnswer: string,
  attributeDetails?: string[]
): string {
  const detailsContext = attributeDetails && attributeDetails.length > 0
    ? `\n\n**${attributeName}의 세부 요소들:**\n${attributeDetails.map((d, i) => `${i + 1}. ${d}`).join('\n')}`
    : '';

  return `사용자가 "${attributeName}" 속성에 대해 초기에 "${initialImportance}"을(를) 선택했습니다.${detailsContext}

그 후 우리가 물어본 질문:
"${followUpQuestion}"

사용자의 답변:
"${userAnswer}"

**임무:** 사용자의 답변을 분석하여, 초기 중요도 선택("${initialImportance}")이 적절한지 재평가해주세요.

**재평가 기준:**
1. **유지(maintain)**: 답변이 초기 선택과 일치하거나 구체적인 요구사항을 제시한 경우
   - 예: "중요함" 선택 후 "빠른 냉각 기능 꼭 필요해요" → 유지
   - 예: "보통" 선택 후 "기본 기능만 있으면 돼요" → 유지

2. **상향(upgrade)**: 답변에서 더 강한 니즈나 구체적인 요구가 드러난 경우
   - 예: "보통" 선택 후 "매일 여러 번 세척해야 해서 세척이 정말 쉬워야 해요" → "중요함"으로 상향

3. **하향(downgrade)**: 답변에서 실제로는 덜 중요하다는 뉘앙스가 드러난 경우
   - 예: "중요함" 선택 후 "그런 기능까지는 필요 없어요" → "보통" 또는 "중요하지 않음"으로 하향
   - 예: "보통" 선택 후 "크게 신경 안 써요" → "중요하지 않음"으로 하향

**출력 형식 (JSON):**
{
  "action": "maintain" | "upgrade" | "downgrade",
  "newImportance": "중요함" | "보통" | "중요하지 않음",
  "reason": "재평가 이유를 1문장으로"
}

**중요:**
- action이 "maintain"이면 newImportance는 초기값과 동일
- 애매하면 "maintain" 선택 (사용자 선택 존중)
- 답변이 "넘어가기", "다음", "없어요" 같은 경우 무조건 "maintain"

JSON만 출력하고, 다른 설명은 추가하지 마세요.`;
}
