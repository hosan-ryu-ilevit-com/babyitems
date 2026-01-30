#!/usr/bin/env npx tsx
/**
 * Product Info 인덱싱 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/index-product-info.ts --category="이유식조리기"  # 특정 카테고리
 *   npx tsx scripts/indexing/index-product-info.ts                            # 전체 카테고리
 *   npx tsx scripts/indexing/index-product-info.ts --concurrency=2            # 동시 처리 수 조절
 *   npx tsx scripts/indexing/index-product-info.ts --no-skip                  # 이미 인덱싱된 상품도 재처리
 *
 * 기능:
 * 1. 맞춤질문 MD 파싱
 * 2. 상품별 웹검색 보강
 * 3. LLM으로 맞춤질문 옵션 매핑
 * 4. product_info JSONB로 저장
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import {
  parseQuestionsMarkdown,
  parsedQuestionsToTodos,
} from '../../lib/indexing/markdown-utils';
import {
  enrichProductWithWebSearch,
  analyzeProduct,
} from '../../lib/indexing/web-enricher';
import {
  mapProductToOptions,
  parseSpecSummary,
  extractSpecHighlights,
} from '../../lib/indexing/option-mapper';
import type {
  ProductInfo,
  QuestionTodo,
  IndexingResult,
  BatchIndexingResult,
} from '../../lib/indexing/types';

// ============================================================================
// 설정
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_CONCURRENCY = 3;  // Rate limit 방지를 위해 3으로 감소
const BATCH_DELAY_MS = 2000;    // Rate limit 방지를 위해 2초로 증가
const MAX_RETRIES = 3;
const REQUEST_DELAY_MS = 500;   // 개별 요청 간 딜레이

// ============================================================================
// 타입 정의
// ============================================================================

interface CachedProduct {
  pcode: string;
  name: string;
  brand: string | null;
  price: number | null;
  spec_summary: string;
  review_count: number;
  rating: number | null;
  product_url: string;
  thumbnail: string | null;
  product_info: ProductInfo | null;
}

// ============================================================================
// 메인 함수
// ============================================================================

const CATEGORY_DELAY_MS = 5000; // 카테고리 간 딜레이 (rate limit 방지)

async function main() {
  const args = parseArgs();
  const categoryName = args.category;
  const concurrency = args.concurrency || DEFAULT_CONCURRENCY;
  const skipIndexed = args.skipIndexed;

  // 특정 카테고리 지정 시 해당 카테고리만 처리
  if (categoryName) {
    await processCategory(categoryName, concurrency, skipIndexed);
    return;
  }

  // 전체 카테고리 처리
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 전체 카테고리 Product Info 인덱싱 시작`);
  console.log(`   동시 처리: ${concurrency}개 | 이미 인덱싱된 상품: ${skipIndexed ? '스킵' : '재처리'}`);
  console.log(`${'='.repeat(60)}\n`);

  const categories = await getAllCategories();
  console.log(`📋 처리할 카테고리: ${categories.length}개`);
  categories.forEach((c, i) => console.log(`   ${i + 1}. ${c}`));

  const results: { category: string; success: number; failed: number; error?: string }[] = [];

  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📁 [${i + 1}/${categories.length}] ${category}`);
    console.log(`${'─'.repeat(60)}`);

    try {
      const result = await processCategory(category, concurrency, skipIndexed);
      results.push({ category, success: result.successCount, failed: result.failedCount });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ ${category} 실패: ${errorMsg}`);
      results.push({ category, success: 0, failed: 0, error: errorMsg });
    }

    // Rate limit 방지 딜레이
    if (i < categories.length - 1) {
      console.log(`\n⏳ ${CATEGORY_DELAY_MS / 1000}초 대기 중...`);
      await sleep(CATEGORY_DELAY_MS);
    }
  }

  // 최종 결과
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 전체 결과`);
  console.log(`${'='.repeat(60)}`);
  const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  console.log(`   총 성공: ${totalSuccess}개 | 총 실패: ${totalFailed}개`);
  console.log(`   카테고리별:`);
  results.forEach(r => {
    if (r.error) {
      console.log(`     - ${r.category}: ❌ ${r.error}`);
    } else {
      console.log(`     - ${r.category}: ✅ ${r.success}개 성공, ${r.failed}개 실패`);
    }
  });
}

async function getAllCategories(): Promise<string[]> {
  // custom_questions가 있는 카테고리만 (맞춤질문 생성이 완료된 카테고리)
  const { data, error } = await supabase
    .from('knowledge_categories')
    .select('query, custom_questions')
    .eq('is_active', true)
    .not('custom_questions', 'is', null)
    .order('query');

  if (error) throw new Error(`카테고리 조회 실패: ${error.message}`);

  return (data || []).map(c => c.query);
}

async function processCategory(
  categoryName: string,
  concurrency: number,
  skipIndexed: boolean
): Promise<BatchIndexingResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Product Info 인덱싱 시작: ${categoryName}`);
  console.log(`   동시 처리: ${concurrency}개 | 배치 딜레이: ${BATCH_DELAY_MS}ms`);
  console.log(`   이미 인덱싱된 상품: ${skipIndexed ? '스킵' : '재처리'}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  // 1. 맞춤질문 로드
  console.log('[Step 1] 맞춤질문 로드 중...');
  const questions = await loadCustomQuestions(categoryName);
  console.log(`  ✅ ${questions.length}개 질문 로드 완료`);
  questions.forEach((q, i) => {
    console.log(`     ${i + 1}. ${q.id}: ${q.question.slice(0, 30)}...`);
  });

  // 2. 상품 목록 조회
  console.log('\n[Step 2] 상품 목록 조회 중...');
  const products = await getProductsFromCache(categoryName, skipIndexed);
  console.log(`  ✅ ${products.length}개 상품 처리 예정`);

  if (products.length === 0) {
    console.log(`  ⚠️ "${categoryName}" 카테고리에 처리할 상품이 없습니다.`);
    return {
      categoryName,
      totalProducts: 0,
      successCount: 0,
      failedCount: 0,
      failedProducts: [],
      totalTimeMs: Date.now() - startTime,
    };
  }

  // 3. 배치 인덱싱
  console.log('\n[Step 3] 상품별 인덱싱 시작...');
  const result = await indexProductsBatch(products, questions, categoryName, concurrency);

  // 완료
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ ${categoryName} 인덱싱 완료! (${elapsed}초)`);
  console.log(`   성공: ${result.successCount}개 | 실패: ${result.failedCount}개`);

  if (result.failedProducts.length > 0) {
    console.log('\n⚠️ 실패한 상품:');
    result.failedProducts.forEach(f => {
      console.log(`   - ${f.pcode}: ${f.error}`);
    });
  }

  return result;
}

// ============================================================================
// 맞춤질문 로드
// ============================================================================

async function loadCustomQuestions(categoryName: string): Promise<QuestionTodo[]> {
  const { data, error } = await supabase
    .from('knowledge_categories')
    .select('custom_questions')
    .eq('query', categoryName)
    .single();

  if (error) throw new Error(`맞춤질문 조회 실패: ${error.message}`);
  if (!data?.custom_questions) {
    throw new Error(`"${categoryName}" 카테고리의 맞춤질문이 없습니다. 먼저 generate-custom-questions.ts를 실행하세요.`);
  }

  const { questions: parsed } = parseQuestionsMarkdown(data.custom_questions);
  return parsedQuestionsToTodos(parsed, 'indexed');
}

// ============================================================================
// 상품 조회
// ============================================================================

async function getProductsFromCache(categoryName: string, skipIndexed: boolean): Promise<CachedProduct[]> {
  const { data, error } = await supabase
    .from('knowledge_products_cache')
    .select('pcode, name, brand, price, spec_summary, review_count, rating, product_url, thumbnail, product_info')
    .eq('query', categoryName)
    .order('rank', { ascending: true });

  if (error) throw new Error(`상품 조회 실패: ${error.message}`);

  const allProducts = data || [];

  if (skipIndexed) {
    const notIndexed = allProducts.filter(p => !p.product_info);
    console.log(`  📊 전체 ${allProducts.length}개 중 ${allProducts.length - notIndexed.length}개 이미 인덱싱됨 → ${notIndexed.length}개 처리 예정`);
    return notIndexed;
  }

  return allProducts;
}

// ============================================================================
// 배치 인덱싱
// ============================================================================

async function indexProductsBatch(
  products: CachedProduct[],
  questions: QuestionTodo[],
  categoryName: string,
  concurrency: number
): Promise<BatchIndexingResult> {
  const results: IndexingResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < products.length; i += concurrency) {
    const batch = products.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(products.length / concurrency);

    console.log(`\n📦 배치 ${batchNum}/${totalBatches} 처리 중...`);

    // 개별 요청 간 딜레이를 주면서 순차 처리 (rate limit 방지)
    const batchResults = await Promise.allSettled(
      batch.map((product, idx) =>
        sleep(idx * REQUEST_DELAY_MS).then(() =>
          indexSingleProduct(product, questions, categoryName)
        )
      )
    );

    batch.forEach((product, idx) => {
      const result = batchResults[idx];
      if (result.status === 'fulfilled') {
        results.push(result.value);
        const status = result.value.success ? '✅' : '❌';
        console.log(`   ${status} ${product.name.slice(0, 30)}...`);
      } else {
        results.push({
          success: false,
          pcode: product.pcode,
          productName: product.name,
          error: result.reason?.message || 'Unknown error',
          retryCount: MAX_RETRIES,
          processingTimeMs: 0,
        });
        console.log(`   ❌ ${product.name.slice(0, 30)}... (${result.reason?.message})`);
      }
    });

    // Rate limit 방지 딜레이
    if (i + concurrency < products.length) {
      console.log(`   ⏳ ${BATCH_DELAY_MS}ms 대기 중...`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failedProducts = results
    .filter(r => !r.success)
    .map(r => ({ pcode: r.pcode, error: r.error || 'Unknown' }));

  return {
    categoryName,
    totalProducts: products.length,
    successCount,
    failedCount: failedProducts.length,
    failedProducts,
    totalTimeMs: Date.now() - startTime,
  };
}

// ============================================================================
// 단일 상품 인덱싱
// ============================================================================

async function indexSingleProduct(
  product: CachedProduct,
  questions: QuestionTodo[],
  categoryName: string
): Promise<IndexingResult> {
  const startTime = Date.now();
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      // 1. 스펙 파싱
      const parsedSpecs = parseSpecSummary(product.spec_summary);
      const specHighlights = extractSpecHighlights(parsedSpecs);

      // 2. 맞춤질문 옵션 준비 (웹검색에서 직접 매핑용)
      const questionOptionsForWeb = questions
        .filter(q => q.id !== 'budget') // 예산은 규칙 기반으로 처리
        .map(q => ({
          questionId: q.id,
          question: q.question,
          options: q.options.map(o => ({ value: o.value, label: o.label })),
        }));

      // 3. 웹검색 보강 (맞춤질문 옵션 전달하여 직접 매핑)
      const webEnriched = await enrichProductWithWebSearch(
        product.name,
        product.brand,
        categoryName,
        questionOptionsForWeb
      );

      // 4. 맞춤질문 옵션 매핑
      // 웹검색에서 완전히 매핑되면 LLM 매핑 스킵 (속도 최적화)
      let questionMapping: Record<string, { matchedOption: string; confidence: string; evidence: string }> = {};

      const webMapping = webEnriched?.questionMapping || {};
      const webMappedIds = Object.keys(webMapping);
      const allQuestionIds = questions.map(q => q.id);
      const missingIds = allQuestionIds.filter(id => !webMappedIds.includes(id) || webMapping[id]?.matchedOption === 'unknown');

      if (missingIds.length === 0 || (missingIds.length === 1 && missingIds[0] === 'budget')) {
        // 웹검색에서 전부 매핑됨 → LLM 호출 스킵
        questionMapping = webMapping as typeof questionMapping;
      } else {
        // 일부 누락 → LLM 매핑 수행
        questionMapping = await mapProductToOptions(
          {
            pcode: product.pcode,
            name: product.name,
            brand: product.brand,
            price: product.price,
            specs: parsedSpecs,
            specSummary: product.spec_summary,
          },
          questions,
          webEnriched
        );

        // 웹검색 매핑 결과로 unknown 항목 보강
        for (const [qId, wm] of Object.entries(webMapping)) {
          const currentMapping = questionMapping[qId];
          if (!currentMapping || currentMapping.matchedOption === 'unknown') {
            questionMapping[qId] = wm;
          } else if (currentMapping.confidence === 'low' && wm.confidence !== 'low') {
            questionMapping[qId] = wm;
          }
        }
      }

      // 5. 제품 분석 (웹검색에서 이미 생성됐으면 스킵)
      let analysis = webEnriched?.analysis || null;
      if (!analysis) {
        analysis = await analyzeProduct(
          product.name,
          product.brand,
          parsedSpecs,
          webEnriched,
          categoryName
        );
      }

      // 6. ProductInfo 구성
      const productInfo: ProductInfo = {
        version: 1,
        indexedAt: new Date().toISOString(),
        specs: {
          raw: product.spec_summary,
          parsed: parsedSpecs,
          highlights: specHighlights,
        },
        questionMapping,
        webEnriched,
        analysis,
      };

      // 7. 저장
      const { error } = await supabase
        .from('knowledge_products_cache')
        .update({ product_info: productInfo })
        .eq('pcode', product.pcode);

      if (error) throw new Error(`저장 실패: ${error.message}`);

      return {
        success: true,
        pcode: product.pcode,
        productName: product.name,
        retryCount,
        processingTimeMs: Date.now() - startTime,
      };

    } catch (error) {
      retryCount++;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';

      if (retryCount < MAX_RETRIES) {
        // Rate limit 에러면 더 오래 대기
        const isRateLimit = errorMsg.includes('429') || errorMsg.includes('RATE_LIMIT');
        const delay = isRateLimit ? 5000 * retryCount : 1000 * retryCount;
        await sleep(delay);
      } else {
        return {
          success: false,
          pcode: product.pcode,
          productName: product.name,
          error: errorMsg,
          retryCount,
          processingTimeMs: Date.now() - startTime,
        };
      }
    }
  }

  // 이 코드는 실행되지 않음 (위 while에서 처리)
  return {
    success: false,
    pcode: product.pcode,
    productName: product.name,
    error: 'Max retries exceeded',
    retryCount: MAX_RETRIES,
    processingTimeMs: Date.now() - startTime,
  };
}

// ============================================================================
// 유틸리티
// ============================================================================

function parseArgs(): { category: string; concurrency: number; skipIndexed: boolean } {
  const args = process.argv.slice(2);
  let category = '';
  let concurrency = DEFAULT_CONCURRENCY;
  let skipIndexed = true; // 기본값: 이미 인덱싱된 상품 스킵

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      category = arg.split('=')[1].replace(/['"]/g, '');
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = parseInt(arg.split('=')[1]) || DEFAULT_CONCURRENCY;
    } else if (arg === '--no-skip' || arg === '--force') {
      skipIndexed = false; // 모든 상품 재인덱싱
    }
  }

  return { category, concurrency, skipIndexed };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 실행
main().catch(console.error);
