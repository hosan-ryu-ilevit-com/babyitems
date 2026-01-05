/**
 * Knowledge Agent V3 - 장기기억 업데이트 스크립트
 *
 * 다나와에서 Top 20 상품을 크롤링하고 스펙/리뷰를 강화하여 장기기억 마크다운 생성
 *
 * 사용법:
 *   npx tsx scripts/update-long-term-memory.ts                    # 모든 카테고리
 *   npx tsx scripts/update-long-term-memory.ts --category=airfryer  # 특정 카테고리만
 *   npx tsx scripts/update-long-term-memory.ts --skip-reviews       # 리뷰 크롤링 스킵 (빠름)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.local 로드
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

import { crawlDanawaSearchList } from '../lib/danawa/search-crawler';
import {
  convertToProductKnowledge,
  batchEnrichProducts,
  analyzeProductTrends,
  generateBuyingGuide,
} from '../lib/knowledge-agent/product-enricher';
import {
  saveLongTermMemory,
  loadLongTermMemory,
} from '../lib/knowledge-agent/memory-manager';
import type { LongTermMemoryData, ProductKnowledge, Source } from '../lib/knowledge-agent/types';
import { CATEGORY_NAME_MAP } from '../lib/knowledge-agent/types';

// ============================================================================
// 설정
// ============================================================================

const PRODUCTS_PER_CATEGORY = 20;
const REVIEW_PAGES_PER_PRODUCT = 2;
const BATCH_CONCURRENCY = 3;
const BATCH_DELAY_MS = 1500;

// 카테고리별 검색 키워드
const CATEGORY_SEARCH_QUERIES: Record<string, string> = {
  airfryer: '에어프라이어',
  robotcleaner: '로봇청소기',
  humidifier: '가습기',
  airpurifier: '공기청정기',
  cordlessvacuum: '무선청소기',
  ricecooker: '전기밥솥',
};

// ============================================================================
// 메인 로직
// ============================================================================

async function updateCategoryMemory(
  categoryKey: string,
  options: {
    skipReviews?: boolean;
    skipSpecs?: boolean;
  } = {}
): Promise<boolean> {
  const categoryName = CATEGORY_NAME_MAP[categoryKey];
  const searchQuery = CATEGORY_SEARCH_QUERIES[categoryKey];

  if (!categoryName || !searchQuery) {
    console.error(`❌ Unknown category: ${categoryKey}`);
    return false;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔄 Updating long-term memory for: ${categoryName} (${categoryKey})`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    // 1. 다나와에서 인기순 상품 크롤링
    console.log(`📦 Step 1: Crawling top ${PRODUCTS_PER_CATEGORY} products from Danawa...`);

    const searchResult = await crawlDanawaSearchList({
      query: searchQuery,
      sort: 'saveDESC', // 인기순
      limit: PRODUCTS_PER_CATEGORY + 10, // 여유분
    });

    if (!searchResult.success || searchResult.items.length === 0) {
      console.error(`❌ Failed to crawl products for ${categoryKey}`);
      return false;
    }

    console.log(`✅ Found ${searchResult.items.length} products`);

    // 2. ProductKnowledge로 변환
    console.log(`\n📊 Step 2: Converting to ProductKnowledge...`);

    let products: ProductKnowledge[] = searchResult.items
      .slice(0, PRODUCTS_PER_CATEGORY)
      .map((item, index) => convertToProductKnowledge(item, index + 1));

    console.log(`✅ Converted ${products.length} products`);

    // 3. 상세 스펙 + 리뷰 강화
    if (!options.skipSpecs || !options.skipReviews) {
      console.log(`\n🔍 Step 3: Enriching products with specs and reviews...`);
      console.log(`   - Include specs: ${!options.skipSpecs}`);
      console.log(`   - Include reviews: ${!options.skipReviews}`);
      console.log(`   - Concurrency: ${BATCH_CONCURRENCY}`);
      console.log(`   - Delay: ${BATCH_DELAY_MS}ms`);

      products = await batchEnrichProducts(products, {
        includeSpecs: !options.skipSpecs,
        includeReviews: !options.skipReviews,
        maxReviewPages: REVIEW_PAGES_PER_PRODUCT,
        concurrency: BATCH_CONCURRENCY,
        delayMs: BATCH_DELAY_MS,
      });

      console.log(`✅ Enrichment complete`);
    } else {
      console.log(`\n⏭️ Step 3: Skipping enrichment (both specs and reviews disabled)`);
    }

    // 4. 트렌드 분석
    console.log(`\n📈 Step 4: Analyzing trends...`);

    const trends = await analyzeProductTrends(products, categoryName);
    console.log(`✅ Trends analyzed:`);
    console.log(`   - Trends: ${trends.trends.length}`);
    console.log(`   - Common pros: ${trends.commonPros.length}`);
    console.log(`   - Common cons: ${trends.commonCons.length}`);

    // 5. 구매 가이드 생성
    console.log(`\n💡 Step 5: Generating buying guide...`);

    const buyingGuide = await generateBuyingGuide(products, categoryName);
    console.log(`✅ Buying guide generated:`);
    console.log(`   - User types: ${Object.keys(buyingGuide.byUserType).length}`);
    console.log(`   - Budget ranges: ${Object.keys(buyingGuide.byBudget).length}`);
    console.log(`   - Common mistakes: ${buyingGuide.commonMistakes.length}`);

    // 6. 기존 장기기억 병합 (있으면)
    console.log(`\n🔄 Step 6: Merging with existing memory...`);

    const existingMemory = loadLongTermMemory(categoryKey);
    let sources: Source[] = [
      {
        title: '다나와 검색',
        url: searchResult.searchUrl,
        accessedAt: new Date().toISOString().slice(0, 10),
      },
    ];

    if (existingMemory?.sources) {
      // 기존 소스 유지 (중복 제거)
      const existingUrls = new Set(existingMemory.sources.map((s) => s.url));
      sources = [
        ...sources,
        ...existingMemory.sources.filter((s) => !existingUrls.has(s.url)),
      ];
    }

    // 7. 장기기억 데이터 구성
    console.log(`\n💾 Step 7: Saving long-term memory...`);

    const totalReviews = products.reduce((sum, p) => sum + p.reviewCount, 0);

    const longTermData: LongTermMemoryData = {
      categoryKey,
      categoryName,
      lastUpdated: new Date().toISOString().slice(0, 10),
      productCount: products.length,
      reviewCount: totalReviews,
      trends: {
        items: trends.trends,
        pros: trends.commonPros,
        cons: trends.commonCons,
        priceInsight: trends.priceInsight,
      },
      products,
      buyingGuide,
      sources,
    };

    const saved = saveLongTermMemory(categoryKey, longTermData);

    if (saved) {
      console.log(`✅ Long-term memory saved successfully!`);
      console.log(`   📁 Path: data/knowledge/${categoryKey}/index.md`);
      console.log(`   📦 Products: ${products.length}`);
      console.log(`   💬 Total reviews: ${totalReviews.toLocaleString()}`);
    } else {
      console.error(`❌ Failed to save long-term memory`);
      return false;
    }

    return true;
  } catch (error) {
    console.error(`❌ Error updating ${categoryKey}:`, error);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  // 옵션 파싱
  const categoryArg = args.find((a) => a.startsWith('--category='));
  const skipReviews = args.includes('--skip-reviews');
  const skipSpecs = args.includes('--skip-specs');
  const helpFlag = args.includes('--help') || args.includes('-h');

  if (helpFlag) {
    console.log(`
📚 Knowledge Agent V3 - Long-Term Memory Update Script

Usage:
  npx tsx scripts/update-long-term-memory.ts [options]

Options:
  --category=<key>  Update only specific category (e.g., airfryer)
  --skip-reviews    Skip review crawling (faster)
  --skip-specs      Skip detailed spec crawling (faster)
  --help, -h        Show this help message

Available categories:
  ${Object.entries(CATEGORY_NAME_MAP)
    .map(([key, name]) => `- ${key}: ${name}`)
    .join('\n  ')}

Examples:
  npx tsx scripts/update-long-term-memory.ts --category=airfryer
  npx tsx scripts/update-long-term-memory.ts --skip-reviews
  npx tsx scripts/update-long-term-memory.ts --category=robotcleaner --skip-specs
`);
    process.exit(0);
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   Knowledge Agent V3 - Long-Term Memory Update                ║
║   장기기억 업데이트 스크립트                                      ║
╚═══════════════════════════════════════════════════════════════╝
`);

  const options = { skipReviews, skipSpecs };

  if (categoryArg) {
    const categoryKey = categoryArg.split('=')[1];
    const success = await updateCategoryMemory(categoryKey, options);
    process.exit(success ? 0 : 1);
  } else {
    // 모든 카테고리 업데이트
    const categories = Object.keys(CATEGORY_NAME_MAP);
    console.log(`📦 Updating all ${categories.length} categories...`);

    let successCount = 0;
    for (const categoryKey of categories) {
      const success = await updateCategoryMemory(categoryKey, options);
      if (success) successCount++;

      // 카테고리 간 딜레이
      if (categoryKey !== categories[categories.length - 1]) {
        console.log(`\n⏳ Waiting 5 seconds before next category...\n`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   Update Complete                                             ║
║   성공: ${successCount}/${categories.length} 카테고리                                      ║
╚═══════════════════════════════════════════════════════════════╝
`);

    process.exit(successCount === categories.length ? 0 : 1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
