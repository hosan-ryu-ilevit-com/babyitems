/**
 * Knowledge Agent V3 - 메모리 매니저
 *
 * 장기기억/단기기억 파일 CRUD 및 병합 로직
 */

import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  LongTermMemoryData,
  ShortTermMemoryData,
  MergeResult,
} from './types';
import {
  parseLongTermMemory,
  parseShortTermMemory,
  generateLongTermMarkdown,
  generateShortTermMarkdown,
} from './markdown-parser';

// Gemini - GEMINI_API_KEY 또는 GOOGLE_GENERATIVE_AI_API_KEY 둘 다 지원
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// 경로 설정
const KNOWLEDGE_BASE_PATH = path.join(process.cwd(), 'data', 'knowledge');

// ============================================================================
// 경로 유틸리티
// ============================================================================

function getLongTermPath(categoryKey: string): string {
  return path.join(KNOWLEDGE_BASE_PATH, categoryKey, 'index.md');
}

function getShortTermPath(categoryKey: string): string {
  return path.join(KNOWLEDGE_BASE_PATH, categoryKey, 'session.md');
}

function ensureCategoryDir(categoryKey: string): void {
  const categoryPath = path.join(KNOWLEDGE_BASE_PATH, categoryKey);
  if (!fs.existsSync(categoryPath)) {
    fs.mkdirSync(categoryPath, { recursive: true });
  }
}

// ============================================================================
// 장기기억 (Long-Term Memory) 관리
// ============================================================================

/**
 * 장기기억 마크다운 로드 (원본 텍스트)
 */
export function loadLongTermMemoryRaw(categoryKey: string): string | null {
  const filePath = getLongTermPath(categoryKey);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (e) {
    console.error(`[MemoryManager] Failed to load long-term memory for ${categoryKey}:`, e);
  }
  return null;
}

/**
 * 장기기억 파싱된 데이터 로드
 */
export function loadLongTermMemory(categoryKey: string): LongTermMemoryData | null {
  const raw = loadLongTermMemoryRaw(categoryKey);
  if (!raw) return null;

  try {
    return parseLongTermMemory(raw, categoryKey);
  } catch (e) {
    console.error(`[MemoryManager] Failed to parse long-term memory for ${categoryKey}:`, e);
    return null;
  }
}

/**
 * 장기기억 저장
 */
export function saveLongTermMemory(categoryKey: string, data: LongTermMemoryData): boolean {
  ensureCategoryDir(categoryKey);
  const filePath = getLongTermPath(categoryKey);

  try {
    const markdown = generateLongTermMarkdown(data);
    fs.writeFileSync(filePath, markdown, 'utf-8');
    console.log(`[MemoryManager] Long-term memory saved for ${categoryKey}`);
    return true;
  } catch (e) {
    console.error(`[MemoryManager] Failed to save long-term memory for ${categoryKey}:`, e);
    return false;
  }
}

/**
 * 장기기억 존재 여부 확인
 */
export function hasLongTermMemory(categoryKey: string): boolean {
  return fs.existsSync(getLongTermPath(categoryKey));
}

// ============================================================================
// 단기기억 (Short-Term Memory) 관리
// ============================================================================

/**
 * 단기기억 마크다운 로드 (원본 텍스트)
 */
export function loadShortTermMemoryRaw(categoryKey: string): string | null {
  const filePath = getShortTermPath(categoryKey);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (e) {
    console.error(`[MemoryManager] Failed to load short-term memory for ${categoryKey}:`, e);
  }
  return null;
}

/**
 * 단기기억 파싱된 데이터 로드
 */
export function loadShortTermMemory(categoryKey: string): ShortTermMemoryData | null {
  const raw = loadShortTermMemoryRaw(categoryKey);
  if (!raw) return null;

  try {
    return parseShortTermMemory(raw);
  } catch (e) {
    console.error(`[MemoryManager] Failed to parse short-term memory for ${categoryKey}:`, e);
    return null;
  }
}

/**
 * 단기기억 저장
 */
export function saveShortTermMemory(categoryKey: string, data: ShortTermMemoryData): boolean {
  ensureCategoryDir(categoryKey);
  const filePath = getShortTermPath(categoryKey);

  try {
    const markdown = generateShortTermMarkdown(data);
    fs.writeFileSync(filePath, markdown, 'utf-8');
    console.log(`[MemoryManager] Short-term memory saved for ${categoryKey} (session: ${data.sessionId})`);
    return true;
  } catch (e) {
    console.error(`[MemoryManager] Failed to save short-term memory for ${categoryKey}:`, e);
    return false;
  }
}

