/**
 * 맞춤질문 마크다운 생성기 및 파서
 * - 자연어 스타일로 디테일하게 작성
 * - QuestionTodo <-> MD 변환
 */

import {
  QuestionTodo,
  CustomQuestionsMetadata,
  ParsedQuestion,
  ParsedOption,
} from './types';

// ============================================================================
// MD 생성 함수
// ============================================================================

/**
 * 맞춤질문 배열을 자연어 MD 포맷으로 변환
 */
export function generateQuestionsMarkdown(
  questions: QuestionTodo[],
  metadata: CustomQuestionsMetadata,
  overview: string
): string {
  const lines: string[] = [];

  // 헤더
  lines.push(`# ${metadata.categoryName} 맞춤질문`);
  lines.push('');
  lines.push(`> 생성일: ${formatDate(metadata.generatedAt)} | 분석 상품 ${metadata.productCount}개 | 리뷰 ${metadata.reviewCount}개 기반 | 모델: ${metadata.llmModel}`);
  lines.push('');

  // 개요
  lines.push('## 개요');
  lines.push('');
  lines.push(overview);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 각 질문
  questions.forEach((q, index) => {
    lines.push(generateQuestionSection(q, index + 1));
    lines.push('');
  });

  return lines.join('\n');
}

/**
 * 단일 질문을 MD 섹션으로 변환
 */
function generateQuestionSection(question: QuestionTodo, index: number): string {
  const lines: string[] = [];

  // 질문 헤더
  lines.push(`## 질문 ${index}: ${getQuestionTitle(question.id)} (${question.id})`);
  lines.push('');
  lines.push(`**"${question.question}"**`);
  lines.push('');

  // 질문 이유/배경
  if (question.reason) {
    lines.push(question.reason);
    lines.push('');
  }

  // 메타 정보
  lines.push(`- 타입: ${question.type === 'single' ? '단일 선택' : '복수 선택'}`);
  lines.push(`- 우선순위: ${question.priority}`);
  lines.push(`- 데이터 소스: ${question.dataSource}`);
  lines.push('');

  // 선택지
  lines.push('### 선택지');
  lines.push('');

  question.options.forEach((option) => {
    const popularMark = option.isPopular ? ' ⭐인기' : '';
    lines.push(`**${option.label}** \`${option.value}\`${popularMark}`);
    if (option.description) {
      lines.push(option.description);
    }
    lines.push('');
  });

  lines.push('---');

  return lines.join('\n');
}

/**
 * 질문 ID로부터 한글 제목 추출
 */
