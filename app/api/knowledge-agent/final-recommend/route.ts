/**
 * Knowledge Agent - Final Recommend API (새 아키텍처)
 *
 * 120개 전체 후보에서 LLM으로 Top 3 직접 선정
 * - hard-cut 제거: LLM이 전체 후보에서 직접 선택
 * - 스펙 + 리뷰 + 사용자 선택 기반 평가
 * - 스펙 정규화 (비교표용)
 * - 장단점 리스트 생성 (Flash Lite)
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import type {
  HardCutProduct,
  BalanceSelection,
  FinalRecommendation,
  FinalRecommendationRequest,
  ReviewLite,
  FilterTag,
} from '@/lib/knowledge-agent/types';
import type { ProductInfo } from '@/lib/indexing/types';

export const maxDuration = 90; // 🆕 60 → 90초 (여유 있게)

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Supabase 클라이언트
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 모델 상수
const FINAL_RECOMMEND_MODEL = 'gemini-3-flash-preview'; // 최종 추천용 (가장 똑똑한 모델)
const PROS_CONS_MODEL = 'gemini-2.5-flash-lite'; // 장단점 생성용 (미사용)
const KEYWORD_EXPAND_MODEL = 'gemini-2.5-flash-lite'; // 키워드 확장용
const FILTER_TAG_MODEL = 'gemini-2.5-flash-lite'; // 필터 태그 생성용

// 추천 개수 상수
const RECOMMENDATION_COUNT = 5; // 추천 상품 개수 (기존 3 → 5)

// 🆕 토큰 제한 (완화)
const TOKEN_LIMITS = {
  FINAL_RECOMMEND: 3000,      // 2000 → 3000 (한줄평)
  TAG_EVALUATION: 8000,       // 6000 → 8000 (태그 5개 제품)
  FILTER_TAGS: 2500,          // 2000 → 2500 (필터 태그)
  TOP_N_SELECTION: 4000,      // 3000 → 4000 (상품 선정)
};

// ============================================================================
// 선호 키워드 확장 (flash-lite) - prescreenCandidates에서 리뷰 검색용
// ============================================================================

interface ExpandedKeywords {
  preferKeywords: string[];
  avoidKeywords: string[];
}

/**
 * collectedInfo에서 리뷰 검색용 키워드 추출 + 동의어 확장
 * - "조용한 거 원해요" → ["조용", "소음", "정숙", "저소음", "시끄럽"]
 * - "세척 쉬운 거" → ["세척", "청소", "분해", "씻", "닦"]
 */
async function extractExpandedKeywords(
  categoryName: string,
  collectedInfo: Record<string, string>,
): Promise<ExpandedKeywords> {
  // 기본 키워드 (LLM 실패 시 fallback)
  const fallback: ExpandedKeywords = {
    preferKeywords: [],
    avoidKeywords: [],
  };

  // collectedInfo가 없으면 빈 결과 반환
  const infoEntries = Object.entries(collectedInfo).filter(
    ([key]) => !key.startsWith('__') // 내부 키 제외
  );
  if (infoEntries.length === 0) {
    return fallback;
  }

  if (!ai) {
    console.log('[KeywordExpand] No AI available, using fallback');
    return fallback;
  }

  const model = ai.getGenerativeModel({
    model: KEYWORD_EXPAND_MODEL,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 600,
    },
  });

  const userConditions = infoEntries
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n') || '(없음)';

  const prompt = `## ${categoryName} 구매 조건에서 리뷰 검색용 키워드 추출

## 사용자 선호 조건
${userConditions}

## 작업
1. 선호 조건에서 리뷰 검색용 핵심 키워드 추출 (동의어/유사어 포함)
2. 피할 단점이 암시되어 있다면 리뷰 검색용 핵심 키워드 추출 (동의어/유사어 포함)
3. 각 키워드는 2-4글자의 한글 단어로 (조사 제외)

## 예시
- "조용한 거 원해요" → ["조용", "소음", "정숙", "저소음", "시끄럽"]
- "세척 쉬운 거" → ["세척", "청소", "분해", "씻"]
- "6개월 아기" → ["개월", "신생아", "아기"]

## 응답 (JSON만, 설명 없이)
{"preferKeywords":["키워드1","키워드2"],"avoidKeywords":["키워드1","키워드2"]}`;

  try {
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const elapsed = Date.now() - startTime;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ExpandedKeywords;
      console.log(`[KeywordExpand] Extracted ${parsed.preferKeywords?.length || 0} prefer, ${parsed.avoidKeywords?.length || 0} avoid keywords (${elapsed}ms)`);
      return {
        preferKeywords: parsed.preferKeywords || [],
        avoidKeywords: parsed.avoidKeywords || [],
      };
    }
  } catch (error) {
    console.error('[KeywordExpand] Failed:', error);
  }

  return fallback;
}

// ============================================================================
// JSON Repair & Retry - 3단계 재시도 로직
// ============================================================================

/**
 * LLM이 출력한 잘못된 JSON을 복구 시도 (from init/route.ts)
 * 흔한 오류: trailing commas, unescaped quotes, control characters
 */
function repairJSON(jsonStr: string): string {
  let repaired = jsonStr;

  // 1. Control characters 제거 (newline, tab 제외)
  repaired = repaired.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

  // 2. 문자열 내부의 이스케이프되지 않은 줄바꿈 처리
  repaired = repaired.replace(/"([^"]*)\n([^"]*)"/g, (_match, p1, p2) => {
    return `"${p1}\\n${p2}"`;
  });

  // 3. Trailing commas 제거 (배열/객체 끝의 불필요한 쉼표)
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // 4. 객체/배열 사이 누락된 쉼표 추가
  repaired = repaired.replace(/}(\s*){/g, '},$1{');
  repaired = repaired.replace(/](\s*)\[/g, '],$1[');

  // 5. 문자열 값 뒤 쉼표 누락 복구 (간단한 패턴만)
  repaired = repaired.replace(/"(\s+)"/g, '", "');

  return repaired;
}

/**
 * 3단계 JSON 파싱 재시도 로직
 * 1단계: 기본 JSON.parse
 * 2단계: repairJSON (간단한 정리)
 * 3단계: repairJSONWithFlashLite (LLM 재파싱)
 */
async function parseWithRetry(
  rawText: string,
  taskName: string,
  maxRetries: number = 1
): Promise<Record<string, unknown> | null> {
  // JSON 추출
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error(`[${taskName}] ❌ JSON 패턴을 찾을 수 없음`);
    return null;
  }

  const jsonText = jsonMatch[0];

  // 1단계: 기본 파싱 시도
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    console.log(`[${taskName}] ✅ 1단계 파싱 성공`);
    return parsed;
  } catch {
    console.warn(`[${taskName}] ⚠️ 1단계 파싱 실패, 2단계 시도...`);

    // 2단계: repairJSON 시도
    try {
      const repaired = repairJSON(jsonText);
      const parsed = JSON.parse(repaired) as Record<string, unknown>;
      console.log(`[${taskName}] ✅ 2단계 파싱 성공 (repairJSON)`);
      return parsed;
    } catch {
      console.warn(`[${taskName}] ⚠️ 2단계 파싱 실패, 3단계 LLM 재파싱 시도...`);

      // 3단계: Flash Lite로 재파싱
      if (maxRetries > 0) {
        const fixed = await repairJSONWithFlashLite(jsonText);
        if (fixed) {
          console.log(`[${taskName}] ✅ 3단계 파싱 성공 (LLM 재파싱)`);
          return fixed;
        }
      }
    }
  }

  console.error(`[${taskName}] ❌ 모든 파싱 시도 실패`);
  return null;
}

/**
 * Flash Lite를 사용하여 잘못된 JSON 형식을 수정
 * 원본 내용은 그대로 유지하고 형식만 올바르게 변환
 */
async function repairJSONWithFlashLite(brokenJSON: string): Promise<any | null> {
  if (!ai) return null;

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 2000,
    }
  });

  const prompt = `아래 JSON은 형식 오류가 있습니다. 원본 내용(pcode, reason, highlights 등)을 절대 변경하지 말고, 형식만 수정하여 유효한 JSON으로 만들어주세요.

잘못된 JSON:
${brokenJSON.slice(0, 4000)}

규칙:
1. 내용(텍스트, 숫자, pcode 등)은 절대 변경 금지
2. 잘린 부분은 적절히 닫아서 유효한 JSON으로
3. 불완전한 마지막 객체는 제거 가능
4. JSON만 출력 (설명 없이)

수정된 JSON:`;

  try {
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[repairJSONWithFlashLite] Failed:', e);
  }
  return null;
}

// ============================================================================
// 자유 입력 분석 - 선호 속성 / 피할 단점 분류
// ============================================================================

interface FreeInputAnalysis {
  preferredAttributes: string[];  // 선호하는 속성
  avoidAttributes: string[];      // 피하고 싶은 단점
  usageContext: string | null;    // 사용 맥락 (예: 여행용, 신생아용)
  summary: string;                // 한 줄 요약
}

/**
 * 자유 입력을 분석하여 선호 속성과 피할 단점으로 분류
 * - flash-lite로 빠르게 분석
 * - 사용자의 숨은 니즈를 파악
 */
async function analyzeFreeInput(
  categoryName: string,
  freeInput: string
): Promise<FreeInputAnalysis> {
  const defaultResult: FreeInputAnalysis = {
    preferredAttributes: [],
    avoidAttributes: [],
    usageContext: null,
    summary: freeInput,
  };

  if (!freeInput || freeInput.trim().length < 2) {
    return defaultResult;
  }

  if (!ai) {
    console.log('[analyzeFreeInput] No AI available');
    return defaultResult;
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 500,
    },
  });

  const prompt = `## 역할
사용자가 ${categoryName} 구매 시 추가로 입력한 자유 조건을 분석합니다.

## 사용자 입력
"${freeInput}"

## 분석 규칙
1. **preferredAttributes**: 사용자가 원하는/선호하는 속성 추출
   - 예: "가벼운 게 좋겠어요" → ["경량"]
   - 예: "세척이 편했으면" → ["세척 용이"]
   - 예: "디자인 예쁜 거" → ["디자인 우수"]

2. **avoidAttributes**: 피하고 싶은 단점/특성 추출
   - 예: "소음 심한 건 싫어요" → ["소음"]
   - 예: "무겁지 않았으면" → ["무거움"]
   - 예: "복잡한 건 NO" → ["조작 복잡"]

3. **usageContext**: 특정 사용 맥락이 있다면 추출
   - 예: "여행갈 때 쓸 거예요" → "여행용"
   - 예: "신생아용으로" → "신생아용"
   - 예: "사무실에서" → "사무실용"

4. **summary**: 입력 내용을 자연스러운 한 문장으로 정리

## 응답 형식 (JSON만)
{"preferredAttributes":["속성1","속성2"],"avoidAttributes":["단점1"],"usageContext":"맥락"|null,"summary":"요약문장"}

⚠️ JSON만 응답. 빈 배열도 OK.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as FreeInputAnalysis;
      console.log(`[analyzeFreeInput] Analyzed: preferred=${parsed.preferredAttributes.length}, avoid=${parsed.avoidAttributes.length}, context=${parsed.usageContext}`);
      return {
        preferredAttributes: parsed.preferredAttributes || [],
        avoidAttributes: parsed.avoidAttributes || [],
        usageContext: parsed.usageContext || null,
        summary: parsed.summary || freeInput,
      };
    }
  } catch (error) {
    console.error('[analyzeFreeInput] Analysis failed:', error);
  }

  return defaultResult;
}

// ============================================================================
// 필터 태그 생성 (Flash Lite) - 사용자 응답 기반 태그 생성
// ============================================================================

/**
 * 사용자 응답(collectedInfo)을 필터 태그로 1:1 변환
 * - 각 조건을 개별 태그로 생성 (누락 없음)
 * - LLM은 label(키워드 요약) + keywords(동의어)만 생성
 * - originalCondition에 원본 보존 (평가 정확도 향상)
 */
async function generateFilterTags(
  categoryName: string,
  collectedInfo: Record<string, string>,
  _balanceSelections: BalanceSelection[],  // 현재 미사용 (밸런스 게임 제거됨)
  _negativeSelections: string[],           // PLP 필터 태그에서 제외
  freeInputAnalysis?: FreeInputAnalysis | null  // 🆕 자유 입력 분석 결과도 태그로 변환
): Promise<FilterTag[]> {
  // 무의미한 답변 필터링 (입력 단계 - 완전히 의미 없는 응답만)
  const skipAnswers = ['상관없어요', 'skip', 'any', '', '기타', '없음', '모름', '잘 모르겠어요'];

  // 🆕 무의미한 태그 label 필터링 (출력 단계 - LLM이 그대로 출력한 무의미한 태그)
  const meaninglessLabels = [
    // 단순 긍정/부정 (질문 맥락 없이는 의미 없음)
    '네', '예', '응', '그래요', '맞아요', '좋아요', '괜찮아요', '괜찮음',
    '아니요', '아니오', '아뇨', '별로요',
    '중요해요', '필요해요', '원해요', '있으면 좋겠어요',
    '매우 중요', '매우 중요해요', '중요함', '보통', '상관없음',
    '중요', '필요', '원함', '선호', '좋음', '있음', '없음',
    // 영문
    'yes', 'no', 'ok', 'okay', 'important',
  ];

  // 1. collectedInfo 필터링 (내부 키, 무의미한 응답 제외)
  const filteredEntries = Object.entries(collectedInfo).filter(([question, answer]) => {
    if (question.startsWith('__')) return false;
    if (skipAnswers.includes(answer.trim())) return false;
    return true;
  });

  // 2. 쉼표 답변 분리 (모든 질문에 적용)
  // - 상호배타적 질문(재질, 브랜드): 분리 + 후처리에서 full 1개만 허용
  // - 복수 선택 질문(기능, 특징): 분리 + full 여러 개 허용
  const validEntries: [string, string][] = [];
  for (const [question, answer] of filteredEntries) {
    // 쉼표로 분리 (쉼표, 슬래시 등)
    const parts = answer
      .split(/[,、\/]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !skipAnswers.includes(s));

    if (parts.length > 1) {
      // 분리된 각 항목을 별도 entry로 추가
      console.log(`[FilterTags] 🔀 "${question}" 답변 분리: "${answer}" → ${parts.length}개`);
      for (const part of parts) {
        validEntries.push([question, part]);
      }
    } else {
      validEntries.push([question, answer]);
    }
  }

  if (validEntries.length === 0) {
    console.warn('[FilterTags] ⚠️ No valid conditions to generate tags!');
    console.warn(`[FilterTags] 원본 collectedInfo: ${JSON.stringify(collectedInfo).slice(0, 500)}`);
    console.warn(`[FilterTags] 필터링 후 남은 항목: 0개 (모두 skipAnswers에 해당)`);
    return [];
  }

  // 🆕 무의미한 태그인지 체크하는 헬퍼 함수
  const isMeaninglessTag = (label: string): boolean => {
    const labelLower = label.toLowerCase().trim();
    return meaninglessLabels.some(m =>
      labelLower === m.toLowerCase() || labelLower === m.toLowerCase() + '요'
    );
  };

  // 🆕 label 기준 중복 제거 (첫 번째 것만 유지)
  const deduplicateByLabel = (tags: FilterTag[]): FilterTag[] => {
    const seen = new Set<string>();
    const deduped = tags.filter(tag => {
      const normalizedLabel = tag.label.trim().toLowerCase();
      if (seen.has(normalizedLabel)) return false;
      seen.add(normalizedLabel);
      return true;
    });
    // ID/priority 재부여
    deduped.forEach((tag, i) => {
      tag.id = `tag_${i + 1}`;
      tag.priority = i + 1;
    });
    return deduped;
  };

  // 2. LLM 없으면 fallback (쉼표 분리 없이 원본 그대로) - 무의미한 응답은 제외
  if (!ai) {
    console.log('[FilterTags] No AI available, using answer as label');
    const fallbackTags = validEntries
      .filter(([, answer]) => !isMeaninglessTag(answer))
      .map(([question, answer], i) => ({
        id: `tag_${i + 1}`,
        label: answer.slice(0, 50),
        category: 'feature' as const,
        keywords: [],
        priority: i + 1,
        sourceType: 'collected' as const,
        sourceQuestion: question,
        sourceAnswer: answer,
        originalCondition: `${question}: ${answer}`,
      }));
    console.log(`[FilterTags] Fallback: ${fallbackTags.length} tags (${validEntries.length - fallbackTags.length} filtered as meaningless)`);
    return fallbackTags;
  }

  const model = ai.getGenerativeModel({
    model: FILTER_TAG_MODEL,
    generationConfig: {
      temperature: 0.1, // 🔧 0.3→0.1 (JSON 안정성)
      maxOutputTokens: TOKEN_LIMITS.FILTER_TAGS, // 🆕 2500 (여유 있게)
      responseMimeType: 'application/json',
    },
  });

  // 조건 목록 (인덱스 포함) - 이미 분리된 validEntries 사용
  const conditionList = validEntries
    .map(([question, answer], i) => `${i}: "${question}" → "${answer}"`)
    .join('\n');

  const prompt = `## 역할
