/**
 * Question Deduplication Utility
 *
 * Flash Lite를 사용한 의미적 질문 중복 검증.
 * 프롬프트 기반 중복 방지의 2차 안전망으로 동작합니다.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { callGeminiWithRetry, parseJSONResponse } from '@/lib/ai/gemini';

// ============================================================================
// Types
// ============================================================================

/** 중복 검증용 경량 질문 타입 */
export interface QuestionForDedup {
  id: string;
  question: string;
  options: string[]; // 옵션 라벨만
}

/** 비교 대상 컨텍스트 */
export interface DedupContext {
  /** 이미 생성된/예정된 질문들 */
  existingQuestions?: QuestionForDedup[];
  /** 이미 수집된 Q&A 쌍 */
  collectedInfo?: Record<string, string>;
  /** 아직 보여주지 않은 예정 질문들 */
  remainingQuestions?: Array<{ question: string; options: string[] }>;
}

export interface DedupResult {
  /** 필터링된 질문 배열 (중복 제거됨) */
  filteredIds: string[];
  /** 제거된 질문 ID들 */
  removedIds: string[];
  /** 제거 이유 */
  removalReasons: Record<string, string>;
  /** 소요 시간 (ms) */
  durationMs: number;
}

interface FlashLiteDedupResponse {
  duplicates: Array<{ id: string; reason: string }>;
  unique: string[];
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Flash Lite를 사용하여 새 질문들이 기존 컨텍스트와 의미적으로 중복되는지 검증합니다.
 *
 * @param newQuestions - 검증할 질문들
 * @param existingContext - 비교 대상 (이미 질문한/예정된 질문, 수집된 정보)
 * @param options - 카테고리명, 로그 출력 여부
 * @returns 중복 제거 결과
 */
export async function deduplicateQuestions(
  newQuestions: QuestionForDedup[],
  existingContext: DedupContext,
  options?: { categoryName?: string; verbose?: boolean }
): Promise<DedupResult> {
  const startTime = Date.now();
  const verbose = options?.verbose ?? false;
  const allIds = newQuestions.map(q => q.id);

  // Edge case: 검증할 질문이 없음
  if (newQuestions.length === 0) {
    return { filteredIds: [], removedIds: [], removalReasons: {}, durationMs: 0 };
  }

  // Edge case: 비교 대상 없음
  const hasContext =
    (existingContext.existingQuestions?.length ?? 0) > 0 ||
    (existingContext.remainingQuestions?.length ?? 0) > 0 ||
    (existingContext.collectedInfo && Object.keys(existingContext.collectedInfo).filter(k => !k.startsWith('__')).length > 0);

  if (!hasContext) {
    return {
      filteredIds: allIds,
      removedIds: [],
      removalReasons: {},
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // 컨텍스트 섹션 빌드
    const contextParts: string[] = [];

    if (existingContext.collectedInfo) {
      const infoLines = Object.entries(existingContext.collectedInfo)
        .filter(([k]) => !k.startsWith('__'))
        .map(([q, a]) => `- ${q}: ${a}`);
      if (infoLines.length > 0) {
        contextParts.push(`### 이미 수집된 정보\n${infoLines.join('\n')}`);
      }
    }

    const allExisting = [
      ...(existingContext.existingQuestions || []).map(q =>
        `"${q.question}" (옵션: ${q.options.join(', ')})`
      ),
      ...(existingContext.remainingQuestions || []).map(q =>
        `"${q.question}" (옵션: ${q.options.join(', ')})`
      ),
    ];
    if (allExisting.length > 0) {
      contextParts.push(`### 이미 생성된/예정된 질문\n${allExisting.map((q, i) => `${i + 1}. ${q}`).join('\n')}`);
    }

    // 검증 대상 섹션
    const newQLines = newQuestions.map((q, i) =>
      `${String.fromCharCode(65 + i)}. [id:${q.id}] "${q.question}" (옵션: ${q.options.join(', ')})`
    );

    const prompt = `질문 중복 검사. 새 질문이 기존 컨텍스트와 의미적으로 중복되는지 판단.

## 기존 컨텍스트
${contextParts.join('\n\n') || '(없음)'}

## 검증 대상
${newQLines.join('\n')}

## 중복 판단 기준 (엄격하게 적용)
- 두 질문의 **옵션 선택 결과가 같은 필터링 효과**를 내는 경우만 중복
- 이미 수집된 정보를 **그대로** 다시 묻는 경우 = 중복

## ⚠️ 중복이 아닌 경우 (절대 제거하지 마세요!)
- 같은 **영역**(예: 바퀴, 소재)이라도 묻는 **구체적 스펙이 다르면** 중복 아님
  예: "안정감 중시?" (선호도) vs "바퀴 크기?" (구체적 수치) → 서로 다른 정보 수집 → 중복 아님
- 상위 개념 질문과 하위 세부 질문은 중복이 아님
  예: "세척 편의성 중요?" vs "소독 방식은?" → 중복 아님
- 옵션이 1~2개 키워드만 겹치는 정도는 중복 아님 (옵션 과반수가 겹쳐야 중복)

{"duplicates":[{"id":"질문id","reason":"중복 이유"}],"unique":["고유 질문id"]}`;

    // Flash Lite 호출
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      if (verbose) console.warn('[Dedup] No API key, skipping');
      return { filteredIds: allIds, removedIds: [], removalReasons: {}, durationMs: Date.now() - startTime };
    }

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
      },
    });

    const result = await callGeminiWithRetry(
      async () => {
        const r = await model.generateContent(prompt);
        return r.response.text();
      },
      2,   // 최대 2회 재시도
      500  // 500ms 초기 딜레이
    );

    const parsed = parseJSONResponse<FlashLiteDedupResponse>(result);

    const duplicateIds = new Set(
      (parsed.duplicates || [])
        .map(d => d.id)
        .filter(id => allIds.includes(id)) // 유효한 ID만
    );

    const filteredIds = allIds.filter(id => !duplicateIds.has(id));
    const removedIds = allIds.filter(id => duplicateIds.has(id));
    const removalReasons: Record<string, string> = {};
    (parsed.duplicates || []).forEach(d => {
      if (allIds.includes(d.id)) {
        removalReasons[d.id] = d.reason;
      }
    });

    const durationMs = Date.now() - startTime;

    if (verbose) {
      if (removedIds.length > 0) {
        console.log(`[Dedup] ✂️ ${removedIds.length}개 중복 제거 (${durationMs}ms):`);
        removedIds.forEach(id => console.log(`  - ${id}: ${removalReasons[id]}`));
      } else {
        console.log(`[Dedup] ✅ 중복 없음 (${durationMs}ms)`);
      }
    }

    return { filteredIds, removedIds, removalReasons, durationMs };

  } catch (error) {
    // Fail-open: 실패 시 모든 질문 유지
    console.error('[Dedup] Flash Lite 검증 실패, 전체 유지:', error);
    return {
      filteredIds: allIds,
      removedIds: [],
      removalReasons: {},
      durationMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// Replacement Question Generation (맞춤질문 대체 생성)
// ============================================================================

interface ReplacementQuestionOption {
  value: string;
  label: string;
  description?: string;
  isPopular?: boolean;
  isRecommend?: boolean;
}

interface ReplacementQuestion {
  id: string;
  question: string;
  options: ReplacementQuestionOption[];
  type: 'single' | 'multi';
  priority: number;
  dataSource: string;
  completed: boolean;
}

/**
 * 중복 제거로 빠진 맞춤질문을 대체할 새 질문을 생성합니다.
 * 기존 질문 목록을 "이미 있는 질문"으로 전달하여 중복되지 않는 질문만 생성합니다.
 */
export async function generateReplacementQuestions(
  count: number,
  categoryName: string,
  existingQuestions: QuestionForDedup[],
  marketContext: string,
): Promise<ReplacementQuestion[]> {
  if (count <= 0) return [];

  const startTime = Date.now();

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return [];

    const existingList = existingQuestions
      .map((q, i) => `${i + 1}. "${q.question}" (옵션: ${q.options.join(', ')})`)
      .join('\n');

    const prompt = `"${categoryName}" 구매 결정에 도움이 되는 맞춤질문 ${count}개를 추가 생성하세요.

## ⛔ 이미 생성된 질문 (이 질문들과 중복 금지!)
${existingList}

## 시장 데이터
${marketContext}

## 규칙
- 위 질문들과 **의미적으로 다른 새로운 관점**의 질문만 생성
- 예산/가격/단점 질문 생성 금지 (별도 시스템)
- 옵션 3~4개, 소괄호 부가설명 필수
- "상관없어요" 등 회피성 옵션 금지 (시스템이 자동 추가)
- 인기 옵션에 isPopular: true (질문당 0~2개)

JSON 배열만 출력:
[{"id":"고유id","question":"질문","options":[{"value":"v","label":"라벨 (설명)","description":"상세설명"}],"type":"single","priority":2,"dataSource":"추가 분석"}]`;

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 2000,
        responseMimeType: 'application/json',
      },
    });

    const result = await callGeminiWithRetry(
      async () => {
        const r = await model.generateContent(prompt);
        return r.response.text();
      },
      2,
      500
    );

    const parsed = parseJSONResponse<ReplacementQuestion[]>(result);
    const questions = (Array.isArray(parsed) ? parsed : [])
      .slice(0, count)
      .map(q => ({ ...q, completed: false }));

    // 생성된 대체 질문도 중복 검증
    if (questions.length > 0) {
      const toCheck: QuestionForDedup[] = questions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options.map(o => o.label),
      }));
      const dedupResult = await deduplicateQuestions(toCheck, { existingQuestions }, { categoryName });
      if (dedupResult.removedIds.length > 0) {
        const filtered = questions.filter(q => !dedupResult.removedIds.includes(q.id));
        console.log(`[Dedup] 🔄 대체 질문 ${questions.length}개 중 ${dedupResult.removedIds.length}개 재중복 → ${filtered.length}개 유지`);
        console.log(`[Dedup] 🔄 대체 질문 ${filtered.length}개 생성 완료 (${Date.now() - startTime}ms)`);
        return filtered;
      }
    }

    console.log(`[Dedup] 🔄 대체 질문 ${questions.length}개 생성 완료 (${Date.now() - startTime}ms)`);
    return questions;

  } catch (error) {
    console.error('[Dedup] 대체 질문 생성 실패:', error);
    return [];
  }
}