/**
 * 단기기억 삭제
 */
export function deleteShortTermMemory(categoryKey: string): boolean {
  const filePath = getShortTermPath(categoryKey);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[MemoryManager] Short-term memory deleted for ${categoryKey}`);
      return true;
    }
  } catch (e) {
    console.error(`[MemoryManager] Failed to delete short-term memory for ${categoryKey}:`, e);
  }
  return false;
}

/**
 * 단기기억 존재 여부 확인
 */
export function hasShortTermMemory(categoryKey: string): boolean {
  return fs.existsSync(getShortTermPath(categoryKey));
}

/**
 * 새 세션 ID 생성
 */
export function generateSessionId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
  const random = Math.random().toString(36).substring(2, 6);
  return `${dateStr}_${timeStr}_${random}`;
}

/**
 * 새 단기기억 초기화
 */
export function initializeShortTermMemory(
  categoryKey: string,
  categoryName: string,
  totalProducts: number
): ShortTermMemoryData {
  return {
    sessionId: generateSessionId(),
    startedAt: new Date().toISOString(),
    categoryKey,
    categoryName,
    webSearchInsights: [],
    collectedInfo: {},
    filteredCandidates: [],
    filterHistory: [],
    balanceQuestions: [],
    balanceSelections: [],
    negativeSelections: [],
    finalRecommendations: [],
    totalProducts,
    currentCandidateCount: totalProducts,
  };
}

// ============================================================================
// 메모리 병합 (AI 기반)
// ============================================================================

/**
 * 단기기억을 장기기억에 병합 (AI가 스마트하게 정리)
 */
export async function mergeToLongTermMemory(categoryKey: string): Promise<MergeResult> {
  const shortTerm = loadShortTermMemory(categoryKey);
  const longTerm = loadLongTermMemory(categoryKey);

  if (!shortTerm) {
    return {
      success: false,
      updatedSections: [],
      newInsightsCount: 0,
      productUpdates: 0,
      error: 'No short-term memory found',
    };
  }

  if (!longTerm) {
    return {
      success: false,
      updatedSections: [],
      newInsightsCount: 0,
      productUpdates: 0,
      error: 'No long-term memory found',
    };
  }

  if (!ai) {
    return {
      success: false,
      updatedSections: [],
      newInsightsCount: 0,
      productUpdates: 0,
      error: 'AI not configured',
    };
  }

  try {
    const model = ai.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.3 },
    });

    // 단기기억에서 유용한 정보 추출 프롬프트
    const prompt = `
당신은 ${longTerm.categoryName} 전문가 지식 관리자입니다.

## 현재 장기기억 (요약)
- 트렌드: ${longTerm.trends.items.join(', ')}
- 장점: ${longTerm.trends.pros.join(', ')}
- 단점: ${longTerm.trends.cons.join(', ')}
- 상품 수: ${longTerm.products.length}개

## 새 세션에서 수집된 정보

### 웹서치 인사이트
${shortTerm.webSearchInsights.map(w => `- [${w.phase}] ${w.insight}`).join('\n')}

### 사용자 선호 정보
${Object.entries(shortTerm.collectedInfo).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

### 밸런스 게임 선택
${shortTerm.balanceSelections.map(b => `- ${b.questionId}: ${b.selectedLabel}`).join('\n')}

### 피하고 싶은 단점
${shortTerm.negativeSelections.join(', ')}

### 최종 추천 상품
${shortTerm.finalRecommendations.map(r => `- ${r.rank}. ${r.name}: ${r.reason}`).join('\n')}

---

## 과제
위 세션 정보를 분석하여 장기기억에 반영할 내용을 JSON으로 응답하세요.

반영 기준:
1. 새로운 트렌드 인사이트가 있으면 추가
2. 새로운 장점/단점 패턴이 발견되면 추가
3. 상품의 추천 대상(recommendedFor) 업데이트가 필요하면 제안
4. 개인화된 정보(예: 예산, 가족 수 등)는 제외

JSON 형식:
{
  "newTrends": ["새 트렌드1", ...] 또는 [],
  "newPros": ["새 장점1", ...] 또는 [],
  "newCons": ["새 단점1", ...] 또는 [],
  "productUpdates": [
    { "pcode": "...", "recommendedFor": "새로운 추천 대상 문구" }
  ] 또는 [],
  "summary": "이번 세션에서 발견된 주요 인사이트 1-2문장"
}

기존에 있는 내용과 중복되면 빈 배열로 응답하세요.
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // JSON 파싱
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[MemoryManager] No merge suggestions from AI');
      deleteShortTermMemory(categoryKey);
      return {
        success: true,
        updatedSections: [],
        newInsightsCount: 0,
        productUpdates: 0,
      };
    }

    const suggestions = JSON.parse(jsonMatch[0]);
    const updatedSections: string[] = [];
    let newInsightsCount = 0;
    let productUpdatesCount = 0;

    // 트렌드 업데이트
    if (suggestions.newTrends?.length > 0) {
      longTerm.trends.items = [...new Set([...longTerm.trends.items, ...suggestions.newTrends])].slice(0, 10);
      updatedSections.push('trends');
      newInsightsCount += suggestions.newTrends.length;
    }

    // 장점 업데이트
    if (suggestions.newPros?.length > 0) {
      longTerm.trends.pros = [...new Set([...longTerm.trends.pros, ...suggestions.newPros])].slice(0, 10);
      updatedSections.push('pros');
      newInsightsCount += suggestions.newPros.length;
    }

    // 단점 업데이트
    if (suggestions.newCons?.length > 0) {
      longTerm.trends.cons = [...new Set([...longTerm.trends.cons, ...suggestions.newCons])].slice(0, 10);
      updatedSections.push('cons');
      newInsightsCount += suggestions.newCons.length;
    }

    // 상품 추천 대상 업데이트
    if (suggestions.productUpdates?.length > 0) {
      for (const update of suggestions.productUpdates) {
        const product = longTerm.products.find(p => p.pcode === update.pcode);
        if (product && update.recommendedFor) {
          product.recommendedFor = update.recommendedFor;
          productUpdatesCount++;
        }
      }
      if (productUpdatesCount > 0) {
        updatedSections.push('products');
      }
    }

    // 업데이트 날짜 갱신
    longTerm.lastUpdated = new Date().toISOString().slice(0, 10);

    // 장기기억 저장
    saveLongTermMemory(categoryKey, longTerm);

    // 단기기억 삭제
    deleteShortTermMemory(categoryKey);

    console.log(`[MemoryManager] Merge completed for ${categoryKey}:`, {
      updatedSections,
      newInsightsCount,
      productUpdatesCount,
      summary: suggestions.summary,
    });

    return {
      success: true,
      updatedSections,
      newInsightsCount,
      productUpdates: productUpdatesCount,
    };
  } catch (e) {
    console.error(`[MemoryManager] Merge failed for ${categoryKey}:`, e);
    return {
      success: false,
      updatedSections: [],
      newInsightsCount: 0,
      productUpdates: 0,
      error: String(e),
    };
  }
}