${categoryName} 구매 조건들을 **짧은 키워드 태그**로 요약합니다.
각 조건당 1개의 태그를 생성하세요. (이미 분리된 상태)

## 조건 목록 (인덱스: 질문 → 답변)
${conditionList}

## 핵심 규칙
1. **질문+답변 맥락을 파악**해서 의미 있는 태그 생성
   - "소음이 중요한가요?" → "매우 중요" = **"저소음 중시"** (O)
   - "소음이 중요한가요?" → "매우 중요" = "매우 중요" (X, 무의미)
   - "선호 브랜드?" → "삼성" = **"삼성"** (O, 브랜드명 그대로)
   - "재질?" → "실리콘" = **"실리콘 재질"** (O)
   - "용량?" → "3L 이상" = **"대용량 3L+"** (O)

2. label: 2~5단어, **최대 15자** 키워드 형태
   - 브랜드명,  재질/소재는 그대로 사용 (예: "삼성", "LG", "더블하트", "실리콘", "스테인리스")

3. keywords: 리뷰/스펙 검색용 동의어 2~4개
4. category: usage(용도), spec(스펙), feature(기능)
5. sourceIndex: 원본 조건의 인덱스 (각 조건당 1개)

## 🚫 절대 금지
답변을 그대로 태그로 사용하지 마세요. 특히 다음과 같은 무의미한 단어는 **절대 금지**:
- 단순 긍정/부정: "네", "예", "좋아요", "괜찮아요", "괜찮음", "있음", "없음"
- 추상적 표현: "중요", "필요", "원함", "선호", "보통"
→ **반드시 질문 맥락을 반영한 구체적 키워드**로 변환하세요!

## 응답 (JSON만)
{"results":[{"sourceIndex":0,"label":"저소음","keywords":["소음","조용","정숙"],"category":"feature"}]}`;

  try {
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // 디버깅: LLM 원문 응답 (파싱 실패 시 확인용)
    if (text.length < 2000) {
      console.log('[FilterTags] LLM raw response:', text.slice(0, 500));
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = await parseWithRetry(jsonMatch[0], 'FilterTags', 1);
      if (parsed && parsed.results && Array.isArray(parsed.results)) {
        // LLM 응답에서 직접 FilterTag[] 생성
        const rawTags: FilterTag[] = parsed.results.map((item: { sourceIndex?: number; label?: string; keywords?: string[]; category?: string }, i: number) => {
          const sourceIdx = item.sourceIndex ?? i;
          const [question, answer] = validEntries[sourceIdx] || ['', ''];
          return {
            id: `tag_${i + 1}`,
            label: item.label || answer.slice(0, 50),
            category: (item.category || 'feature') as FilterTag['category'],
            keywords: item.keywords || [],
            priority: i + 1,
            sourceType: 'collected' as const,
            sourceQuestion: question,  // 상호 배타성 체크용
            sourceAnswer: answer,
            originalCondition: `${question}: ${answer}`,
          };
        });

        // 🆕 무의미한 태그 필터링 (LLM이 단순 응답을 그대로 출력한 경우)
        const tags = rawTags.filter(tag => {
          if (isMeaninglessTag(tag.label)) {
            console.log(`[FilterTags] ⚠️ 무의미한 태그 제외: "${tag.label}" (원본: ${tag.originalCondition})`);
            return false;
          }
          return true;
        });

        // 🆕 자유 입력 분석 결과도 태그로 추가
        if (freeInputAnalysis) {
          const freeInputTags: FilterTag[] = [];
          
          // preferredAttributes를 태그로 변환
          freeInputAnalysis.preferredAttributes.forEach((attr, i) => {
            freeInputTags.push({
              id: `tag_free_pref_${i + 1}`,
              label: attr,
              category: 'feature' as const,
              keywords: [attr],
              priority: tags.length + i + 1,
              sourceType: 'collected' as const,
              sourceQuestion: '마지막 자유 입력',
              sourceAnswer: attr,
              originalCondition: `자유 입력: ${attr}`,
            });
          });

          if (freeInputTags.length > 0) {
            console.log(`[FilterTags] 🆕 자유 입력에서 ${freeInputTags.length}개 태그 추가: ${freeInputTags.map(t => t.label).join(', ')}`);
            tags.push(...freeInputTags);
          }
        }

        // 🆕 label 기준 중복 제거 + ID 재부여
        const dedupedTags = deduplicateByLabel(tags);
        const dupCount = tags.length - dedupedTags.length;

        console.log(`[FilterTags] Generated ${dedupedTags.length} tags (${rawTags.length - tags.length} meaningless, ${dupCount} duplicates) from ${validEntries.length} conditions in ${Date.now() - startTime}ms`);
        return dedupedTags;
      }
    }
  } catch (error) {
    console.error('[FilterTags] ❌ LLM error, using fallback labels:', error);
    console.error(`[FilterTags] 입력 조건 수: ${validEntries.length}, 카테고리: ${categoryName}`);
  }

  // Fallback: 원본 그대로 - 무의미한 응답은 제외
  const fallbackTags: FilterTag[] = validEntries
    .filter(([, answer]) => !isMeaninglessTag(answer))
    .map(([question, answer], i) => ({
      id: `tag_${i + 1}`,
      label: answer.slice(0, 50),
      category: 'feature' as const,
      keywords: [],
      priority: i + 1,
      sourceType: 'collected' as const,
      sourceQuestion: question,
      sourceAnswer: answer,
      originalCondition: `${question}: ${answer}`,
    }));

  // 🆕 자유 입력 분석 결과도 태그로 추가 (fallback에서도)
  if (freeInputAnalysis) {
    freeInputAnalysis.preferredAttributes.forEach((attr, i) => {
      fallbackTags.push({
        id: `tag_free_pref_${i + 1}`,
        label: attr,
        category: 'feature' as const,
        keywords: [attr],
        priority: fallbackTags.length + i + 1,
        sourceType: 'collected' as const,
        sourceQuestion: '마지막 자유 입력',
        sourceAnswer: attr,
        originalCondition: `자유 입력: ${attr}`,
      });
    });

    if (freeInputAnalysis.preferredAttributes.length > 0) {
      console.log(`[FilterTags] 🆕 자유 입력에서 ${freeInputAnalysis.preferredAttributes.length}개 태그 추가 (fallback)`);
    }
  }

  // 🆕 label 기준 중복 제거 + ID 재부여
  const dedupedFallback = deduplicateByLabel(fallbackTags);
  const dupCount = fallbackTags.length - dedupedFallback.length;

  console.log(`[FilterTags] LLM fallback: ${dedupedFallback.length} tags (${validEntries.length - fallbackTags.length} meaningless, ${dupCount} duplicates)`);
  return dedupedFallback;
}

// ============================================================================
// 🆕 태그 충족도 평가 (LLM 기반)
// ============================================================================

import type { ProductTagScores, TagScore } from '@/lib/knowledge-agent/types';

/**
 * 리뷰에서 골고루 샘플링 (별점 높음/낮음/최신 순)
 */
function sampleReviewsForEvaluation(reviews: ReviewLite[], maxCount: number = 20): ReviewLite[] {
  if (reviews.length <= maxCount) return reviews;

  const sorted = [...reviews];
  
  // 별점 높은 순 상위 7개
  const highRated = [...sorted].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 7);
  
  // 별점 낮은 순 상위 7개
  const lowRated = [...sorted].sort((a, b) => (a.rating || 0) - (b.rating || 0)).slice(0, 7);
  
  // 최신순 6개 (날짜 없으면 마지막 6개)
  const recent = sorted.slice(-6);
  
  // 중복 제거하며 병합
  const seen = new Set<string>();
  const result: ReviewLite[] = [];
  
  for (const review of [...highRated, ...lowRated, ...recent]) {
    if (!seen.has(review.reviewId) && result.length < maxCount) {
      seen.add(review.reviewId);
      result.push(review);
    }
  }
  
  return result;
}

/**
 * 제품별 태그 충족도를 LLM으로 평가 (product-analysis 스타일)
 * - 스펙 + 리뷰 기반 상세 평가
 * - full/partial/null 3단계 + evidence 문장
 * - PDP에서 재사용 가능한 상세 근거 포함
 */
async function evaluateTagScoresForProducts(
  products: Array<{ pcode: string; product: HardCutProduct }>,
  tags: FilterTag[],
  reviews: Record<string, ReviewLite[]>,
  categoryName: string
): Promise<Record<string, ProductTagScores>> {
  if (!ai || tags.length === 0 || products.length === 0) {
    return {};
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: TOKEN_LIMITS.TAG_EVALUATION, // 🆕 8000 (여유 있게)
      responseMimeType: 'application/json',
    },
  });

  // 각 제품에 대한 평가 데이터 구성
  const productInfos = products.map(({ pcode, product }) => {
    const productReviews = reviews[pcode] || [];
    const sampledReviews = sampleReviewsForEvaluation(productReviews, 15);

    // 리뷰 상세 포맷 (product-analysis 스타일)
    const reviewStr = sampledReviews.length > 0
      ? sampledReviews.map((r, i) =>
          `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 120)}${r.content.length > 120 ? '...' : ''}"`
        ).join('\n')
      : '리뷰 없음';

    return {
      pcode,
      name: product.name,
      brand: product.brand,
      price: product.price,
      specs: product.specs || {},
      specSummary: product.specSummary || '',
      reviewStr,
    };
  });

  // 태그를 조건 형태로 변환 (sourceType별로 구분)
  const tagConditions = tags.map(t => {
    const conditionType = t.sourceType === 'balance' ? 'balance' :
                          t.sourceType === 'negative' ? 'negative' : 'hardFilter';
    return `- ${t.id}: "${t.originalCondition || t.label}" (${conditionType})`;
  }).join('\n');

  const prompt = `당신은 ${categoryName} 전문 큐레이터입니다.
사용자가 선택한 조건들을 각 제품이 얼마나 충족하는지 분석해주세요.

## 평가할 조건 목록
${tagConditions}

## 제품 정보
${productInfos.map((p, i) => `
### 제품 ${i + 1}: ${p.pcode}
- 제품명: ${p.name}
- 브랜드: ${p.brand || '미상'}
- 가격: ${p.price ? `${p.price.toLocaleString()}원` : '미정'}
- 스펙: ${p.specSummary?.slice(0, 400) || JSON.stringify(p.specs).slice(0, 400)}