// ============================================================================
// Follow-up Regeneration (꼬리질문 재생성)
// ============================================================================

interface FollowUpOption {
  value: string;
  label: string;
}

interface FollowUpResult {
  hasFollowUp: boolean;
  followUp?: {
    question: string;
    type: string;
    options: FollowUpOption[];
  };
  skipReason?: string;
}

/**
 * 중복 판정된 꼬리질문 대신, 중복되지 않는 새로운 꼬리질문을 생성합니다.
 */
export async function regenerateFollowUp(
  categoryName: string,
  questionText: string,
  userAnswer: string,
  duplicateReason: string,
  existingContext: DedupContext,
): Promise<FollowUpResult> {
  const startTime = Date.now();

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { hasFollowUp: false, skipReason: 'No API key' };

    // 기존 질문/수집정보 목록
    const contextLines: string[] = [];
    if (existingContext.collectedInfo) {
      Object.entries(existingContext.collectedInfo)
        .filter(([k]) => !k.startsWith('__'))
        .forEach(([q, a]) => contextLines.push(`- [수집됨] ${q}: ${a}`));
    }
    if (existingContext.remainingQuestions) {
      existingContext.remainingQuestions.forEach(q =>
        contextLines.push(`- [예정] "${q.question}"`)
      );
    }
    if (existingContext.existingQuestions) {
      existingContext.existingQuestions.forEach(q =>
        contextLines.push(`- [기존] "${q.question}"`)
      );
    }

    const prompt = `"${categoryName}" 구매 상담. 사용자가 답변한 내용을 더 깊게 파고드는 꼬리질문 1개를 생성하세요.

사용자 답변:
- 질문: "${questionText}"
- 답변: "${userAnswer}"

## ⛔ 피해야 할 주제 (중복 판정됨)
"${duplicateReason}"

## ⛔ 기존 질문/수집 정보 (이 주제들과 겹치면 안 됨)
${contextLines.join('\n') || '(없음)'}

## 규칙
- 위 중복 주제와 **완전히 다른 관점**에서 질문
- 사용자 답변에서 더 구체화할 수 있는 **다른 측면** 탐색
- 옵션 2~3개, 간결하게
- 정말 추가 정보가 필요 없다면 hasFollowUp: false

JSON만 출력:
{"hasFollowUp":true,"followUp":{"question":"질문","type":"deepdive","options":[{"value":"a","label":"옵션A"},{"value":"b","label":"옵션B"}]}}
또는
{"hasFollowUp":false,"skipReason":"이유"}`;

    const ai = new GoogleGenerativeAI(apiKey);
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 500,
        responseMimeType: 'application/json',
      },
    });

    const result = await callGeminiWithRetry(
      async () => {
        const r = await model.generateContent(prompt);
        return r.response.text();
      },
      2,
      500
    );

    // LLM이 JSON 뒤에 불필요한 문자를 붙이는 경우가 있어 안전하게 파싱
    let parsed: FollowUpResult;
    try {
      parsed = parseJSONResponse<FollowUpResult>(result);
    } catch {
      // parseJSONResponse 실패 시, 첫 번째 유효한 JSON 객체만 추출
      const firstObjMatch = result.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (!firstObjMatch) {
        return { hasFollowUp: false, skipReason: 'JSON parse failed' };
      }
      try {
        parsed = JSON.parse(firstObjMatch[0]);
      } catch {
        return { hasFollowUp: false, skipReason: 'JSON parse failed' };
      }
    }

    if (parsed.hasFollowUp && parsed.followUp?.options?.length && parsed.followUp.options.length >= 2) {
      // 재생성 프롬프트에 이미 모든 회피 컨텍스트가 포함되어 있으므로, 2차 dedup 검증 생략
      console.log(`[Dedup] 🔄 꼬리질문 재생성 완료: "${parsed.followUp.question}" (${Date.now() - startTime}ms)`);
      return parsed;
    }

    return { hasFollowUp: false, skipReason: parsed.skipReason || 'No valid follow-up generated' };

  } catch (error) {
    console.error('[Dedup] 꼬리질문 재생성 실패:', error);
    return { hasFollowUp: false, skipReason: 'Regeneration failed' };
  }
}