// ============================================================================
// 유틸리티
// ============================================================================

/**
 * 카테고리 목록 조회
 */
export function getAvailableCategories(): string[] {
  try {
    if (!fs.existsSync(KNOWLEDGE_BASE_PATH)) {
      return [];
    }
    return fs.readdirSync(KNOWLEDGE_BASE_PATH)
      .filter(name => {
        const categoryPath = path.join(KNOWLEDGE_BASE_PATH, name);
        return fs.statSync(categoryPath).isDirectory() &&
               fs.existsSync(path.join(categoryPath, 'index.md'));
      });
  } catch (e) {
    console.error('[MemoryManager] Failed to list categories:', e);
    return [];
  }
}

/**
 * 카테고리 메모리 상태 조회
 */
export function getCategoryMemoryStatus(categoryKey: string): {
  hasLongTerm: boolean;
  hasShortTerm: boolean;
  longTermLastUpdated?: string;
  shortTermSessionId?: string;
} {
  const longTerm = loadLongTermMemory(categoryKey);
  const shortTerm = loadShortTermMemory(categoryKey);

  return {
    hasLongTerm: !!longTerm,
    hasShortTerm: !!shortTerm,
    longTermLastUpdated: longTerm?.lastUpdated,
    shortTermSessionId: shortTerm?.sessionId,
  };
}