리뷰:
${p.reviewStr}
`).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## evidence 작성 규칙 (매우 중요!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

evidence는 PDP의 "주요 포인트" (선호속성/피할단점) 섹션에 표시됩니다.
**제품의 특성과 이점을 실제 스펙/리뷰 근거와 함께 자세히 설명하세요. 사용자 조건을 반복하지 마세요.**

### 작성 원칙
1. **2문장으로 작성** - 첫 문장: 핵심 특성, 두 번째 문장: 구체적 근거/리뷰
2. **제품 관점**으로 작성 - "이 제품은 ~해요" 형식
3. **이점 중심** - 스펙만 나열하지 말고 사용자가 얻는 이점 설명
4. **구체적 근거 포함** - 스펙 수치, 리뷰 인용구, 기술명 등 구체적으로
5. **자연스러운 톤** - 전문적이면서도 친근하게
6. 근거가 없으면 절대 추측하지 말고, "확인 필요" 문장 사용

### ✅ Good Examples (반드시 이 형식으로!)
- "IH 압력 방식으로 빠르고 균일하게 가열돼요. 리뷰에서도 '밥이 고르게 익어 맛있다'는 평가가 많습니다."
- "에코 스테인리스 내솥을 사용해 내구성이 뛰어나요. 코팅이 벗겨질 걱정 없이 오래 사용할 수 있습니다."
- "10인용 대용량으로 대가족도 충분히 사용할 수 있어요. 실제 리뷰에서 '한번에 많이 지어도 문제없다'는 의견이 많습니다."
- "쿠쿠전자의 프리미엄 라인으로 품질이 검증됐어요. A/S도 전국 서비스센터에서 신속하게 받을 수 있습니다."
- "저소음 설계로 조용한 사용 환경을 제공해요. 리뷰에서 '밤에 사용해도 아기가 안 깬다'는 평가가 다수 있습니다."

### ❌ Bad Examples (절대 금지!)
- "IH 압력밥솥 방식을 선호하시는군요. 이 제품은 IH 압력밥솥입니다." ← 사용자 조건 반복
- "10인용을 찾으시는군요. 이 제품은 10인용입니다." ← 기계적 나열
- "IH 압력밥솥입니다." ← 이점 없이 스펙만 나열 (1문장)
- "좋은 제품입니다. 추천합니다." ← 근거 없음
- "사용자가 선택한 조건을 충족합니다." ← 너무 일반적
- "~하시는군요", "~를 원하시는군요" ← 이런 표현 사용 금지

### 근거 부족 시
- status: "partial" 또는 null
- evidence: "상세 스펙에서 확인이 어려워요."

## 평가 기준
- **"full"**: 스펙/리뷰에서 명확히 확인됨 → 충족/회피됨
- **"partial"**: 부분적으로 해당되거나 조건부
- **null**: 관련 없거나 충족 못함/회피 안됨

### 💰 예산/가격 조건 평가 (매우 중요!)
예산 관련 조건은 **단순 숫자 비교**입니다. 반드시 정확하게 비교하세요:

**핵심 규칙:**
- "N만원 이하" 조건: 제품 가격 ≤ N만원 → "full" ✅ | 제품 가격 > N만원 → null ❌
- "N만원 이상" 조건: 제품 가격 ≥ N만원 → "full" ✅ | 제품 가격 < N만원 → null ❌
- "N~M만원" 범위 조건: N ≤ 제품 가격 ≤ M → "full" ✅ | 범위 밖 → null ❌

**예시 1: 예산 이하 조건**
- 조건: "예산: 77만원 이하"
- 제품 가격: 613,480원 (약 61만원)
- 판단: 61만원 < 77만원 → "full" ✅
- evidence: "제품 가격 613,480원으로 희망 예산 77만원 이하에 충분히 여유 있게 들어와요."

**예시 2: 예산 초과**
- 조건: "예산: 50만원 이하"
- 제품 가격: 720,000원 (72만원)
- 판단: 72만원 > 50만원 → null ❌
- evidence: "제품 가격 720,000원으로 희망 예산 50만원을 약 22만원 초과해요."

**⚠️ 흔한 실수 (절대 금지!):**
- 더 저렴한 제품을 "예산 초과"라고 판단 ← 숫자 비교 오류!
- "이하"와 "이상"을 혼동
- 원/만원 단위 혼동 (100만원 = 1,000,000원)

### ⚠️ 상호 배타적 조건 처리 (중요!)
같은 질문의 서로 다른 답변 값들은 **물리적으로 동시에 만족 불가능**합니다.

**핵심 규칙:**
- originalCondition의 질문 부분(콜론 앞)이 같으면 → 상호 배타적
- 하나의 제품이 여러 값을 동시에 가질 수 없는 속성 (크기, 재질, 용량 등)
- **하나만 "full"**, 나머지는 null

**예시 1: 재질 (물리적으로 동시 불가)**
- 조건: "재질: 실리콘", "재질: 원목"
- 제품: 실리콘 치발기
  • "재질: 실리콘" → "full" ✅ (스펙: 실리콘 소재)
  • "재질: 원목" → null ❌ (원목이 아님)
- ⚠️ 잘못된 평가: 둘 다 "full" (물리적으로 불가능!)

**예시 2: 크기/용량 (정확히 일치만)**
- 조건: "화면 크기: 27인치", "화면 크기: 32인치"
- 제품: 27인치 모니터
  • "화면 크기: 27인치" → "full" ✅
  • "화면 크기: 32인치" → null ❌ (32인치가 아님)

**예시 3: 용도 (복수 가능, 예외 케이스)**
- 조건: "사용 장소: 거실", "사용 장소: 안방"
- 제품: 이동식 가습기
  • "사용 장소: 거실" → "full" ✅ (이동 가능)
  • "사용 장소: 안방" → "full" ✅ (이동 가능)
- ✅ 용도/장소는 동시 만족 가능 (제품 자체 속성이 아님)

⚠️ negative(피할 단점) 조건의 경우:
- "full" = 해당 단점이 없음 (회피 성공)
- "partial" = 일부 있지만 심하지 않음
- null = 해당 단점이 있음 (회피 실패)

## 응답 형식 (JSON)
{
  "evaluations": {
    "제품pcode": {
      "태그id": { "score": "full" | "partial" | null, "evidence": "근거 문장 (score가 null이면 생략)" },
      ...
    },
    ...
  }
}

⚠️ 주의:
- 근거 없이 추측 금지, evidence에 이모티콘/볼드 금지
- **score가 null(불충족/회피안됨)인 경우 evidence 필드 생략** (토큰 절약)`;

  try {
    const startTime = Date.now();

    // 🆕 재시도 로직 추가 (503 에러 대응)
    let result;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        result = await model.generateContent(prompt);
        break; // 성공하면 루프 종료
      } catch (err: unknown) {
        lastError = err;
        const errObj = err as { status?: number; message?: string };
        if (attempt < 3 && (errObj?.status === 503 || errObj?.message?.includes('503'))) {
          console.log(`[TagScores] 재시도 ${attempt}/3 (503 에러)`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // 점진적 대기
          continue;
        }
        throw err;
      }
    }

    if (!result) {
      throw lastError || new Error('TagScores 생성 실패');
    }

    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // 🆕 3단계 재시도 파싱
    const parsed = await parseWithRetry(text, 'TagScores', 1);
    if (parsed) {
      const evaluations = parsed.evaluations || parsed;

      // 태그 ID → conditionType 매핑
      const tagTypeMap: Record<string, 'hardFilter' | 'balance' | 'negative'> = {};
      tags.forEach(t => {
        tagTypeMap[t.id] = t.sourceType === 'balance' ? 'balance' :
                          t.sourceType === 'negative' ? 'negative' : 'hardFilter';
      });

      // 결과를 ProductTagScores 형식으로 변환 (evidence 포함)
      const tagScoresMap: Record<string, ProductTagScores> = {};

      for (const [pcode, scores] of Object.entries(evaluations)) {
        tagScoresMap[pcode] = {};
        for (const [tagId, scoreData] of Object.entries(scores as Record<string, any>)) {
          // scoreData가 객체인 경우 (새 형식)
          if (typeof scoreData === 'object' && scoreData !== null) {
            const normalizedScore: TagScore =
              scoreData.score === 'full' ? 'full' :
              scoreData.score === 'partial' ? 'partial' :
              null;

            if (normalizedScore !== null) {
              tagScoresMap[pcode][tagId] = {
                score: normalizedScore,
                evidence: scoreData.evidence || undefined,
                conditionType: tagTypeMap[tagId] || 'hardFilter',
              };
            }
          }
          // scoreData가 문자열인 경우 (레거시 형식 호환)
          else if (typeof scoreData === 'string') {
            const normalizedScore: TagScore =
              scoreData === 'full' ? 'full' :
              scoreData === 'partial' ? 'partial' :
              null;

            if (normalizedScore !== null) {
              tagScoresMap[pcode][tagId] = {
                score: normalizedScore,
                conditionType: tagTypeMap[tagId] || 'hardFilter',
              };
            }
          }
        }
      }

      // 디버깅: 각 제품별 태그 점수 요약
      for (const [pcode, scores] of Object.entries(tagScoresMap)) {
        const scoreList = Object.entries(scores).map(([tagId, data]) =>
          `${tagId}:${(data as { score: string }).score}`
        );
        console.log(`[TagScores] ${pcode}: ${scoreList.join(', ') || '(없음)'}`);
      }
      console.log(`[TagScores] ✅ 상세 평가 완료 (${Date.now() - startTime}ms): ${Object.keys(tagScoresMap).length}개 제품`);
      return tagScoresMap;
    }
  } catch (error) {
    console.error('[TagScores] 평가 실패:', error);
  }

  return {};
}

// ============================================================================
// 🆕 상호 배타적 태그 후처리 (같은 질문에서 나온 태그 중 full은 1개만 허용)
// ============================================================================

// 🆕 LLM 판단 결과 캐시 (세션 내 중복 호출 방지)
const exclusivityCache = new Map<string, boolean>();

/**
 * 🆕 LLM에게 상호 배타성 판단 요청 (Flash 2.5 Lite - 빠르고 저렴)
 * - 질문과 답변들을 보고 "하나의 제품이 여러 값을 동시에 가질 수 있는가?" 판단
 */
async function checkExclusivityWithLLM(question: string, answers: string[]): Promise<boolean> {
  const cacheKey = `${question}:${answers.sort().join(',')}`;
  
  // 캐시 확인
  if (exclusivityCache.has(cacheKey)) {
    return exclusivityCache.get(cacheKey)!;
  }

  // LLM 없으면 기본값 (상호 배타적으로 가정)
  if (!ai) {
    return true;
  }

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 50,
      },
    });

    const prompt = `질문: "${question}"
답변 옵션들: ${answers.map(a => `"${a}"`).join(', ')}

위 질문의 답변들이 **상호 배타적**인가요? 
(= 하나의 제품이 여러 값을 동시에 가질 수 없는가?)

예시:
- "팬티형, 밴드형" → YES (기저귀는 둘 중 하나만 가능)
- "블루투스, 동글" → NO (키보드가 둘 다 지원 가능)
- "실리콘, 스테인리스" → YES (재질은 하나만 가능)
- "거실용, 안방용" → NO (같은 제품을 여러 장소에서 사용 가능)

한 단어로만 답변: YES 또는 NO`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().toUpperCase();
    const isExclusive = text.includes('YES');

    console.log(`[Exclusivity LLM] "${question}" [${answers.join(', ')}] → ${isExclusive ? '상호배타적' : '복수가능'}`);

    // 캐시 저장
    exclusivityCache.set(cacheKey, isExclusive);
    return isExclusive;

  } catch (error) {
    console.error('[Exclusivity LLM] Error:', error);
    // 에러 시 보수적으로 상호 배타적으로 처리
    return true;
  }
}

/**
 * 제품 정보에서 특정 키워드 매칭 점수 계산
 * - 제품명, 브랜드, 스펙에서 키워드가 얼마나 매칭되는지 확인
 */
function calculateKeywordMatchScore(
  product: HardCutProduct,
  tag: FilterTag
): number {
  let score = 0;
  const searchTexts = [
    product.name?.toLowerCase() || '',
    product.brand?.toLowerCase() || '',
    product.specSummary?.toLowerCase() || '',
    JSON.stringify(product.specs || {}).toLowerCase(),
  ].join(' ');

  // sourceAnswer에서 키워드 추출 (쉼표로 분리된 경우도 처리)
  const answerKeywords = (tag.sourceAnswer || tag.label || '')
    .toLowerCase()
    .split(/[,、\/]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // 각 키워드가 제품 정보에 있는지 확인
  for (const keyword of answerKeywords) {
    if (searchTexts.includes(keyword)) {
      score += 10;  // 정확 매칭
    }
  }

  // keywords 배열도 확인
  for (const keyword of (tag.keywords || [])) {
    if (searchTexts.includes(keyword.toLowerCase())) {
      score += 5;  // 동의어 매칭
    }
  }

  return score;
}

/**
 * 🆕 상호 배타적 태그 충족도 후처리 (LLM 기반 판단)
 * - 같은 sourceQuestion을 가진 태그들 중 LLM이 상호 배타적이라고 판단하면 full 1개만 유지
 * - 복수 선택 가능한 경우 (블루투스+동글 등) 여러 개 허용
 */
async function enforceTagExclusivity(
  tagScoresMap: Record<string, ProductTagScores>,
  tags: FilterTag[],
  products: HardCutProduct[]
): Promise<Record<string, ProductTagScores>> {
  // 제품 pcode → HardCutProduct 매핑
  const productMap = new Map(products.map(p => [p.pcode, p]));

  // sourceQuestion 기준으로 그룹화 (2개 이상 태그가 있는 그룹만)
  const questionGroups = new Map<string, FilterTag[]>();
  for (const tag of tags) {
    const question = tag.sourceQuestion || '';
    if (!question) continue;

    if (!questionGroups.has(question)) {
      questionGroups.set(question, []);
    }
    questionGroups.get(question)!.push(tag);
  }

  // 2개 이상 태그가 있는 그룹만 필터
  const candidateGroups = Array.from(questionGroups.entries())
    .filter(([, groupTags]) => groupTags.length > 1);

  if (candidateGroups.length === 0) {
    return tagScoresMap;
  }

  // 🆕 각 그룹에 대해 LLM으로 상호 배타성 판단 (병렬 처리)
  const exclusivityResults = await Promise.all(
    candidateGroups.map(async ([question, groupTags]) => {
      const answers = groupTags.map(t => t.sourceAnswer || t.label);
      const isExclusive = await checkExclusivityWithLLM(question, answers);
      return { question, groupTags, isExclusive };
    })
  );

  // 상호 배타적 그룹만 필터
  const exclusiveGroups = exclusivityResults.filter(r => r.isExclusive);

  if (exclusiveGroups.length === 0) {
    console.log(`[TagExclusivity] ✅ 상호 배타적 그룹 없음 (${candidateGroups.length}개 그룹 모두 복수 선택 가능)`);
    return tagScoresMap;
  }

  console.log(`[TagExclusivity] 🔍 ${exclusiveGroups.length}개 상호 배타적 그룹 발견 (총 ${candidateGroups.length}개 중)`);

  // 각 제품에 대해 후처리
  const result: Record<string, ProductTagScores> = JSON.parse(JSON.stringify(tagScoresMap));

  for (const [pcode, scores] of Object.entries(result)) {
    const product = productMap.get(pcode);
    if (!product) continue;

    for (const { question, groupTags } of exclusiveGroups) {
      // 이 그룹에서 full인 태그들 찾기
      const fullTags = groupTags.filter(tag =>
        scores[tag.id]?.score === 'full'
      );

      // full이 1개 이상 있으면, 같은 그룹의 partial 태그도 제거 (상호 배타적이므로)
      if (fullTags.length >= 1) {
        const partialTags = groupTags.filter(tag =>
          scores[tag.id]?.score === 'partial'
        );
        
        if (partialTags.length > 0) {
          console.log(`[TagExclusivity] 🧹 ${pcode}: "${question}" 그룹에서 full 존재 → partial ${partialTags.length}개 제거`);
          for (const tag of partialTags) {
            console.log(`[TagExclusivity] ❌ partial 제거: "${tag.label}"`);
            delete result[pcode][tag.id];
          }
        }
      }

      if (fullTags.length <= 1) {
        continue;  // full이 0~1개면 더 이상 처리 불필요
      }

      // full이 2개 이상 → 가장 적합한 1개만 남기기
      console.log(`[TagExclusivity] ⚠️ ${pcode}: "${question}" 그룹에서 full ${fullTags.length}개 발견`);

      // 키워드 매칭 점수로 정렬
      const tagScoresPairs = fullTags.map(tag => ({
        tag,
        matchScore: calculateKeywordMatchScore(product, tag),
      }));
      tagScoresPairs.sort((a, b) => b.matchScore - a.matchScore);

      // 가장 높은 점수의 태그만 full 유지, 나머지는 null로 변경
      const [winner, ...losers] = tagScoresPairs;

      console.log(`[TagExclusivity] ✅ 선택: "${winner.tag.label}" (점수: ${winner.matchScore})`);

      for (const { tag } of losers) {
        console.log(`[TagExclusivity] ❌ 제거: "${tag.label}"`);
        delete result[pcode][tag.id];  // null 대신 삭제 (UI에 표시 안 함)
      }
    }
  }

  return result;
}

/**
 * 리뷰에서 주요 키워드 추출
 */
function extractReviewKeywords(reviews: ReviewLite[]): {
  pros: string[];
  cons: string[];
} {
  const positiveKeywords = ['좋아요', '만족', '추천', '최고', '깨끗', '편리', '빠르', '조용', '예쁘', '튼튼', '가성비'];
  const negativeKeywords = ['아쉽', '불편', '소음', '느리', '비싸', '별로', '실망', '고장', '뜨겁', '무거', '작음'];

  const prosFound = new Set<string>();
  const consFound = new Set<string>();

  for (const review of reviews) {
    const content = review.content.toLowerCase();
    for (const kw of positiveKeywords) {
      if (content.includes(kw)) prosFound.add(kw);
    }
    for (const kw of negativeKeywords) {
      if (content.includes(kw)) consFound.add(kw);
    }
  }

  return {
    pros: Array.from(prosFound),
    cons: Array.from(consFound),
  };
}

/**
 * 리뷰 기반 fallback 장단점 생성
 * - 키워드/자주 언급 특징/리뷰 지표를 활용해 최소 3/2개 확보
 */
function buildFallbackProsCons(reviews: ReviewLite[]): {
  pros: string[];
  cons: string[];
} {
  const { pros: keywordPros, cons: keywordCons } = extractReviewKeywords(reviews);
  const qualitative = analyzeReviewsQualitative(reviews);
  const mentions = qualitative.topMentions || [];

  const pros: string[] = [];
  const cons: string[] = [];

  const pushUnique = (list: string[], text?: string) => {
    if (!text) return;
    if (!list.includes(text)) list.push(text);
  };

  keywordPros.forEach((kw) => {
    pushUnique(pros, `**${kw}**: 긍정적으로 언급돼요`);
  });
  mentions.forEach((m) => {
    pushUnique(pros, `**${m}**: 리뷰에서 자주 언급돼요`);
  });
  if (pros.length < 3 && qualitative.avgRating >= 4) {
    pushUnique(pros, `**만족도**: 평균 ${qualitative.avgRating}점으로 평가가 좋아요`);
  }
  if (pros.length < 3 && qualitative.sentimentScore > 0.1) {
    pushUnique(pros, `**호평**: 긍정 의견이 더 많아요`);
  }
  if (pros.length < 3) {
    pushUnique(pros, `**사용경험**: 실제 사용 후기가 꾸준히 있어요`);
  }

  keywordCons.forEach((kw) => {
    pushUnique(cons, `**${kw}**: 아쉽다는 의견이 있어요`);
  });
  if (cons.length < 2 && qualitative.sentimentScore < -0.1) {
    pushUnique(cons, `**호불호**: 만족도 편차가 있어요`);
  }
  if (cons.length < 2) {
    pushUnique(cons, `**개인차**: 사용감은 아기마다 다를 수 있어요`);
  }
  mentions.forEach((m) => {
    if (cons.length < 2) {
      pushUnique(cons, `**${m}**: 사용감 의견이 나뉘어요`);
    }
  });
  if (cons.length < 2) {
    pushUnique(cons, `**선택 팁**: 사용 환경에 따라 달라질 수 있어요`);
  }

  return {
    pros: pros.slice(0, 3),
    cons: cons.slice(0, 2),
  };
}

/**
 * 리뷰 정성적 분석 (심층 분석)
 * - 별점 분포
 * - 긍정/부정 감정 비율
 * - 자주 언급되는 구체적 내용
 * - 리뷰 신뢰도 지표
 */
function analyzeReviewsQualitative(reviews: ReviewLite[]): {
  avgRating: number;
  ratingDistribution: Record<number, number>;
  sentimentScore: number; // -1 ~ 1
  topMentions: string[]; // 가장 많이 언급된 구체적 특징
  reliabilityScore: number; // 리뷰 신뢰도 (0~1)
  keyInsights: string[]; // 핵심 인사이트 문장
} {
  if (reviews.length === 0) {
    return {
      avgRating: 0,
      ratingDistribution: {},
      sentimentScore: 0,
      topMentions: [],
      reliabilityScore: 0,
      keyInsights: [],
    };
  }

  // 1. 별점 분포 & 평균
  const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;
  reviews.forEach(r => {
    const rating = Math.min(5, Math.max(1, Math.round(r.rating)));
    ratingDistribution[rating] = (ratingDistribution[rating] || 0) + 1;
    totalRating += r.rating;
  });
  const avgRating = totalRating / reviews.length;

  // 2. 감정 분석 (간단한 키워드 기반)
  const positiveWords = ['좋', '만족', '추천', '최고', '훌륭', '편리', '깨끗', '빠르', '조용', '예쁘', '튼튼', '가성비', '완벽', '대박', '굿', '굳', '짱', '최애'];
  const negativeWords = ['아쉽', '불편', '소음', '느리', '비싸', '별로', '실망', '고장', '뜨겁', '무거', '작', '냄새', '누수', '불량', '최악', '후회', '환불'];

  let positiveCount = 0;
  let negativeCount = 0;
  const mentionCounter: Record<string, number> = {};
  const keyInsights: string[] = [];

  // 구체적 특징 추출 패턴
  const featurePatterns = [
    /(\d+(?:ml|l|리터|kg|g|w|시간|분))/gi, // 수치 + 단위
    /(세척|청소|분해|조립|설치|배송|소음|무게|크기|용량|전력|배터리|충전)/gi, // 기능 키워드
  ];

  reviews.forEach(r => {
    const content = r.content.toLowerCase();

    // 긍정/부정 카운트
    positiveWords.forEach(w => {
      if (content.includes(w)) positiveCount++;
    });
    negativeWords.forEach(w => {
      if (content.includes(w)) negativeCount++;
    });

    // 구체적 특징 추출
    featurePatterns.forEach(pattern => {
      const matches = r.content.match(pattern);
      if (matches) {
        matches.forEach(m => {
          const key = m.toLowerCase();
          mentionCounter[key] = (mentionCounter[key] || 0) + 1;
        });
      }
    });

    // 핵심 인사이트 추출 (50자 이상, 높은 평점 또는 낮은 평점)
    if (r.content.length > 50) {
      if (r.rating >= 4.5) {
        const snippet = r.content.slice(0, 60).replace(/\n/g, ' ');
        if (!keyInsights.some(i => i.includes(snippet.slice(0, 20)))) {
          keyInsights.push(`[👍${r.rating}점] ${snippet}...`);
        }
      } else if (r.rating <= 2.5) {
        const snippet = r.content.slice(0, 60).replace(/\n/g, ' ');
        if (!keyInsights.some(i => i.includes(snippet.slice(0, 20)))) {
          keyInsights.push(`[⚠️${r.rating}점] ${snippet}...`);
        }
      }
    }
  });

  // 감정 점수 계산 (-1 ~ 1)
  const totalSentiment = positiveCount + negativeCount;
  const sentimentScore = totalSentiment > 0
    ? (positiveCount - negativeCount) / totalSentiment
    : 0;

  // 상위 언급 특징
  const topMentions = Object.entries(mentionCounter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key]) => key);

  // 리뷰 신뢰도 (리뷰 수, 내용 길이, 별점 분포 다양성 기반)
  const hasVariedRatings = Object.values(ratingDistribution).filter(v => v > 0).length >= 3;
  const avgContentLength = reviews.reduce((sum, r) => sum + r.content.length, 0) / reviews.length;
  const reliabilityScore = Math.min(1, (
    (reviews.length >= 5 ? 0.3 : reviews.length * 0.06) +
    (hasVariedRatings ? 0.3 : 0.1) +
    (avgContentLength > 50 ? 0.4 : avgContentLength * 0.008)
  ));

  return {
    avgRating: Math.round(avgRating * 10) / 10,
    ratingDistribution,
    sentimentScore: Math.round(sentimentScore * 100) / 100,
    topMentions,
    reliabilityScore: Math.round(reliabilityScore * 100) / 100,
    keyInsights: keyInsights.slice(0, 3),
  };
}

