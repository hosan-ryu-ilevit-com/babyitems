/**
 * 카테고리별 다나와 상품 크롤링 스크립트
 *
 * 기능:
 * - 인기순 120개 + 리뷰순 120개 크롤링 후 합집합
 * - 리뷰 5개 이하 상품 자동 스킵
 * - 이미 저장된 pcode는 스킵 (랭킹만 업데이트)
 *
 * 실행: npx tsx scripts/crawl-category-products.ts
 * 옵션:
 *   --category=분유        특정 카테고리만 크롤링
 *   --dry-run             DB 저장 없이 테스트
 *   --limit=60            카테고리별 크롤링 개수 (기본 120)
 *   --min-reviews=5       최소 리뷰 수 (기본 5)
 */

import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { crawlDanawaSearchListLite } from '../lib/danawa/search-crawler-lite';
import type { DanawaSearchListItem } from '../lib/danawa/search-crawler';

dotenv.config({ path: path.join(__dirname, '../.env.local') });

// =====================================================
// 설정
// =====================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 카테고리 타입
interface CategoryInfo {
  id: string;
  name: string;
  searchQuery: string;
}

// Supabase에서 카테고리 목록 가져오기
async function fetchCategories(): Promise<CategoryInfo[]> {
  console.log('📂 Supabase에서 카테고리 목록 조회 중...');

  const { data, error } = await supabase
    .from('knowledge_categories')
    .select('query')
    .eq('is_active', true)
    .order('query');

  if (error) {
    console.error('❌ 카테고리 조회 실패:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    console.error('❌ 카테고리가 없습니다.');
    throw new Error('No categories found');
  }

  // query가 카테고리명이자 검색어
  const categories = data.map(cat => ({
    id: cat.query,
    name: cat.query,
    searchQuery: cat.query,
  }));

  console.log(`✅ ${categories.length}개 카테고리 조회 완료`);
  return categories;
}

// =====================================================
// 유틸리티
// =====================================================

function parseArgs(): {
  targetCategory: string | null;
  dryRun: boolean;
  limit: number;
  minReviews: number;
} {
  const args = process.argv.slice(2);
  let targetCategory: string | null = null;
  let dryRun = false;
  let limit = 200;
  let minReviews = 5;

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      targetCategory = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      limit = parseInt(arg.split('=')[1], 10) || 120;
    } else if (arg.startsWith('--min-reviews=')) {
      minReviews = parseInt(arg.split('=')[1], 10) || 5;
    }
  }

  return { targetCategory, dryRun, limit, minReviews };
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =====================================================
// 크롤링 로직
// =====================================================

interface CrawlResult {
  pcode: string;
  name: string;
  brand: string | null;
  price: number | null;
  thumbnail: string | null;
  reviewCount: number;
  rating: number | null;
  specSummary: string;
  productUrl: string;
  popularityRank: number | null;  // 인기순 랭킹
  reviewRank: number | null;      // 리뷰순 랭킹
}

const PAGE_SIZE = 120; // 다나와 한 페이지 최대

async function crawlCategoryProducts(
  categoryId: string,
  searchQuery: string,
  targetCount: number,
  minReviews: number
): Promise<CrawlResult[]> {
  console.log(`\n🔍 [${categoryId}] "${searchQuery}" 크롤링 시작 (목표: ${targetCount}개)...`);

  const results: CrawlResult[] = [];
  const seenPcodes = new Set<string>();
  let totalSkipped = 0;
  let page = 1;
  let consecutiveEmptyPages = 0; // 연속 0개 추가된 페이지 수
  const MAX_EMPTY_PAGES = 3; // 연속 3페이지 0개면 중단

  // 페이지네이션: 목표 개수 도달할 때까지 반복
  while (results.length < targetCount) {
    console.log(`   📊 페이지 ${page} 크롤링 중...`);

    try {
      const crawlResult = await crawlDanawaSearchListLite({
        query: searchQuery,
        sort: 'saveDESC',
        limit: PAGE_SIZE,
        // 다나와 페이지 파라미터: page (1부터 시작)
        ...(page > 1 && { page }),
      } as any); // page 파라미터 추가

      if (!crawlResult.success || crawlResult.items.length === 0) {
        console.log(`   ⚠️ 페이지 ${page}: 결과 없음, 크롤링 종료`);
        break;
      }

      let pageAdded = 0;
      let pageSkipped = 0;

      for (const item of crawlResult.items) {
        // 중복 체크
        if (seenPcodes.has(item.pcode)) continue;
        seenPcodes.add(item.pcode);

        if (item.reviewCount > minReviews) {
          results.push({
            ...item,
            popularityRank: results.length + 1,
            reviewRank: null,
          });
          pageAdded++;

          // 목표 도달 시 중단
          if (results.length >= targetCount) break;
        } else {
          pageSkipped++;
          totalSkipped++;
        }
      }

      console.log(`   ✅ 페이지 ${page}: ${crawlResult.items.length}개 중 ${pageAdded}개 추가 (스킵: ${pageSkipped}개) → 총 ${results.length}개`);

      // 연속 0개 추가 체크
      if (pageAdded === 0) {
        consecutiveEmptyPages++;
        console.log(`   ⚠️ 연속 ${consecutiveEmptyPages}페이지 0개 추가`);
        if (consecutiveEmptyPages >= MAX_EMPTY_PAGES) {
          console.log(`   🛑 연속 ${MAX_EMPTY_PAGES}페이지 0개 추가로 크롤링 중단`);
          break;
        }
      } else {
        consecutiveEmptyPages = 0; // 리셋
      }

      // 더 이상 결과 없으면 종료
      if (crawlResult.items.length < PAGE_SIZE) {
        console.log(`   📄 마지막 페이지 도달`);
        break;
      }

      page++;
      await delay(1000); // Rate limiting between pages

    } catch (error) {
      console.error(`   ❌ 페이지 ${page} 크롤링 에러:`, error);
      break;
    }
  }

  console.log(`   📦 크롤링 완료: 총 ${results.length}개 (리뷰 ${minReviews}개 이하 ${totalSkipped}개 스킵)`);
  return results;
}

