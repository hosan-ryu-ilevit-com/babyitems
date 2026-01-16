import fs from 'fs/promises';
import path from 'path';

const INSIGHTS_DIR = path.join(process.cwd(), 'data/category-insights');

// 카테고리 키 → insights 파일명 매핑
const CATEGORY_KEY_TO_INSIGHTS_FILE: Record<string, string> = {
  formula_pot: 'milk_powder_port',
};

export interface CategoryInsight {
  category_key: string;
  category_name: string;
  guide?: {
    title?: string;
    summary?: string;
    key_points?: string[];
    trend?: string;
  };
  pros?: Array<{
    id: string;
    rank: number;
    mention_rate: number;
    text: string;
    keywords: string[];
    related_products?: string[];
  }>;
  cons?: Array<{
    id: string;
    rank: number;
    mention_rate: number;
    text: string;
    keywords: string[];
    related_products?: string[];
  }>;
}

/**
 * 카테고리 인사이트 로드
 */
export async function loadCategoryInsights(categoryKey: string): Promise<CategoryInsight | null> {
  try {
    const fileName = CATEGORY_KEY_TO_INSIGHTS_FILE[categoryKey] || categoryKey;
    const filePath = path.join(INSIGHTS_DIR, `${fileName}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as CategoryInsight;
  } catch (error) {
    console.log(`[insightsLoader] No insights found for category: ${categoryKey}`);
    return null;
  }
}

/**
 * 모든 카테고리 인사이트 로드
 */
export async function loadAllCategoryInsights(): Promise<Record<string, CategoryInsight>> {
  const result: Record<string, CategoryInsight> = {};
  try {
    const files = await fs.readdir(INSIGHTS_DIR);
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const key = file.replace('.json', '');
      const content = await fs.readFile(path.join(INSIGHTS_DIR, file), 'utf-8');
      result[key] = JSON.parse(content);
    }
  } catch (error) {
    console.error('[insightsLoader] Failed to load all insights:', error);
  }
  return result;
}