// ============================================================================
// 장단점 리스트 생성 - Flash Lite 사용
// ============================================================================

interface ProductProsConsResult {
  pcode: string;
  pros: string[];
  cons: string[];
}

async function generateProsConsForProducts(
  products: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  categoryName: string
): Promise<ProductProsConsResult[]> {
  if (!ai || products.length === 0) return [];

  const model = ai.getGenerativeModel({
    model: PROS_CONS_MODEL,
    generationConfig: { temperature: 0.3, maxOutputTokens: 4000 },  // 5개 제품 장단점 생성에 충분
  });

  // 각 제품별 정보 + 리뷰 정성 분석 구성
  const productInfos = products.map((p) => {
    const productReviews = reviews[p.pcode] || [];
    const qualitative = analyzeReviewsQualitative(productReviews);

    // 리뷰 원문 (최대 7개로 확대)
    const reviewTexts = productReviews.slice(0, 7).map((r, i) =>
      `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 100)}${r.content.length > 100 ? '...' : ''}"`
    ).join('\n');

    return `### ${p.brand} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString()}원
- 스펙: ${p.specSummary || '정보 없음'}
- 리뷰 분석: 평균 ${qualitative.avgRating}점
- 자주 언급: ${qualitative.topMentions.join(', ') || '없음'}
- 리뷰 원문:
${reviewTexts || '(리뷰 없음)'}`;
  }).join('\n\n');

  const prompt = `## 역할
${categoryName} 전문가로서 **실제 리뷰 내용을 기반**으로 각 상품의 장단점을 정리합니다.

## 상품 + 리뷰 정보
${productInfos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ✍️ 작성 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 장점 (pros) - 3가지
- **사용자가 얻게 되는 구체적 이익(Benefit)**을 작성
- **형식:** "**키워드**: 구체적 설명" (예: "**압도적 분사력**: 거실 전체가 금방 촉촉해져요")

### 단점 (cons) - 2가지
- **"구매 전 고려해야 할 현실적 특징(Trade-off)"**으로 작성
- **형식:** "**키워드**: 구체적 설명" (예: "**소음**: 터보 모드에서는 팬 소리가 들릴 수 있어요")

## 📤 응답 JSON
{
  "results": [
    {
      "pcode": "상품코드",
      "pros": ["**키워드**: 장점1", "**키워드**: 장점2", "**키워드**: 장점3"],
      "cons": ["**키워드**: 고려사항1", "**키워드**: 고려사항2"]
    }
  ]
}

⚠️ JSON만 출력
⚠️ 반드시 모든 제품(${products.length}개)에 대해 생성
⚠️ 리뷰에 언급 없는 내용은 작성 금지`;

        const fallbackResults = products.map(p => {
          const { pros, cons } = buildFallbackProsCons(reviews[p.pcode] || []);
          return {
            pcode: p.pcode,
            pros,
            cons,
          };
        });

  const normalizeResults = (results: ProductProsConsResult[]) => {
    return products.map((product, index) => {
      const match = results.find((result) => String(result?.pcode) === String(product.pcode));
      if (!match) {
        return fallbackResults[index];
      }

          const nextPros = Array.isArray(match.pros) ? match.pros.filter(Boolean) : [];
          const nextCons = Array.isArray(match.cons) ? match.cons.filter(Boolean) : [];

          return {
            pcode: product.pcode,
            pros: nextPros.length > 0 ? nextPros : fallbackResults[index].pros,
            cons: nextCons.length > 0 ? nextCons : fallbackResults[index].cons,
          };
    });
  };

  try {
    console.log('[Pros/Cons] Generating for products...');
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = await parseWithRetry(jsonMatch[0], 'ProsCons', 1);
      if (parsed && parsed.results && Array.isArray(parsed.results)) {
        const initialResults = parsed.results as ProductProsConsResult[];
        const initialMap = new Map(initialResults.map(r => [String(r?.pcode), r]));
        const missingProducts = products.filter(p => !initialMap.has(String(p.pcode)));

        if (missingProducts.length > 0) {
          console.warn(`[Pros/Cons] Missing ${missingProducts.length}/${products.length} products, retrying for missing only...`);
          const missingInfos = missingProducts.map((p) => {
            const productReviews = reviews[p.pcode] || [];
            const qualitative = analyzeReviewsQualitative(productReviews);
            const reviewTexts = productReviews.slice(0, 7).map((r, i) =>
              `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 100)}${r.content.length > 100 ? '...' : ''}"`
            ).join('\n');
            return `### ${p.brand} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString()}원
- 스펙: ${p.specSummary || '정보 없음'}
- 리뷰 분석: 평균 ${qualitative.avgRating}점
- 자주 언급: ${qualitative.topMentions.join(', ') || '없음'}
- 리뷰 원문:
${reviewTexts || '(리뷰 없음)'}`;
          }).join('\n\n');

          const missingPrompt = `## 역할
${categoryName} 전문가로서 **실제 리뷰 내용을 기반**으로 각 상품의 장단점을 정리합니다.

## 상품 + 리뷰 정보
${missingInfos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## ✍️ 작성 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### 장점 (pros) - 3가지
- **사용자가 얻게 되는 구체적 이익(Benefit)**을 작성
- **형식:** "**키워드**: 구체적 설명" (예: "**압도적 분사력**: 거실 전체가 금방 촉촉해져요")

### 단점 (cons) - 2가지
- **"구매 전 고려해야 할 현실적 특징(Trade-off)"**으로 작성
- **형식:** "**키워드**: 구체적 설명" (예: "**소음**: 터보 모드에서는 팬 소리가 들릴 수 있어요")

## 📤 응답 JSON
{
  "results": [
    {
      "pcode": "상품코드",
      "pros": ["**키워드**: 장점1", "**키워드**: 장점2", "**키워드**: 장점3"],
      "cons": ["**키워드**: 고려사항1", "**키워드**: 고려사항2"]
    }
  ]
}

⚠️ JSON만 출력
⚠️ 반드시 모든 제품(${missingProducts.length}개)에 대해 생성
⚠️ 리뷰에 언급 없는 내용은 작성 금지`;

          try {
            const missingResult = await model.generateContent(missingPrompt);
            let missingText = missingResult.response.text().trim();
            missingText = missingText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
            const missingMatch = missingText.match(/\{[\s\S]*\}/);
            if (missingMatch) {
              const missingParsed = await parseWithRetry(missingMatch[0], 'ProsConsMissing', 1);
              if (missingParsed && Array.isArray(missingParsed.results)) {
                missingParsed.results.forEach((r: ProductProsConsResult) => {
                  if (r?.pcode) initialMap.set(String(r.pcode), r);
                });
              }
            }
          } catch (retryError) {
            console.error('[Pros/Cons] Missing-only retry failed:', retryError);
          }
        }

        const normalizedResults = normalizeResults(Array.from(initialMap.values()));
        console.log(`[Pros/Cons] Generated for ${initialResults.length} products, normalized to ${normalizedResults.length}`);
        return normalizedResults;
      }
    }
  } catch (error) {
    console.error('[Pros/Cons] Error:', error);
  }

  // Fallback: 리뷰 키워드 추출 기반
  const finalFallbackResults = products.map(p => {
    const { pros, cons } = buildFallbackProsCons(reviews[p.pcode] || []);
    return {
      pcode: p.pcode,
      pros,
      cons,
    };
  });
  return normalizeResults(finalFallbackResults);
}

// ============================================================================
// 🆕 Product Info 조회 및 필터링
// ============================================================================

/**
 * Supabase에서 product_info 조회
 */
async function getProductInfoMap(pcodes: string[]): Promise<Record<string, ProductInfo>> {
  if (pcodes.length === 0) return {};

  try {
    const { data, error } = await supabase
      .from('knowledge_products_cache')
      .select('pcode, product_info')
      .in('pcode', pcodes)
      .not('product_info', 'is', null);

    if (error) {
      console.error('[ProductInfo] Query error:', error);
      return {};
    }

    const result = Object.fromEntries(
      data?.filter(r => r.product_info).map(r => [r.pcode, r.product_info as ProductInfo]) || []
    );
    console.log(`[ProductInfo] ✅ Loaded ${Object.keys(result).length}/${pcodes.length} product infos`);
    return result;
  } catch (e) {
    console.error('[ProductInfo] Failed:', e);
    return {};
  }
}

/**
 * product_info를 프롬프트용으로 정제
 * - specs/highlights 제외 (specSummary로 충분)
 * - questionMapping에서 confidence: 'low' 제외
 */