// =====================================================
// DB 저장 로직 (knowledge_products_cache 테이블)
// =====================================================

interface SaveResult {
  inserted: number;
  updated: number;
  skipped: number;
}

async function saveToSupabase(
  categoryName: string,  // query로 사용
  products: CrawlResult[],
  dryRun: boolean
): Promise<SaveResult> {
  if (products.length === 0) {
    return { inserted: 0, updated: 0, skipped: 0 };
  }

  console.log(`   💾 knowledge_products_cache에 저장 중... (query: "${categoryName}")`);

  if (dryRun) {
    console.log(`   🔸 [DRY-RUN] DB 저장 스킵`);
    return { inserted: products.length, updated: 0, skipped: 0 };
  }

  let saved = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE).map(p => ({
      query: categoryName,
      pcode: p.pcode,
      name: p.name,
      brand: p.brand,
      price: p.price,
      thumbnail: p.thumbnail,
      review_count: p.reviewCount,
      rating: p.rating,
      spec_summary: p.specSummary,
      product_url: p.productUrl,
      rank: p.popularityRank,
      crawled_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('knowledge_products_cache')
      .upsert(batch, { onConflict: 'query,pcode' });

    if (error) {
      console.error(`   ❌ 저장 실패 (배치 ${Math.floor(i / BATCH_SIZE) + 1}):`, error);
    } else {
      saved += batch.length;
    }
  }

  console.log(`   ✅ ${saved}개 저장 완료`);
  return { inserted: saved, updated: 0, skipped: 0 };
}

// =====================================================
// 메인 실행
// =====================================================

async function main() {
  const { targetCategory, dryRun, limit, minReviews } = parseArgs();

  console.log('🚀 카테고리별 다나와 상품 크롤링 시작');
  console.log(`   설정: limit=${limit}, minReviews=${minReviews}, dryRun=${dryRun}`);

  // Supabase에서 카테고리 목록 가져오기
  const allCategories = await fetchCategories();

  if (targetCategory) {
    console.log(`   대상 카테고리: ${targetCategory}`);
  } else {
    console.log(`   대상 카테고리: 전체 (${allCategories.length}개)`);
  }

  const categories = targetCategory
    ? allCategories.filter(c => c.name === targetCategory || c.id === targetCategory)
    : allCategories;

  if (categories.length === 0) {
    console.error(`❌ 카테고리를 찾을 수 없습니다: ${targetCategory}`);
    process.exit(1);
  }

  const totalStats = {
    inserted: 0,
    skipped: 0,
  };

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📁 [${i + 1}/${categories.length}] ${category.name} (${category.id})`);
    console.log('='.repeat(60));

    // 크롤링
    const products = await crawlCategoryProducts(
      category.id,
      category.searchQuery,
      limit,
      minReviews
    );

    // 저장 (query = category.name으로 저장)
    const saveResult = await saveToSupabase(category.name, products, dryRun);

    totalStats.inserted += saveResult.inserted;
    totalStats.skipped += saveResult.skipped;

    // Rate limiting between categories
    if (i < categories.length - 1) {
      console.log(`\n⏳ 다음 카테고리 전 2초 대기...`);
      await delay(2000);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 최종 통계');
  console.log('='.repeat(60));
  console.log(`   저장: ${totalStats.inserted}개`);
  console.log(`   스킵: ${totalStats.skipped}개`);
  console.log(`\n✨ 크롤링 완료!`);
}

main().catch(console.error);
