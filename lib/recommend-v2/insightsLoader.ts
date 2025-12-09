/**
 * Category Insights Loader
 *
 * 카테고리별 리뷰 기반 인사이트 데이터를 로드하는 유틸리티
 */

import type { CategoryInsights } from '@/types/category-insights';
import * as fs from 'fs';
import * as path from 'path';

// 캐시 (서버 사이드에서 파일을 반복 로드하지 않도록)
const insightsCache: Record<string, CategoryInsights> = {};

/**
 * 특정 카테고리의 insights 데이터를 로드
 */
export async function loadCategoryInsights(categoryKey: string): Promise<CategoryInsights | null> {
  // 캐시 확인
  if (insightsCache[categoryKey]) {
    return insightsCache[categoryKey];
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'category-insights', `${categoryKey}.json`);

    // 파일 존재 확인
    if (!fs.existsSync(filePath)) {
      console.warn(`Category insights file not found: ${filePath}`);
      return null;
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const insights: CategoryInsights = JSON.parse(fileContent);

    // 캐시에 저장
    insightsCache[categoryKey] = insights;

    return insights;
  } catch (error) {
    console.error(`Failed to load category insights for ${categoryKey}:`, error);
    return null;
  }
}

/**
 * 모든 카테고리의 insights 데이터를 로드
 */
export async function loadAllCategoryInsights(): Promise<Record<string, CategoryInsights>> {
  const result: Record<string, CategoryInsights> = {};

  try {
    const insightsDir = path.join(process.cwd(), 'data', 'category-insights');
    const files = fs.readdirSync(insightsDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const categoryKey = file.replace('.json', '');
      const insights = await loadCategoryInsights(categoryKey);
      if (insights) {
        result[categoryKey] = insights;
      }
    }
  } catch (error) {
    console.error('Failed to load all category insights:', error);
  }

  return result;
}

/**
 * 사용 가능한 카테고리 키 목록
 */
export async function getAvailableCategoryKeys(): Promise<string[]> {
  try {
    const insightsDir = path.join(process.cwd(), 'data', 'category-insights');
    const files = fs.readdirSync(insightsDir).filter(f => f.endsWith('.json'));
    return files.map(f => f.replace('.json', ''));
  } catch (error) {
    console.error('Failed to get available category keys:', error);
    return [];
  }
}

/**
 * 캐시 클리어 (개발용)
 */
export function clearInsightsCache(): void {
  Object.keys(insightsCache).forEach(key => delete insightsCache[key]);
}