function formatProductInfoForPrompt(info: ProductInfo | undefined): string {
  if (!info) return '';

  const lines: string[] = [];

  // analysis
  if (info.analysis) {
    const { oneLiner, buyingPoint, cautions } = info.analysis;
    if (oneLiner) lines.push(`📊 "${oneLiner}"`);
    if (buyingPoint) lines.push(`💡 ${buyingPoint}`);
    if (cautions?.length) lines.push(`⚠️ 주의: ${cautions.slice(0, 2).join(', ')}`);
  }

  // webEnriched
  const web = info.webEnriched;
  if (web) {
    if (web.pros?.length) lines.push(`✅ 장점: ${web.pros.slice(0, 3).join(' / ')}`);
    if (web.cons?.length) lines.push(`❌ 단점: ${web.cons.slice(0, 2).join(' / ')}`);
    if (web.targetUsers?.length) lines.push(`🎯 추천: ${web.targetUsers.slice(0, 2).join(', ')}`);
    if (web.keyFeatures?.length) lines.push(`🔑 특징: ${web.keyFeatures.slice(0, 3).join(', ')}`);
  }

  // questionMapping (high/medium만, null 값 안전하게 처리)
  const mapping = info.questionMapping || info.webEnriched?.questionMapping;
  if (mapping) {
    const validMappings = Object.entries(mapping)
      .filter(([, m]) => {
        if (!m || typeof m !== 'object') return false;
        const conf = (m as { confidence?: string }).confidence;
        return conf && conf !== 'low';
      })
      .map(([qId, m]) => {
        const mp = m as { matchedOption?: string; confidence?: string };
        return `${qId}=${mp.matchedOption || '?'}(${mp.confidence || '?'})`;
      })
      .slice(0, 4);
    if (validMappings.length > 0) {
      lines.push(`🏷️ 매핑: ${validMappings.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ============================================================================
// 🆕 배치 통합 LLM 평가 (5개씩 묶어서 정밀 평가)
// ============================================================================

const BATCH_EVAL_MODEL = 'gemini-2.5-flash-lite'; // 비용 효율 + 속도
const REVIEWS_PER_PRODUCT_BATCH = 5; // 배치 평가 시 제품당 리뷰 수 (8→5, 키워드 선별로 품질 유지)
const REVIEW_CHAR_LIMIT = 100; // 리뷰당 글자 제한 (120→100)
const BATCH_SIZE = 5; // 한 번에 평가할 제품 수 (10→5, 정밀 평가)
const MAX_CONCURRENT_BATCHES = 10; // 동시 배치 요청 수 (6→10, 속도 최적화)

/**
 * 키워드 기반 관련 리뷰 선별
 * - 사용자 조건 키워드가 포함된 리뷰 우선
 * - 긍정(4점+) / 부정(3점-) 균형있게 선택
 */
function selectRelevantReviews(
  reviews: ReviewLite[],
  keywords: string[],
  maxCount: number = REVIEWS_PER_PRODUCT_BATCH
): ReviewLite[] {
  if (reviews.length <= maxCount) return reviews;
  if (keywords.length === 0) return reviews.slice(0, maxCount);

  // 키워드 매칭 리뷰 찾기
  const keywordLower = keywords.map(k => k.toLowerCase());
  const matched = reviews.filter(r =>
    keywordLower.some(kw => r.content.toLowerCase().includes(kw))
  );
  const unmatched = reviews.filter(r => !matched.includes(r));

  // 매칭된 리뷰 중 긍정/부정 균형있게
  const matchedPositive = matched.filter(r => r.rating >= 4);
  const matchedNegative = matched.filter(r => r.rating <= 3);

  const result: ReviewLite[] = [];

  // 긍정 리뷰 먼저 (최대 3개)
  result.push(...matchedPositive.slice(0, 3));
  // 부정 리뷰 추가 (최대 2개)
  result.push(...matchedNegative.slice(0, 2));
  // 부족하면 매칭 안된 리뷰로 채움
  const remaining = maxCount - result.length;
  if (remaining > 0) {
    result.push(...unmatched.slice(0, remaining));
  }

  return result.slice(0, maxCount);
}

interface ProductEvaluation {
  pcode: string;
  score: number;  // 0-100
}

/**
 * 배치 통합 LLM 평가
 * - 5개씩 묶어서 정밀 평가 (정확도 향상)
 * - 리뷰 8개 × 120자로 충분한 정보 제공
 * - 120개 → 24회 호출
 */
async function evaluateAllCandidatesWithLLM(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  expandedKeywords?: ExpandedKeywords,
  productInfoMap?: Record<string, ProductInfo>,  // 🆕 인덱싱된 제품 정보
  personalizationContext?: string | null,        // 🆕 개인화 메모리 컨텍스트
): Promise<ProductEvaluation[]> {
  if (!ai) {
    console.log('[BatchEval] No AI, fallback to score-based');
    return candidates.map(p => ({
      pcode: p.pcode,
      score: p.matchScore || 50,
    }));
  }

  const model = ai.getGenerativeModel({
    model: BATCH_EVAL_MODEL,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 350, // 5개 제품 점수 (배치 크기 축소)
      responseMimeType: 'application/json',
    },
  });

  // 브랜드 선택 추출 (_추가정보 키는 브랜드명이 아닌 선호 스타일이므로 제외)
  let selectedBrand: string | null = null;
  for (const [question, answer] of Object.entries(collectedInfo)) {
    if (question.includes('_추가정보')) continue;
    if (question.includes('brand') || question.includes('브랜드') || question.includes('제조사')) {
      const skipPatterns = ['skip', 'any', '상관없', '건너뛰', '아무', '없어요', '없음'];
      const isSkip = skipPatterns.some(pattern => answer.toLowerCase().includes(pattern));
      if (!isSkip && answer && answer.length > 0) {
        selectedBrand = answer;
        break;
      }
    }
  }

  // 카테고리 관여도 및 브랜드 보너스
  const categoryInvolvement = (collectedInfo['__category_involvement'] as 'high' | 'trust' | 'low') || 'trust';
  const BRAND_BONUS = { high: 20, trust: 15, low: 10 };
  const brandBonus = BRAND_BONUS[categoryInvolvement];
  console.log(`[BatchEval] 카테고리 관여도: ${categoryInvolvement}, 브랜드 보너스: +${brandBonus}점`);

  // 🆕 개인화 메모리 컨텍스트 (사용자 기본 정보)
  const personalizationSection = personalizationContext
    ? `[사용자 기본 정보]\n${personalizationContext}\n\n`
    : '';

  // 사용자 조건 문자열 (_추가정보 키는 선호 스타일이므로 조건에 포함)
  const userConditions = Object.entries(collectedInfo)
    .filter(([k]) => !k.startsWith('__'))
    .filter(([k]) => {
      if (k.includes('_추가정보')) return true; // 브랜드 선호 스타일(국민템/가성비)은 조건에 포함
      return !k.includes('brand') && !k.includes('브랜드') && !k.includes('제조사');
    })
    .map(([q, a]) => `- ${q}: ${a}`)
    .join('\n') || '없음';

  const priorities = balanceSelections.map(b => b.selectedLabel).join(', ') || '없음';

  // 키워드 정보
  const { preferKeywords = [], avoidKeywords = [] } = expandedKeywords || {};
  const keywordInfo = (preferKeywords.length > 0 || avoidKeywords.length > 0)
    ? `\n선호 키워드: ${preferKeywords.slice(0, 5).join(', ') || '없음'} / 회피 키워드: ${avoidKeywords.slice(0, 3).join(', ') || '없음'}`
    : '';

  const totalBatches = Math.ceil(candidates.length / BATCH_SIZE);
  console.log(`[BatchEval] Starting: ${candidates.length}개 제품 → ${totalBatches}개 배치 (${BATCH_SIZE}개씩)`);
  const startTime = Date.now();

  // 배치 평가 함수 (5개 제품을 한 번에 정밀 평가)
  const evaluateBatch = async (batchProducts: HardCutProduct[], batchIndex: number): Promise<ProductEvaluation[]> => {
    // 각 제품 정보를 간결하게 정리
    const productList = batchProducts.map((p, idx) => {
      const productReviews = reviews[p.pcode] || [];
      const avgRating = productReviews.length > 0
        ? (productReviews.reduce((s, r) => s + r.rating, 0) / productReviews.length).toFixed(1)
        : '0';

      // 리뷰 요약 (키워드 기반 선별 5개, 100자씩)
      const relevantReviews = selectRelevantReviews(productReviews, preferKeywords);
      const reviewSummary = relevantReviews
        .map(r => `[${r.rating}점]${r.content.slice(0, REVIEW_CHAR_LIMIT)}`)
        .join(' | ') || '리뷰 없음';

      // 브랜드 매칭 체크
      const isBrandMatch = selectedBrand && p.brand
        ? p.brand.toLowerCase().includes(selectedBrand.toLowerCase()) ||
          selectedBrand.toLowerCase().includes(p.brand.toLowerCase())
        : false;

      // 🆕 인덱싱된 제품 정보
      const productInfoStr = formatProductInfoForPrompt(productInfoMap?.[p.pcode]);
      // 첫 배치 첫 제품만 로그 (디버그용)
      if (batchIndex === 0 && idx === 0) {
        console.log(`[BatchEval] 🆕 ProductInfo 샘플 (${p.pcode}):`, productInfoStr ? `${productInfoStr.slice(0, 100)}...` : '(없음)');
      }

      return `[${idx + 1}] ${p.pcode}
브랜드: ${p.brand}${isBrandMatch ? '⭐선호브랜드' : ''} | 제품명: ${p.name}
가격: ${p.price?.toLocaleString()}원 | 리뷰: ${productReviews.length}개(${avgRating}점) | 스펙: ${p.specSummary || ''}
리뷰요약: ${reviewSummary}${productInfoStr ? `\n${productInfoStr}` : ''}`;
    }).join('\n\n');

    const prompt = `## ${categoryName} 제품 ${batchProducts.length}개 평가

## 사용자 조건
${personalizationSection}${selectedBrand ? `⭐ 선호 브랜드: ${selectedBrand}\n` : ''}${userConditions}
${priorities !== '없음' ? `특히 중요: ${priorities}` : ''}${keywordInfo}

## 제품 목록
${productList}

## 평가 기준 (중요도 순)
1. **예산**: 사용자 예산 범위 내인지 최우선 확인
   - 예산 내: 기본 점수 유지
   - 예산 초과 15% 이내: -10점
   - 예산 초과 15% 이상: -30점 (큰 감점)
2. **카테고리 적합성**: "${categoryName}" 본품인가? (액세서리/소모품 제외)
   - 불일치 시 score: 0
3. **조건 충족도**: 사용자 조건을 얼마나 만족하는가?
   - 선호 브랜드 일치 시 +${brandBonus}점
   - "특히 중요" 항목 가중치 높게

## 응답 (JSON 배열만)
[{"pcode":"제품코드","score":0-100}]`;

    try {
      const result = await model.generateContent(prompt);
      let text = result.response.text().trim();
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

      // JSON 배열 파싱
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0]) as Array<{pcode: string; score: number}>;

        // pcode 검증 및 매핑
        const pcodeSet = new Set(batchProducts.map(p => p.pcode));
        const validResults = parsed.filter(r => pcodeSet.has(r.pcode)).map(r => ({
          pcode: r.pcode,
          score: r.score,
        }));

        // 누락된 제품은 fallback 점수 부여
        const resultPcodes = new Set(validResults.map(r => r.pcode));
        const missingProducts = batchProducts.filter(p => !resultPcodes.has(p.pcode));

        const fallbackResults = missingProducts.map(p => ({
          pcode: p.pcode,
          score: p.matchScore || 50,
        }));

        return [...validResults, ...fallbackResults];
      }
    } catch (error) {
      console.error(`[BatchEval] Batch ${batchIndex + 1} failed:`, error);
    }

    // 배치 전체 실패 시 fallback
    return batchProducts.map(p => ({
      pcode: p.pcode,
      score: p.matchScore || 50,
    }));
  };

  // 배치 분할
  const batches: HardCutProduct[][] = [];
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    batches.push(candidates.slice(i, i + BATCH_SIZE));
  }

  // 동시성 제어된 병렬 처리
  const results: ProductEvaluation[] = [];

  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);
    const batchResults = await Promise.all(
      concurrentBatches.map((batch, idx) => evaluateBatch(batch, i + idx))
    );
    results.push(...batchResults.flat());

    const progress = Math.min(i + MAX_CONCURRENT_BATCHES, batches.length);
    console.log(`[BatchEval] Progress: ${progress}/${batches.length} batches (${results.length}/${candidates.length} products)`);
  }

  const elapsed = Date.now() - startTime;
  const apiCalls = batches.length;
  const categoryMismatch = results.filter(r => r.score === 0).length;
  console.log(`[BatchEval] ✅ Complete: ${results.length} products in ${elapsed}ms (${apiCalls} API calls, ${(elapsed / apiCalls).toFixed(0)}ms/batch)${categoryMismatch > 0 ? ` ⚠️ 카테고리 불일치: ${categoryMismatch}개` : ''}`);

  // 점수순 정렬
  results.sort((a, b) => b.score - a.score);

  return results;
}

// ============================================================================
// 🆕 LLM 기반 카테고리 사전 필터링 (액세서리/소모품 제외)
// - flash-lite + 대용량 배치(20개) + 고병렬(10) = 빠른 처리
// - 키워드 매칭보다 정확한 LLM 판단
// ============================================================================
const CATEGORY_FILTER_MODEL = 'gemini-2.5-flash-lite';
const CATEGORY_FILTER_BATCH_SIZE = 20;  // 배치당 20개 제품
const CATEGORY_FILTER_MAX_CONCURRENT = 10;  // 동시 10개 배치

interface CategoryFilterResult {
  pcode: string;
  isMainProduct: boolean;
}

async function filterByCategoryWithLLM(
  candidates: HardCutProduct[],
  categoryName: string
): Promise<HardCutProduct[]> {
  if (!ai || candidates.length === 0) {
    return candidates;
  }

  const startTime = Date.now();
  console.log(`[CategoryFilter] 🚀 LLM 카테고리 필터 시작: ${candidates.length}개 제품`);

  const model = ai.getGenerativeModel({
    model: CATEGORY_FILTER_MODEL,
    generationConfig: {
      temperature: 0.1,  // 낮은 온도로 일관된 판단
      maxOutputTokens: 800,
      responseMimeType: 'application/json',
    },
  });

  // 배치 처리 함수
  const processBatch = async (batch: HardCutProduct[], batchIndex: number): Promise<CategoryFilterResult[]> => {
    const productList = batch.map((p, i) =>
      `${i + 1}. [${p.pcode}] ${p.brand || ''} ${p.name}`
    ).join('\n');

    const prompt = `## "${categoryName}" 본품 vs 액세서리/소모품 분류

제품 목록:
${productList}

## 판단 기준
- **본품 (Y)**: "${categoryName}" 자체 (예: 유모차, 카시트, 젖병 본체)
- **액세서리/소모품 (N)**: 커버, 시트, 부품, 교체용, 리필, 패드, 매트, 케이스, 장난감, 젖꼭지, 세정제 등

## 응답 (JSON만)
{"results":[{"pcode":"코드","y":true/false}]}

⚠️ 애매하면 Y (본품)로 판단`;

    try {
      const result = await model.generateContent(prompt);
      let text = result.response.text().trim();
      text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { results: Array<{ pcode: string; y: boolean }> };
        if (parsed.results && Array.isArray(parsed.results)) {
          return parsed.results.map(r => ({
            pcode: String(r.pcode).trim(),
            isMainProduct: r.y !== false,  // 기본값 true
          }));
        }
      }
    } catch (error) {
      console.error(`[CategoryFilter] Batch ${batchIndex + 1} error:`, error);
    }

    // 실패 시 모두 본품으로 간주 (안전하게)
    return batch.map(p => ({ pcode: p.pcode, isMainProduct: true }));
  };

  // 배치 분할
  const batches: HardCutProduct[][] = [];
  for (let i = 0; i < candidates.length; i += CATEGORY_FILTER_BATCH_SIZE) {
    batches.push(candidates.slice(i, i + CATEGORY_FILTER_BATCH_SIZE));
  }

  // 고병렬 처리
  const allResults: CategoryFilterResult[] = [];
  for (let i = 0; i < batches.length; i += CATEGORY_FILTER_MAX_CONCURRENT) {
    const concurrentBatches = batches.slice(i, i + CATEGORY_FILTER_MAX_CONCURRENT);
    const batchResults = await Promise.all(
      concurrentBatches.map((batch, idx) => processBatch(batch, i + idx))
    );
    allResults.push(...batchResults.flat());
  }

  // 본품만 필터링
  const mainProductPcodes = new Set(
    allResults.filter(r => r.isMainProduct).map(r => r.pcode)
  );
  const filtered = candidates.filter(c => mainProductPcodes.has(c.pcode));

  const elapsed = Date.now() - startTime;
  const removedCount = candidates.length - filtered.length;
  console.log(`[CategoryFilter] ✅ 완료 (${elapsed}ms): ${removedCount}개 제외 (${candidates.length} → ${filtered.length}), ${batches.length}배치`);

  return filtered;
}

/**
 * 120개 후보에서 사전 스크리닝 (규칙 기반)
 * - matchScore(사용자 선택 기반) 우선 + 리뷰/평점 보조
 * - 상위 50개 추출
 */
const PRESCREEN_LIMIT = 25;  // 🚀 최적화: 50 → 25 (입력 토큰 50% 감소)

function prescreenCandidates(
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  expandedKeywords?: ExpandedKeywords, // 🆕 확장된 키워드 (flash-lite로 추출)
  rankMap?: Record<string, number> // 🆕 다나와 랭크 맵
): HardCutProduct[] {
  console.log(`[FinalRecommend] Pre-screening ${candidates.length} candidates...`);

  const { preferKeywords = [], avoidKeywords = [] } = expandedKeywords || {};

  // 각 상품에 점수 부여
  const scored = candidates.map(p => {
    let score = 0;

    // 1. matchScore 우선 (사용자 선택 기반 점수) - 가중치 높임
    score += (p.matchScore || 0) * 2; // 0.5 → 2배로 상향

    // 2. 리뷰 수 점수 (리뷰가 많을수록 높음) - 가중치 상향!
    const productReviews = reviews[p.pcode] || [];
    // 리뷰 수 구간별 점수: 1-5개: 기본, 6-15개: 보너스, 16개 이상: 대폭 추가 보너스
    const reviewCount = productReviews.length;
    let reviewScore = 0;
    if (reviewCount >= 1) reviewScore += Math.min(reviewCount, 5) * 2; // 1-5개: 최대 10점
    if (reviewCount >= 6) reviewScore += Math.min(reviewCount - 5, 10) * 3; // 6-15개: 추가 최대 30점
    if (reviewCount >= 16) reviewScore += Math.min(reviewCount - 15, 15) * 3; // 16개 이상: 추가 최대 45점 (기존 15점에서 상향)
    score += Math.min(reviewScore, 85); // 최대 85점 (기존 55점에서 상향)

    // 3. 평점 점수
    const avgRating = productReviews.length > 0
      ? productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length
      : p.rating || 0;
    score += avgRating * 3; // 5점 만점 → 최대 15점

    // 4. 스펙 + 리뷰 통합 텍스트 (검색 대상)
    const specText = (p.specSummary || '').toLowerCase();
    const reviewText = productReviews.map(r => r.content).join(' ').toLowerCase();
    const combinedText = `${specText} ${reviewText}`;

    // 5. 🆕 선호 키워드 매칭 (확장된 키워드로 스펙+리뷰 검색)
    // - 스펙에 있으면 가점, 긍정 리뷰(4점+)에 있으면 추가 가점
    for (const keyword of preferKeywords) {
      const kwLower = keyword.toLowerCase();
      // 스펙에 있으면 +3점
      if (specText.includes(kwLower)) {
        score += 3;
      }
      // 긍정 리뷰(4점 이상)에 있으면 +2점
      const inPositiveReview = productReviews.some(
        r => r.rating >= 4 && r.content.toLowerCase().includes(kwLower)
      );
      if (inPositiveReview) {
        score += 2;
      }
    }

    // 6. 피할 키워드 매칭 (확장된 키워드 우선)
    const effectiveAvoidKeywords = new Set<string>(
      avoidKeywords.map(k => k.toLowerCase())
    );

    let negativeMatchCount = 0;
    for (const keyword of effectiveAvoidKeywords) {
      if (combinedText.includes(keyword)) {
        negativeMatchCount++;
      }
    }
    // 키워드 매칭 수에 따라 감점 (최대 -30점)
    score -= Math.min(negativeMatchCount * 10, 30);

    // 7. 사용자 조건 직접 매칭 (combinedText에서 검색 - 스펙+리뷰 모두)
    for (const [key, value] of Object.entries(collectedInfo)) {
      if (key.startsWith('__')) continue; // 내부 키 제외
      const valueStr = Array.isArray(value)
        ? value.join(' ')
        : (typeof value === 'string' ? value : String(value || ''));
      const valueLower = valueStr.toLowerCase();
      // 🆕 스펙뿐 아니라 리뷰에서도 검색
      if (valueLower && combinedText.includes(valueLower)) {
        score += 5;
      }
    }

    // 8. 🆕 다나와 랭크 점수 (동점 시 랭크 높은 제품 우선)
    // 랭크 1~20 → 최대 10점 (랭크가 낮을수록 높은 점수)
    if (rankMap) {
      const rank = rankMap[p.pcode];
      if (rank && rank <= 20) {
        score += Math.max(0, 11 - Math.ceil(rank / 2)); // 1-2위: +10, 3-4위: +9, ... 19-20위: +1
      }
    }

    return { product: p, score };
  });

  // 점수순 정렬 후 상위 N개 반환
  scored.sort((a, b) => b.score - a.score);

  // ✅ 리뷰 0개인 상품 제외 (품질 보장)
  const withReviews = scored.filter(s => {
    const productReviews = reviews[s.product.pcode] || [];
    return productReviews.length > 0;
  });

  // 리뷰 있는 상품이 부족하면 fallback (최소 5개 보장)
  const finalCandidates = withReviews.length >= 5
    ? withReviews
    : scored;

  const topN = finalCandidates.slice(0, PRESCREEN_LIMIT).map(s => s.product);

  console.log(`[FinalRecommend] Pre-screened to ${topN.length} candidates (excluded ${scored.length - withReviews.length} with 0 reviews)`);
  return topN;
}

// ============================================================================
// 2단계 추천 시스템: 1단계(Top3 선정) + 2단계(상세 이유 생성)
// ============================================================================

/**
 * 1단계: Top N pcode 선정 (가벼운 호출)
 * - 입력: 후보 목록 (스펙 요약 + 리뷰 키워드만, 원문 제외)
 * - 출력: pcode N개 + 간단한 선정 이유
 */
async function selectTopNPcodes(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  count: number = RECOMMENDATION_COUNT,
  conditionReport?: { userProfile: { situation: string; keyNeeds: string[] }; analysis: { recommendedSpecs: Array<{ specName: string; value: string; reason: string }> } } | null,
): Promise<{ pcode: string; briefReason: string }[]> {
  if (!ai) {
    return candidates.slice(0, count).map(p => ({
      pcode: p.pcode,
      briefReason: `매칭 점수 ${p.matchScore}점`,
    }));
  }

  // 1단계는 가벼운 선정 작업이므로 flash-lite 사용 (속도 최적화)
  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: TOKEN_LIMITS.TOP_N_SELECTION, // 🆕 4000 (여유 있게)
      responseMimeType: 'application/json',
    },
  });

  // 후보 정보 (간략화: 리뷰 원문 제외)
  const candidateInfo = candidates.map((p, i) => {
    const productReviews = reviews[p.pcode] || [];
    const { pros, cons } = extractReviewKeywords(productReviews);
    const qualitative = analyzeReviewsQualitative(productReviews);

    return `${i + 1}. ${p.brand} ${p.name} (pcode:${p.pcode})
   가격:${p.price?.toLocaleString()}원 | 매칭:${p.matchScore}점 | 리뷰:${productReviews.length}개,${qualitative.avgRating}점
   스펙:${p.specSummary || ''}
   장점:${pros.slice(0, 4).join(',')} | 단점:${cons.slice(0, 3).join(',')}`;
  }).join('\n');

  // 중간 보고서 컨텍스트 (AI가 요약한 핵심 니즈/추천 스펙)
  const reportContext = conditionReport
    ? `\n## AI 분석 요약 (중간 보고서)\n- 상황: ${conditionReport.userProfile.situation.replace(/\*\*/g, '')}\n- 핵심 니즈: ${conditionReport.userProfile.keyNeeds.join(', ')}\n- 추천 스펙: ${conditionReport.analysis.recommendedSpecs.map(s => `${s.specName}=${s.value.replace(/\*\*/g, '')}`).join(', ')}\n`
    : '';

  const prompt = `## ${categoryName} Top ${count} 선정

## 사용자 조건
${Object.entries(collectedInfo).filter(([k]) => !k.startsWith('__')).map(([q, a]) => `- ${q}: ${a}`).join('\n') || '없음'}

## 우선순위: ${balanceSelections.map(b => b.selectedLabel).join(', ') || '없음'}
${reportContext}
## 후보 (${candidates.length}개)
${candidateInfo}

## 작업
사용자 조건에 가장 적합한 상품 ${count}개를 선정하세요.
- 리뷰 평점/개수 + 스펙 매칭 + 사용자 우선순위 종합 고려
- AI 분석 요약의 핵심 니즈와 추천 스펙을 우선 반영

## 응답 (JSON만)
{"topN":[{"pcode":"코드1","briefReason":"선정이유(15자)"},{"pcode":"코드2","briefReason":"이유"},...]}`;

  try {
    console.log(`[Step1] Selecting Top ${count} pcodes...`);
    const startTime = Date.now();
    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    text = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const topList = parsed.topN || parsed.top3 || parsed.top5;
      if (topList && Array.isArray(topList) && topList.length > 0) {
        console.log(`[Step1] ✅ Top ${topList.length} selected in ${Date.now() - startTime}ms:`, topList.map((t: any) => t.pcode).join(', '));
        return topList;
      }
    }
  } catch (error) {
    console.error('[Step1] Error:', error);
  }

  console.log('[Step1] ⚠️ Fallback to score-based selection');
  return candidates.slice(0, count).map(p => ({
    pcode: p.pcode,
    briefReason: `매칭 점수 ${p.matchScore}점`,
  }));
}

/**
 * 2단계: 한줄 평 생성 (선정된 N개에 대해서만)
 * - 입력: N개 상품 + 리뷰 원문 30개
 * - 출력: oneLiner (PLP 표시용)
 * - 장단점(pros/cons)은 별도 generateProsConsFromReviews에서 생성
 */
async function generateDetailedReasons(
  selectedProducts: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  categoryName: string,
  collectedInfo?: Record<string, string>,
  productInfoMap?: Record<string, ProductInfo>  // 🆕 인덱싱된 제품 정보
): Promise<FinalRecommendation[]> {
  console.log(`[Step2] Generating oneLiners with LLM for ${selectedProducts.length} products`);

  // Gemini API 초기화
  if (!geminiApiKey) {
    console.warn('[Step2] No Gemini API key - using fallback oneLiners');
    return selectedProducts.map((product, i) => ({
      rank: i + 1,
      pcode: product.pcode,
      product,
      reason: `${product.brand} ${product.name}`,
      oneLiner: `✨ ${product.brand || ''} ${product.name?.slice(0, 30) || ''}`,
    }));
  }

  const ai = new GoogleGenerativeAI(geminiApiKey);
  const modelName = process.env.GEMINI_ONE_LINER_MODEL || 'gemini-3-flash-preview';
  const model = ai.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4000,
      responseMimeType: 'application/json',
    },
  });

  // 각 제품별 정보 구성
  const productInfos = selectedProducts.map(p => {
    const productReviews = reviews[p.pcode] || [];
    const reviewTexts = productReviews.slice(0, 10).map((r, i) =>
      `[리뷰${i + 1}] ${r.rating}점: "${r.content.slice(0, 80)}${r.content.length > 80 ? '...' : ''}"`
    ).join('\n');

    // 🆕 인덱싱된 제품 정보 포함
    const indexedInfo = productInfoMap?.[p.pcode];
    const analysisStr = indexedInfo?.analysis
      ? `- 분석: "${indexedInfo.analysis.oneLiner}" | ${indexedInfo.analysis.buyingPoint}`
      : '';
    const webStr = indexedInfo?.webEnriched
      ? `- 웹정보: 장점[${indexedInfo.webEnriched.pros?.slice(0, 3).join(', ')}] 추천대상[${indexedInfo.webEnriched.targetUsers?.slice(0, 2).join(', ')}]`
      : '';

    return `### ${p.brand} ${p.name} (pcode: ${p.pcode})
- 가격: ${p.price?.toLocaleString()}원
- 스펙: ${p.specSummary || '정보 없음'}
- 추천 이유: ${p.matchedConditions?.join(', ') || '정보 없음'}
${analysisStr}
${webStr}
- 리뷰:
${reviewTexts || '(리뷰 없음)'}`;
  }).join('\n\n');

  // 사용자 답변 정보 포맷팅
  const userContext = collectedInfo && Object.keys(collectedInfo).length > 0
    ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 사용자가 답변한 맞춤 질문
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${Object.entries(collectedInfo)
  .filter(([key]) => !key.startsWith('__'))  // 내부 키 제외
  .map(([question, answer]) => `Q: ${question}\nA: ${answer}`)
  .join('\n\n')}