function getQuestionTitle(questionId: string): string {
  const titleMap: Record<string, string> = {
    'budget': '예산',
    'baby_age': '아기 월령',
    'cooking_style': '조리 방식',
    'material': '재질',
    'capacity': '용량',
    'brand': '브랜드',
    'usage': '용도',
    'priority': '우선순위',
  };

  // ID에서 추출 시도
  for (const [key, title] of Object.entries(titleMap)) {
    if (questionId.toLowerCase().includes(key)) {
      return title;
    }
  }

  // snake_case를 Title Case로 변환
  return questionId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * ISO 날짜를 읽기 쉬운 포맷으로 변환
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// MD 파싱 함수
// ============================================================================

/**
 * MD 포맷에서 맞춤질문 배열과 메타데이터 파싱
 */
export function parseQuestionsMarkdown(markdown: string): {
  metadata: CustomQuestionsMetadata;
  questions: ParsedQuestion[];
  overview: string;
} {
  const lines = markdown.split('\n');

  // 메타데이터 파싱
  const metadata = parseMetadata(lines);

  // 개요 파싱
  const overview = parseOverview(lines);

  // 질문들 파싱
  const questions = parseQuestions(lines);

  return { metadata, questions, overview };
}

/**
 * 메타데이터 라인 파싱
 * > 생성일: 2026-01-29 | 분석 상품 20개 | 리뷰 1,887개 기반 | 모델: gemini-2.5-flash-lite
 */
function parseMetadata(lines: string[]): CustomQuestionsMetadata {
  const metaLine = lines.find(line => line.startsWith('>'));

  const categoryLine = lines.find(line => line.startsWith('# '));
  const categoryName = categoryLine
    ? categoryLine.replace('# ', '').replace(' 맞춤질문', '').trim()
    : '';

  if (!metaLine) {
    return {
      categoryName,
      generatedAt: new Date().toISOString(),
      productCount: 0,
      reviewCount: 0,
      llmModel: 'unknown',
    };
  }

  const productMatch = metaLine.match(/분석 상품 (\d+)개/);
  const reviewMatch = metaLine.match(/리뷰 ([\d,]+)개/);
  const modelMatch = metaLine.match(/모델: ([\w-]+)/);
  const dateMatch = metaLine.match(/생성일: ([^|]+)/);

  return {
    categoryName,
    generatedAt: dateMatch ? parseKoreanDate(dateMatch[1].trim()) : new Date().toISOString(),
    productCount: productMatch ? parseInt(productMatch[1]) : 0,
    reviewCount: reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0,
    llmModel: modelMatch ? modelMatch[1] : 'unknown',
  };
}

/**
 * 한글 날짜 포맷을 ISO로 변환
 */
function parseKoreanDate(dateStr: string): string {
  try {
    // 2026. 01. 29. 오후 3:30 형식 파싱
    const match = dateStr.match(/(\d{4})\.\s*(\d{2})\.\s*(\d{2})/);
    if (match) {
      return new Date(`${match[1]}-${match[2]}-${match[3]}`).toISOString();
    }
    return new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * 개요 섹션 파싱
 */
function parseOverview(lines: string[]): string {
  const overviewStart = lines.findIndex(line => line.trim() === '## 개요');
  if (overviewStart === -1) return '';

  const overviewEnd = lines.findIndex(
    (line, idx) => idx > overviewStart && (line.startsWith('## 질문') || line.trim() === '---')
  );

  const overviewLines = lines.slice(overviewStart + 1, overviewEnd > 0 ? overviewEnd : undefined);
  return overviewLines
    .filter(line => line.trim() && !line.startsWith('##'))
    .join('\n')
    .trim();
}

/**
 * 질문들 파싱
 */
function parseQuestions(lines: string[]): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  let currentQuestion: Partial<ParsedQuestion> | null = null;
  let currentOptions: ParsedOption[] = [];
  let inOptionsSection = false;
  let currentOptionLabel = '';
  let currentOptionValue = '';
  let currentOptionDesc: string[] = [];
  let currentOptionIsPopular = false;

  const flushCurrentOption = () => {
    if (currentOptionLabel && currentOptionValue) {
      currentOptions.push({
        label: currentOptionLabel,
        value: currentOptionValue,
        description: currentOptionDesc.join(' ').trim(),
        isPopular: currentOptionIsPopular,
      });
    }
    currentOptionLabel = '';
    currentOptionValue = '';
    currentOptionDesc = [];
    currentOptionIsPopular = false;
  };

  const flushCurrentQuestion = () => {
    flushCurrentOption();
    if (currentQuestion && currentQuestion.id) {
      questions.push({
        id: currentQuestion.id,
        question: currentQuestion.question || '',
        reason: currentQuestion.reason,
        type: currentQuestion.type || 'single',
        priority: currentQuestion.priority || 99,
        options: currentOptions,
      });
    }
    currentQuestion = null;
    currentOptions = [];
    inOptionsSection = false;
  };

  for (const line of lines) {
    // 새 질문 시작
    const questionHeaderMatch = line.match(/^## 질문 \d+: .+\((\w+)\)$/);
    if (questionHeaderMatch) {
      flushCurrentQuestion();
      currentQuestion = {
        id: questionHeaderMatch[1],
        type: 'single',
        priority: 99,
      };
      continue;
    }

    if (!currentQuestion) continue;

    // 질문 텍스트 (볼드 + 따옴표)
    const questionTextMatch = line.match(/^\*\*"(.+)"\*\*$/);
    if (questionTextMatch) {
      currentQuestion.question = questionTextMatch[1];
      continue;
    }

    // 타입 파싱
    if (line.startsWith('- 타입:')) {
      currentQuestion.type = line.includes('복수') ? 'multi' : 'single';
      continue;
    }

    // 우선순위 파싱
    if (line.startsWith('- 우선순위:')) {
      const priorityMatch = line.match(/우선순위: (\d+)/);
      if (priorityMatch) {
        currentQuestion.priority = parseInt(priorityMatch[1]);
      }
      continue;
    }

    // 선택지 섹션 시작
    if (line.trim() === '### 선택지') {
      inOptionsSection = true;
      continue;
    }

    // 옵션 파싱
    if (inOptionsSection) {
      // 새 옵션 시작: **라벨** `value` ⭐인기
      const optionMatch = line.match(/^\*\*(.+?)\*\*\s*`(\w+)`(.*)$/);
      if (optionMatch) {
        flushCurrentOption();
        currentOptionLabel = optionMatch[1];
        currentOptionValue = optionMatch[2];
        currentOptionIsPopular = optionMatch[3].includes('⭐');
        continue;
      }

      // 옵션 설명 (이전 옵션의 description)
      if (currentOptionLabel && line.trim() && !line.startsWith('#') && !line.startsWith('-') && !line.startsWith('*')) {
        currentOptionDesc.push(line.trim());
        continue;
      }
    }

    // 질문 이유 (선택지 섹션 전, 볼드/메타 정보 아닌 텍스트)
    if (!inOptionsSection && !line.startsWith('-') && !line.startsWith('*') && !line.startsWith('#') && line.trim()) {
      if (!currentQuestion.reason) {
        currentQuestion.reason = line.trim();
      } else {
        currentQuestion.reason += ' ' + line.trim();
      }
    }
  }

  // 마지막 질문 처리
  flushCurrentQuestion();

  return questions;
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

/**
 * ParsedQuestion을 QuestionTodo로 변환
 */
export function parsedToQuestionTodo(
  parsed: ParsedQuestion,
  dataSource: string = 'indexed'
): QuestionTodo {
  return {
    id: parsed.id,
    question: parsed.question,
    reason: parsed.reason || '',
    type: parsed.type,
    priority: parsed.priority,
    dataSource,
    completed: false,
    options: parsed.options.map(opt => ({
      value: opt.value,
      label: opt.label,
      description: opt.description,
      isPopular: opt.isPopular,
    })),
  };
}

/**
 * QuestionTodo 배열로 변환
 */
export function parsedQuestionsToTodos(
  parsed: ParsedQuestion[],
  dataSource: string = 'indexed'
): QuestionTodo[] {
  return parsed.map(q => parsedToQuestionTodo(q, dataSource));
}