`
    : '';

  const prompt = `당신은 ${categoryName} 전문 큐레이터입니다.
각 제품의 핵심 강점을 담은 한줄 평(oneLiner)을 작성해주세요.

${userContext}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 제품 정보
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${productInfos}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 작성 규칙
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### oneLiner (한줄 평) - 최대 60자 (엄수)
- 이모지 + **핵심 강점!** + 부가 설명
- 위 '사용자가 답변한 맞춤 질문' 내용을 적극 반영하여 개인화된 문구 작성
- 사용자의 상황/필요(예: 신생아, 좁은 공간 등)를 한줄평에 자연스럽게 녹여내기
- 리뷰 내용 인용 시 '작은따옴표' 사용
- 간결하고 명확하게 작성
- 예: 🤫 **신생아 재우기 딱 좋은 정숙함!** 수면풍 모드로 밤잠 방해 없어요

### 🚫 금지 패턴
- "실제 사용자들이...라고 평가한 제품입니다"
- "리뷰에 따르면..."
- 제품에 없는 기능을 있는 것처럼 언급
- 큰따옴표(") 사용 금지 (JSON 파싱 오류 방지)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 응답 JSON 형식
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "results": [
    {
      "pcode": "상품코드",
      "oneLiner": "이모지 + 한줄 평 (최대 60자)"
    }
  ]
}

⚠️ JSON만 출력
⚠️ 반드시 모든 제품(${selectedProducts.length}개)에 대해 생성
⚠️ 각 한줄평은 60자 이내로 작성`;

  try {
    const result = await model.generateContent(prompt);
    let responseText = result.response.text().trim();
    responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const rawJson = jsonMatch[0];

      // Try parsing
      let parsed: { results?: Array<{ pcode: string; oneLiner: string }> } | null = null;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        // Normalize JSON (fix quotes)
        const normalized = rawJson
          .replace(/[""]/g, '"')
          .replace(/['']/g, "'")
          .replace(/,\s*([}\]])/g, '$1');
        try {
          parsed = JSON.parse(normalized);
        } catch (e2) {
          console.warn('[Step2] JSON parse failed:', e2, 'raw snippet:', rawJson.slice(0, 300));
        }
      }

      if (parsed && parsed.results && Array.isArray(parsed.results)) {
        console.log('[Step2] LLM generated oneLiners for', parsed.results.length, 'products');
        const resultMap = new Map(parsed.results.map((r: { pcode: string; oneLiner: string }) => [String(r.pcode).trim(), r.oneLiner]));

        return selectedProducts.map((product, i) => {
          const oneLiner = resultMap.get(String(product.pcode).trim()) || `✨ ${product.brand || ''} ${product.name?.slice(0, 30) || ''}`;
          return {
            rank: i + 1,
            pcode: product.pcode,
            product,
            reason: `${product.brand} ${product.name}`,
            oneLiner,
          };
        });
      }

      // Regex fallback
      const regex = /"pcode"\s*:\s*"([^"]+)"[\s\S]*?"oneLiner"\s*:\s*"((?:\\.|[^"\\])*)"/g;
      const regexResults: Array<{ pcode: string; oneLiner: string }> = [];
      let match: RegExpExecArray | null;
      while ((match = regex.exec(responseText)) !== null) {
        const pcode = match[1]?.trim();
        const oneLiner = match[2]?.replace(/\\n/g, ' ').trim();
        if (pcode && oneLiner) {
          regexResults.push({ pcode, oneLiner });
        }
      }

      if (regexResults.length > 0) {
        console.warn('[Step2] JSON parse failed; recovered via regex:', regexResults.length);
        const resultMap = new Map(regexResults.map(r => [String(r.pcode).trim(), r.oneLiner]));

        return selectedProducts.map((product, i) => {
          const oneLiner = resultMap.get(String(product.pcode).trim()) || `✨ ${product.brand || ''} ${product.name?.slice(0, 30) || ''}`;
          return {
            rank: i + 1,
            pcode: product.pcode,
            product,
            reason: `${product.brand} ${product.name}`,
            oneLiner,
          };
        });
      }

      if (parsed) {
        console.warn('[Step2] LLM response missing results array');
      }
    } else {
      console.warn('[Step2] LLM response missing JSON block', responseText.slice(0, 300));
    }
  } catch (error) {
    console.error('[Step2] LLM error:', error);
  }

  // Fallback
  return selectedProducts.map((product, i) => ({
    rank: i + 1,
    pcode: product.pcode,
    product,
    reason: `${product.brand} ${product.name}`,
    oneLiner: `✨ ${product.brand || ''} ${product.name?.slice(0, 30) || ''}`,
  }));
}

// ============================================================================
// 🆕 유사 제품 중복 제거를 위한 유틸리티 함수들
// ============================================================================

/**
 * Levenshtein 거리 계산 (편집 거리)
 */
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * 문자열 유사도 계산 (0~1, 1이면 완전 동일)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1;
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(s1, s2) / maxLen;
}

/**
 * 이미 선택된 제품들과 유사한지 체크 (95% 이상이면 유사)
 */
function isSimilarToSelected(
  product: HardCutProduct,
  selected: HardCutProduct[],
  threshold = 0.95
): boolean {
  return selected.some(existing =>
    calculateSimilarity(product.name, existing.name) >= threshold
  );
}

/**
 * 🚀 1단계: Top N 상품 선정 (사전 스크리닝 + pcode 선정)
 * - 120개 → 25개 사전 스크리닝
 * - Top N pcode 선정 (가벼운 호출)
 * - 선정된 HardCutProduct[] 반환
 */
async function selectTopProducts(
  categoryName: string,
  candidates: HardCutProduct[],
  reviews: Record<string, ReviewLite[]>,
  collectedInfo: Record<string, string>,
  balanceSelections: BalanceSelection[],
  expandedKeywords?: ExpandedKeywords,
  freeInputAnalysis?: FreeInputAnalysis | null,
  personalizationContext?: string | null,  // 🆕 개인화 메모리 컨텍스트
  conditionReport?: { userProfile: { situation: string; keyNeeds: string[] }; analysis: { recommendedSpecs: Array<{ specName: string; value: string; reason: string }> } } | null,
): Promise<{ selectedProducts: HardCutProduct[]; productInfoMap: Record<string, ProductInfo> }> {
  const pcodes = candidates.map(c => c.pcode);

  // 🆕 다나와 랭크 + product_info 병렬 조회
  const [rankMap, productInfoMap] = await Promise.all([
    // 랭크 조회
    (async () => {
      if (candidates.length <= PRESCREEN_LIMIT) return {};
      try {
        const { data: rankData } = await supabase
          .from('knowledge_products_cache')
          .select('pcode, rank')
          .in('pcode', pcodes);
        if (rankData) {
          const result = Object.fromEntries(rankData.filter(r => r.rank).map(r => [r.pcode, r.rank]));
          console.log(`[FinalRecommend] ✅ rank 조회: ${Object.keys(result).length}개`);
          return result;
        }
      } catch (e) {
        console.error('[FinalRecommend] rank 조회 실패:', e);
      }
      return {};
    })(),
    // 🆕 product_info 조회
    getProductInfoMap(pcodes),
  ]);

  // ============================================================================
  // 🆕 120개 병렬 LLM 평가 vs 기존 규칙 기반 (플래그로 전환)
  // ============================================================================
  const USE_PARALLEL_LLM_EVAL = true; // 🧪 테스트용 플래그

  let topNSelection: { pcode: string; briefReason: string }[];

  if (USE_PARALLEL_LLM_EVAL && candidates.length > 10) {
    // 🆕 새 방식: 전체를 병렬 LLM 평가
    console.log(`[FinalRecommend] 🆕 Using parallel LLM evaluation for ${candidates.length} candidates`);

    const evaluations = await evaluateAllCandidatesWithLLM(
      categoryName,
      candidates,
      reviews,
      collectedInfo,
      balanceSelections,
      expandedKeywords,
      productInfoMap,  // 🆕 인덱싱된 제품 정보 전달
      personalizationContext,  // 🆕 개인화 메모리 컨텍스트
    );

    // 상위 N개 선택 (카테고리 불일치 제외, 리뷰 0개는 이미 사전 필터링됨)
    const validEvaluations = evaluations.filter(e => {
      if (e.score <= 0) return false; // 카테고리 불일치
      return true;
    });

    // 🆕 Top 10 → 리뷰 필터 로직
    // 1. 점수순 Top 10 선정
    // 2. 리뷰 10개 이상인 제품 우선 선택
    // 3. 부족하면 점수순으로 채움
    const MIN_REVIEW_COUNT = 10;
    const TOP_N_POOL = 10; // Top 10에서 필터링

    const top10 = validEvaluations.slice(0, TOP_N_POOL);
    const withEnoughReviews = top10.filter(e => {
      const reviewCount = reviews[e.pcode]?.length || 0;
      return reviewCount >= MIN_REVIEW_COUNT;
    });
    const withoutEnoughReviews = top10.filter(e => {
      const reviewCount = reviews[e.pcode]?.length || 0;
      return reviewCount < MIN_REVIEW_COUNT;
    });

    // 리뷰 충분한 제품 우선 + 부족하면 점수순으로 채움
    const finalSelection = [...withEnoughReviews, ...withoutEnoughReviews].slice(0, RECOMMENDATION_COUNT);

    topNSelection = finalSelection.map(e => ({
      pcode: e.pcode,
      briefReason: `${e.score}점(리뷰${reviews[e.pcode]?.length || 0})`,
    }));

    console.log(`[FinalRecommend] 🆕 Top 10 pool: ${top10.map(e => `${e.pcode}(${e.score}점,리뷰${reviews[e.pcode]?.length || 0})`).join(', ')}`);
    console.log(`[FinalRecommend] 🆕 리뷰 ${MIN_REVIEW_COUNT}개 이상: ${withEnoughReviews.length}개, 미만: ${withoutEnoughReviews.length}개`);
    console.log(`[FinalRecommend] 🆕 Final Top ${RECOMMENDATION_COUNT}:`, topNSelection.map(t => `${t.pcode}(${t.briefReason})`).join(', '));
  } else {
    // 기존 방식: 규칙 기반 사전 스크리닝 + LLM Top N 선정
    console.log(`[FinalRecommend] Using legacy rule-based prescreen`);

    // 50개 이상이면 사전 스크리닝으로 25개로 줄임
    let filteredCandidates = candidates;
    if (candidates.length > PRESCREEN_LIMIT) {
      filteredCandidates = prescreenCandidates(candidates, reviews, collectedInfo, expandedKeywords, rankMap);
    }

    console.log(`[FinalRecommend] 2-Step Architecture: ${candidates.length} → ${filteredCandidates.length} candidates`);

    // Top N pcode 선정 (가벼운 호출)
    topNSelection = await selectTopNPcodes(
      categoryName,
      filteredCandidates,
      reviews,
      collectedInfo,
      balanceSelections,
      RECOMMENDATION_COUNT,
      conditionReport,
    );
  }

  // 선정된 pcode로 제품 찾기 (중복 pcode + 유사 제품 제거!)
  const seenPcodes = new Set<string>();
  const selectedProducts: HardCutProduct[] = [];

  for (const sel of topNSelection) {
    // 이미 추가된 pcode는 스킵 (LLM이 중복 반환하는 경우 방지)
    if (seenPcodes.has(sel.pcode)) {
      console.log(`[FinalRecommend] ⚠️ 중복 pcode 제거: ${sel.pcode}`);
      continue;
    }

    const product = candidates.find(c => c.pcode === sel.pcode);
    if (!product) continue;

    // 🆕 유사 제품 중복 체크 (95% 이상 유사하면 스킵)
    if (isSimilarToSelected(product, selectedProducts)) {
      console.log(`[FinalRecommend] ⚠️ 유사 제품 제거: ${product.name}`);
      continue;
    }

    selectedProducts.push(product);
    seenPcodes.add(sel.pcode);
  }

  // N개 미만이면 후보에서 채우기 (유사 제품도 제외)
  if (selectedProducts.length < RECOMMENDATION_COUNT) {
    const remaining = candidates.filter(c => !seenPcodes.has(c.pcode));

    for (const next of remaining) {
      if (selectedProducts.length >= RECOMMENDATION_COUNT) break;
      if (isSimilarToSelected(next, selectedProducts)) continue;

      selectedProducts.push(next);
      seenPcodes.add(next.pcode);
      console.log(`[FinalRecommend] ➕ 후보에서 추가: ${next.name}`);
    }
  }

  console.log(`[FinalRecommend] Step1 완료: ${selectedProducts.map((p: HardCutProduct) => p.pcode).join(', ')}`);

  return { selectedProducts, productInfoMap };
}

export async function POST(request: NextRequest) {
  try {
    const body: FinalRecommendationRequest = await request.json();
    const {
      categoryKey,
      categoryName,
      candidates,
      reviews,
      collectedInfo,
      balanceSelections,
      negativeSelections,
      personalizationContext,  // 🆕 개인화 메모리 컨텍스트
      onboarding,  // 🆕 온보딩 데이터 (구매 상황, 기존 불편사항)
      babyInfo,    // 🆕 아기 정보 (개월수, 성별)
      conditionReport,  // 🆕 중간 보고서 (AI 요약 컨텍스트)
    } = body as FinalRecommendationRequest & {
      personalizationContext?: string;
      onboarding?: { purchaseSituation?: string; replaceReasons?: string[]; replaceOther?: string; firstSituations?: string[]; firstSituationOther?: string };
      babyInfo?: { gender?: string; calculatedMonths?: number; expectedDate?: string; isBornYet?: boolean };
      conditionReport?: { userProfile: { situation: string; keyNeeds: string[] }; analysis: { recommendedSpecs: Array<{ specName: string; value: string; reason: string }> } };
    };

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No candidates provided',
      });
    }

    console.log(`\n🏆 [FinalRecommend] Starting: ${candidates.length}개 후보 (최적화 아키텍처)`);
    const startTime = Date.now();
    const catName = categoryName || categoryKey;

    // ============================================================================
    // 0단계: 온보딩 데이터를 collectedInfo에 병합 + 키워드 확장 + 자유 입력 분석
    // ============================================================================
    console.log(`[FinalRecommend] ⚡ Step 0: Enrich collectedInfo + extractExpandedKeywords + analyzeFreeInput`);
    const step0StartTime = Date.now();

    // 🆕 온보딩 데이터를 collectedInfo에 추가 (필터 태그 생성용)
    const enrichedCollectedInfo = { ...collectedInfo };

    // 온보딩 정보를 collectedInfo 형식으로 추가
    if (onboarding) {
      // 기존 제품 불만사항
      if (onboarding.replaceReasons && onboarding.replaceReasons.length > 0) {
        const validReasons = onboarding.replaceReasons.filter(r => r !== '상관없어요');
        if (validReasons.length > 0) {
          enrichedCollectedInfo['[온보딩] 기존 제품 불편사항'] = validReasons.join(', ');
        }
      }
      if (onboarding.replaceOther) {
        enrichedCollectedInfo['[온보딩] 기타 불편사항'] = onboarding.replaceOther;
      }

      // 구매 니즈/상황 (첫구매/둘러보기)
      if (onboarding.firstSituations && onboarding.firstSituations.length > 0) {
        const validSituations = onboarding.firstSituations.filter(s => s !== '상관없어요');
        if (validSituations.length > 0) {
          enrichedCollectedInfo['[온보딩] 구매 니즈/상황'] = validSituations.join(', ');
        }
      }
      if (onboarding.firstSituationOther) {
        enrichedCollectedInfo['[온보딩] 기타 구매 상황'] = onboarding.firstSituationOther;
      }
    }

    // 아기 정보도 추가
    if (babyInfo) {
      if (babyInfo.calculatedMonths !== undefined) {
        enrichedCollectedInfo['[아기 정보] 월령'] = `${babyInfo.calculatedMonths}개월`;
      }
      if (babyInfo.gender && babyInfo.gender !== 'unknown') {
        const genderMap: Record<string, string> = { male: '남아', female: '여아' };
        enrichedCollectedInfo['[아기 정보] 성별'] = genderMap[babyInfo.gender] || babyInfo.gender;
      }
    }

    console.log(`[FinalRecommend] 🆕 Enriched collectedInfo: ${Object.keys(enrichedCollectedInfo).length}개 조건 (원본: ${Object.keys(collectedInfo || {}).length})`);

    const additionalCondition = enrichedCollectedInfo?.['__additional_condition__'] || '';

    const [expandedKeywords, freeInputAnalysisResult] = await Promise.all([
      // 키워드 확장 (LLM 평가 프롬프트용) - enrichedCollectedInfo 사용
      extractExpandedKeywords(catName, enrichedCollectedInfo),
      // 자유 입력 분석
      (additionalCondition && additionalCondition.trim().length >= 2)
        ? analyzeFreeInput(catName, additionalCondition)
        : Promise.resolve(null),
    ]);

    // 🆕 기존 불편사항을 회피 키워드에 추가 (리뷰 검색에도 반영)
    if (onboarding?.replaceReasons && onboarding.replaceReasons.length > 0) {
      expandedKeywords.avoidKeywords.push(...onboarding.replaceReasons);
      console.log(`[FinalRecommend] 🆕 불편사항 회피 키워드 추가: ${onboarding.replaceReasons.join(', ')}`);
    }

    console.log(`[FinalRecommend] ⚡ Step 0 완료 (${Date.now() - step0StartTime}ms): Keywords prefer=${expandedKeywords.preferKeywords.length}, avoid=${expandedKeywords.avoidKeywords.length}`);
    if (freeInputAnalysisResult) {
      console.log(`[FinalRecommend] Free input analyzed:`, freeInputAnalysisResult);
    }

    // ============================================================================
    // 🆕 온보딩/아기 정보를 컨텍스트로 변환
    // ============================================================================
    let extendedContext = personalizationContext || '';

    // 아기 정보 추가
    if (babyInfo) {
      const babyParts: string[] = [];
      if (babyInfo.calculatedMonths !== undefined) {
        babyParts.push(`아기 월령: ${babyInfo.calculatedMonths}개월`);
      } else if (babyInfo.expectedDate) {
        babyParts.push(`출산예정일: ${babyInfo.expectedDate}`);
      }
      if (babyInfo.gender) {
        const genderMap: Record<string, string> = { male: '남아', female: '여아', unknown: '성별 미정' };
        babyParts.push(`성별: ${genderMap[babyInfo.gender] || babyInfo.gender}`);
      }
      if (babyParts.length > 0) {
        extendedContext += `\n[아기 정보] ${babyParts.join(' / ')}`;
      }
    }

    // 온보딩 정보 추가 (특히 기존 제품 불편사항 → 회피 조건으로 반영!)
    if (onboarding) {
      const situationMap: Record<string, string> = {
        first: '처음 구매',
        replace: '기존 제품 교체/업그레이드',
        gift: '선물용',
      };
      extendedContext += `\n[구매 상황] ${situationMap[onboarding.purchaseSituation || ''] || '일반'}`;

      // ⚠️ 기존 제품 불편사항 → 회피 조건으로 강조!
      if (onboarding.replaceReasons && onboarding.replaceReasons.length > 0) {
        const avoidConditions = onboarding.replaceReasons.map(reason => `"${reason}" 없어야 함`).join(', ');
        extendedContext += `\n⚠️ [기존 제품 불만 → 회피 조건] ${avoidConditions}`;
        console.log(`[FinalRecommend] 🆕 기존 불편사항 회피 조건: ${avoidConditions}`);
      }
      if (onboarding.replaceOther) {
        extendedContext += `\n⚠️ [추가 불만 → 회피] "${onboarding.replaceOther}" 없어야 함`;
      }
      // 🆕 첫구매/둘러보기 상황 (복수선택)
      if (onboarding.firstSituations && onboarding.firstSituations.length > 0) {
        extendedContext += `\n[구매 니즈/상황] ${onboarding.firstSituations.join(', ')}`;
      }
      if (onboarding.firstSituationOther) {
        extendedContext += `\n[기타 니즈] ${onboarding.firstSituationOther}`;
      }
    }

    if (extendedContext !== personalizationContext) {
      console.log(`[FinalRecommend] 🆕 Extended context with onboarding/babyInfo`);
    }

    // ============================================================================
    // 🆕 리뷰 0개 제품 사전 필터링 (LLM 호출 비용 절감)
    // - c.reviewCount는 knowledge_products_cache 테이블의 review_count 컬럼 값
    // ============================================================================
    const candidatesWithReviews = candidates.filter(c => (c.reviewCount || 0) > 0);
    const filteredOutCount = candidates.length - candidatesWithReviews.length;
    if (filteredOutCount > 0) {
      console.log(`[FinalRecommend] 🗑️ 리뷰 0개 제품 제외: ${filteredOutCount}개 (${candidates.length} → ${candidatesWithReviews.length})`);
    }

    // ============================================================================
    // 🆕 LLM 기반 카테고리 사전 필터링 (액세서리/소모품 제외)
    // - flash-lite + 대용량 배치(20개) + 고병렬(10) = 빠른 처리
    // - 키워드 매칭보다 정확한 LLM 판단
    // ============================================================================
    const candidatesFiltered = await filterByCategoryWithLLM(candidatesWithReviews, catName);

    // ============================================================================
    // 1단계: Top N 상품 선정 + FilterTags 생성 (병렬 실행) 🚀
    // ============================================================================
    console.log(`[FinalRecommend] ⚡ Step 1: LLM 평가 + FilterTags 병렬 시작`);
    const step1StartTime = Date.now();

    const [topProductsResult, filterTagsResult] = await Promise.all([
      // Top N 선정 (리뷰 있고 + 본품만 대상) - 🆕 온보딩 정보 포함
      selectTopProducts(
        catName,
        candidatesFiltered,  // 🆕 리뷰 있는 제품 + 액세서리 제외
        reviews || {},
        enrichedCollectedInfo,  // 🆕 온보딩/아기정보 포함
        balanceSelections || [],
        expandedKeywords,
        freeInputAnalysisResult,
        extendedContext || null,  // 🆕 온보딩/아기정보 포함된 확장 컨텍스트
        conditionReport || null,  // 🆕 중간 보고서 (AI 요약 컨텍스트)
      ),
      // 필터 태그 생성 (2단계에서 사용) - 🆕 온보딩 데이터 포함된 enrichedCollectedInfo 사용
      generateFilterTags(
        catName,
        enrichedCollectedInfo,  // 🆕 온보딩/아기정보 포함
        balanceSelections || [],
        [], // negativeSelections 제거
        freeInputAnalysisResult  // 🆕 자유 입력 분석 결과 전달
      )
    ]);

    const { selectedProducts, productInfoMap } = topProductsResult;
    console.log(`[FinalRecommend] ⚡ Step 1 완료 (${Date.now() - step1StartTime}ms): Top ${selectedProducts.length}, FilterTags ${filterTagsResult.length}개, ProductInfo ${Object.keys(productInfoMap).length}개`);

    // 추천된 상품들의 pcode 추출
    const recommendedPcodes = selectedProducts.map((p: HardCutProduct) => p.pcode);

    console.log(`[FinalRecommend] Top ${RECOMMENDATION_COUNT} selected: ${recommendedPcodes.join(', ')}`);

    // ============================================================================
    // 🆕 Step 1.5: Top 5 제품의 리뷰 가져오기 (Supabase 캐시, 30개씩)
    // ============================================================================
    console.log(`[FinalRecommend] ⚡ Step 1.5: Top ${RECOMMENDATION_COUNT} 제품 리뷰 조회 (30개씩)`);
    const step15StartTime = Date.now();

    const { getReviewsFromCache } = await import('@/lib/knowledge-agent/supabase-cache');
    const reviewCacheResult = await getReviewsFromCache(recommendedPcodes);

    // 제품당 최대 30개로 제한 (한줄평 생성 + product-analysis에 충분)
    const enrichedReviews: Record<string, ReviewLite[]> = {};
    for (const pcode of recommendedPcodes) {
      const pcodeReviews = reviewCacheResult.reviews[pcode] || [];
      enrichedReviews[pcode] = pcodeReviews.slice(0, 30);
    }

    console.log(`[FinalRecommend] ⚡ Step 1.5 완료 (${Date.now() - step15StartTime}ms): ${Object.keys(enrichedReviews).length}개 제품, ${Object.values(enrichedReviews).reduce((sum, r) => sum + r.length, 0)}개 리뷰`);

    // ============================================================================
    // 2단계: 한줄평 생성 + 태그 충족도 평가 + 장단점 생성 (병렬)
    // ⚠️ Promise.allSettled로 일부 실패해도 나머지는 정상 처리
    // ============================================================================
    console.log(`[FinalRecommend] ⚡ Step 2: 한줄평 + 태그 평가 + 장단점 병렬 시작`);
    const step2StartTime = Date.now();

    const parallelResults = await Promise.allSettled([
      // 🆕 한줄평 생성 (PLP 표시용) - productInfoMap + 온보딩 정보 활용
      generateDetailedReasons(selectedProducts, enrichedReviews, catName, enrichedCollectedInfo, productInfoMap),
      // 태그 충족도 평가 (PLP 필터 필수)
      evaluateTagScoresForProducts(
        selectedProducts.map((p: HardCutProduct) => ({ pcode: p.pcode, product: p })),
        filterTagsResult,
        enrichedReviews,  // 🆕 Step 1.5에서 가져온 50개 리뷰 사용
        catName
      ),
    ]);

    console.log(`[FinalRecommend] ⚡ Step 2 완료 (${Date.now() - step2StartTime}ms)`);

    // 안전하게 결과 추출 (실패 시 fallback 사용)
    const recommendations = parallelResults[0].status === 'fulfilled'
      ? parallelResults[0].value
      : selectedProducts.map((p: HardCutProduct, i: number) => ({
          rank: i + 1,
          pcode: p.pcode,
          product: p,
          reason: `${p.brand} ${p.name}`,
          oneLiner: `✨ ${p.brand} 제품`,
          highlights: p.matchedConditions?.slice(0, 3) || [],
        }));

    const rawTagScoresMap = parallelResults[1].status === 'fulfilled'
      ? parallelResults[1].value
      : {};

    // 🚀 최적화: 장단점은 비교표 열 때 on-demand 생성
    const prosConsResults = [] as ProductProsConsResult[];

    // 🆕 상호 배타적 태그 후처리 (LLM 기반 판단, 같은 질문에서 full 중복 제거)
    const tagScoresMap = await enforceTagExclusivity(
      rawTagScoresMap,
      filterTagsResult,
      selectedProducts
    );

    // 디버깅: tagScoresMap 확인
    console.log('[FinalRecommend] rawTagScoresMap pcodes:', Object.keys(rawTagScoresMap));
    console.log('[FinalRecommend] tagScoresMap pcodes:', Object.keys(tagScoresMap));
    console.log('[FinalRecommend] selectedProducts pcodes:', selectedProducts.map((p: HardCutProduct) => p.pcode));

    // 실패한 작업 로깅
    parallelResults.forEach((result, i) => {
      if (result.status === 'rejected') {
        const taskNames = ['generateDetailedReasons', 'tagScores', 'prosConsGeneration'];
        console.error(`[FinalRecommend] ⚠️ ${taskNames[i]} failed:`, result.reason);
      }
    });

    // ============================================================================
    // 결과 병합: 각 추천 상품에 리뷰, 태그 충족도 추가 (PLP 필수 데이터만)
    // ============================================================================

    // ✅ Supabase에서 rank 조회 (pcode 기준)
    const recommendedPcodesForRank = recommendations.map((r: FinalRecommendation) => r.pcode);
    let rankMap: Record<string, number> = {};
    try {
      const { data: rankData } = await supabase
        .from('knowledge_products_cache')
        .select('pcode, rank')
        .in('pcode', recommendedPcodesForRank);

      if (rankData) {
        rankMap = Object.fromEntries(rankData.map((r: { pcode: string; rank: number }) => [r.pcode, r.rank]));
        console.log(`[FinalRecommend] ✅ DB rank 조회 완료:`, rankMap);
      }
    } catch (e) {
      console.error('[FinalRecommend] rank 조회 실패:', e);
    }

    // 🔄 장단점 결과를 pcode 맵으로 변환
    const prosConsMap: Record<string, ProductProsConsResult> = {};
    prosConsResults.forEach((result: ProductProsConsResult) => {
      prosConsMap[result.pcode] = result;
    });
    console.log(`[FinalRecommend] ✅ Pros/Cons generated for ${prosConsResults.length} products`);

    const enrichedRecommendations = recommendations.map((rec: FinalRecommendation) => {
      // 해당 상품의 리뷰 목록
      const productReviews = reviews?.[rec.pcode] || [];

      // 🆕 태그 충족도 (LLM 평가 결과)
      const tagScores = tagScoresMap[rec.pcode] || {};

      // 🔄 장단점 (비교표용)
      const prosCons = prosConsMap[rec.pcode];

      return {
        ...rec,
        // ✅ Supabase에서 조회한 다나와 판매순위
        danawaRank: rankMap[rec.pcode] || null,
        // 리뷰 목록 (PLP 표시용)
        reviews: productReviews,
        // 태그 충족도 (full/partial/null)
        tagScores,
        // 🔄 비교표용 장단점 (병렬 생성 완료)
        prosFromReviews: prosCons?.pros || [],
        consFromReviews: prosCons?.cons || [],
        // 🔧 product-analysis API 호환성 (highlights, concerns도 같이 전달)
        highlights: prosCons?.pros || [],
        concerns: prosCons?.cons || [],
        // 🔧 oneLiner: product-analysis API에서 생성 (fallback은 브랜드+제품명)
        oneLiner: rec.oneLiner || (rec.product ? `✨ ${rec.product.brand} ${rec.product.name?.slice(0, 30)}` : ''),
      };
    });

    // ============================================================================
    // 🆕 태그 충족도 기반 재정렬 (O > △ > X)
    // ============================================================================
    const calcTagScore = (tagScores: Record<string, unknown>): number => {
      let score = 0;
      for (const value of Object.values(tagScores)) {
        const status = typeof value === 'object' && value !== null ? (value as { score?: string }).score : value;
        if (status === 'full') score += 2;
        else if (status === 'partial') score += 1;
        // null = 0
      }
      return score;
    };

    // 태그 점수로 재정렬
    type EnrichedRec = (typeof enrichedRecommendations)[number];
    enrichedRecommendations.sort((a: EnrichedRec, b: EnrichedRec) => {
      const aScore = calcTagScore(a.tagScores || {});
      const bScore = calcTagScore(b.tagScores || {});
      return bScore - aScore; // 높은 점수가 앞으로
    });

    // rank 재부여
    enrichedRecommendations.forEach((rec: EnrichedRec, idx: number) => {
      rec.rank = idx + 1;
    });

    console.log(`[FinalRecommend] 🔄 태그 기반 재정렬 완료:`, enrichedRecommendations.map((r: EnrichedRec) => `${r.rank}위:${r.pcode}(태그${calcTagScore(r.tagScores || {})}점)`).join(', '));

    const elapsedMs = Date.now() - startTime;
    console.log(`✅ [FinalRecommend] 완료: Top ${recommendations.length} 선정 (${(elapsedMs / 1000).toFixed(1)}초)`);

    // 응답 (PLP 필수 데이터만)
    const response = {
      success: true,
      recommendations: enrichedRecommendations,
      summary: `${catName} 추천 Top ${recommendations.length}`,
      // ✅ 추가: 자유 입력 분석 결과 (PDP 선호/회피 조건 표시용)
      freeInputAnalysis: freeInputAnalysisResult,
      // 🆕 필터 태그 (사용자 조건 기반 동적 생성)
      filterTags: filterTagsResult,
      // 🆕 리뷰 데이터 (crawl-reviews API 중복 호출 방지, 30개씩)
      reviews: enrichedReviews,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[FinalRecommend] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
