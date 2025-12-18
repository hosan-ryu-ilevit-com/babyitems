#!/usr/bin/env npx tsx
/**
 * Supabase 기반 제품별 키워드 매칭 스크립트
 * 
 * 사용법:
 *   npx tsx scripts/match-keywords-supabase.ts <categoryKey>
 *   npx tsx scripts/match-keywords-supabase.ts --all
 * 
 * 예시:
 *   npx tsx scripts/match-keywords-supabase.ts stroller
 *   npx tsx scripts/match-keywords-supabase.ts --all
 * 
 * 주의: 먼저 analyze-reviews-supabase.ts로 카테고리 분석이 완료되어 있어야 합니다.
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

// Supabase 클라이언트
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 카테고리 코드 매핑
const CATEGORY_CODE_MAP: Record<string, string[]> = {
  stroller: ['16349368', '16349193', '16349195', '16349196', 'stroller'],
  car_seat: ['16349200', '16349201', '16349202', '16353763', 'car_seat'],
  formula: ['16249091', 'formula'],
  formula_maker: ['16349381', 'formula_maker'],
  baby_formula_dispenser: ['16349381', 'baby_formula_dispenser'],
  baby_bottle: ['16349219'],
  pacifier: ['16349351'],
  diaper: ['16349108', '16349109', '16356038', '16349110', '16356040', '16356042', 'diaper'],
  baby_wipes: ['16349119'],
  thermometer: ['17325941'],
  nasal_aspirator: ['16349248'],
  ip_camera: ['11427546'],
  baby_bed: ['16338152'],
  high_chair: ['16338153', '16338154'],
  baby_sofa: ['16338155'],
  baby_desk: ['16338156'],
  milk_powder_port: ['16330960'],
};

// 카테고리 한글명
const CATEGORY_NAMES: Record<string, string> = {
  stroller: '유모차',
  car_seat: '카시트',
  formula: '분유',
  formula_maker: '분유제조기',
  baby_formula_dispenser: '분유제조기',
  baby_bottle: '젖병',
  pacifier: '공갈젖꼭지',
  diaper: '기저귀',
  baby_wipes: '물티슈',
  thermometer: '체온계',
  nasal_aspirator: '코흡입기',
  ip_camera: 'IP카메라',
  baby_bed: '아기침대',
  high_chair: '하이체어',
  baby_sofa: '아기소파',
  baby_desk: '아기책상',
  milk_powder_port: '분유포트',
};

interface HiddenCriteria {
  id: string;
  name: string;
  keywords: string[];
  importance: string;
  mentionCount: number;
}

interface CategoryAnalysis {
  categoryKey: string;
  hiddenCriteria: HiddenCriteria[];
}

interface Review {
  pcode: string;
  content: string;
  rating: number;
}

interface KeywordMatch {
  keyword: string;
  count: number;
  positiveCount: number;
  negativeCount: number;
  samples: Array<{ text: string; rating: number }>;
}

interface CriteriaMatch {
  criteriaId: string;
  criteriaName: string;
  totalMentions: number;
  positiveRatio: number;
  keywordMatches: KeywordMatch[];
  topPositiveSamples: string[];
  topNegativeSamples: string[];
}

interface ProductKeywordData {
  productId: string;
  reviewCount: number;
  criteriaMatches: CriteriaMatch[];
  lastUpdated: string;
}

/**
 * 카테고리 분석 결과 로드
 */
function loadCategoryAnalysis(categoryKey: string): CategoryAnalysis | null {
  const filePath = path.join(process.cwd(), 'data', 'experience-index', `${categoryKey}_analysis.json`);

  if (!fs.existsSync(filePath)) {
    console.error(`   ❌ 분석 파일이 없습니다: ${filePath}`);
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Supabase에서 카테고리별 제품 목록 가져오기
 */
async function fetchProductsFromSupabase(categoryKey: string): Promise<Array<{ pcode: string; title: string; source: string }>> {
  const categoryCodes = CATEGORY_CODE_MAP[categoryKey];
  if (!categoryCodes) {
    return [];
  }

  const products: Array<{ pcode: string; title: string; source: string }> = [];

  // 다나와 제품
  const { data: danawaProducts } = await supabase
    .from('danawa_products')
    .select('pcode, title')
    .in('category_code', categoryCodes.filter(c => !isNaN(Number(c))));

  if (danawaProducts) {
    products.push(...danawaProducts.map(p => ({ ...p, source: 'danawa' })));
  }

  // 에누리 제품
  const { data: enuriProducts } = await supabase
    .from('enuri_products')
    .select('pcode, title')
    .in('category_code', categoryCodes.filter(c => isNaN(Number(c))));

  if (enuriProducts) {
    products.push(...enuriProducts.map(p => ({ ...p, source: 'enuri' })));
  }

  return products;
}

/**
 * Supabase에서 제품별 리뷰 가져오기
 */
async function fetchReviewsForProduct(pcode: string, source: string): Promise<Review[]> {
  const tableName = source === 'danawa' ? 'danawa_reviews' : 'enuri_reviews';
  
  const { data } = await supabase
    .from(tableName)
    .select('pcode, content, rating')
    .eq('pcode', pcode);

  return (data || []).filter(r => r.content && r.content.length > 20);
}

/**
 * 제품별 키워드 매칭 수행
 */
function matchProductKeywords(
  productId: string,
  reviews: Review[],
  analysis: CategoryAnalysis
): ProductKeywordData {
  const criteriaMatches: CriteriaMatch[] = [];

  for (const criteria of analysis.hiddenCriteria) {
    const keywordMatches: KeywordMatch[] = [];
    let totalMentions = 0;
    let positiveMentions = 0;
    const positiveSamples: string[] = [];
    const negativeSamples: string[] = [];

    for (const keyword of criteria.keywords) {
      const match: KeywordMatch = {
        keyword,
        count: 0,
        positiveCount: 0,
        negativeCount: 0,
        samples: []
      };

      for (const review of reviews) {
        if (!review.content) continue;

        if (review.content.toLowerCase().includes(keyword.toLowerCase())) {
          match.count++;
          totalMentions++;

          const isPositive = review.rating >= 4;
          const isNegative = review.rating <= 2;

          if (isPositive) {
            match.positiveCount++;
            positiveMentions++;
          }
          if (isNegative) {
            match.negativeCount++;
          }

          // 샘플 수집 (키워드 포함 문장)
          if (match.samples.length < 2) {
            const sentences = review.content.split(/[.!?]/);
            const relevantSentence = sentences.find(s =>
              s.toLowerCase().includes(keyword.toLowerCase())
            );
            if (relevantSentence) {
              match.samples.push({
                text: relevantSentence.trim().slice(0, 150),
                rating: review.rating
              });
            }
          }

          // 전체 샘플 수집
          if (isPositive && positiveSamples.length < 3) {
            positiveSamples.push(review.content.slice(0, 200));
          }
          if (isNegative && negativeSamples.length < 3) {
            negativeSamples.push(review.content.slice(0, 200));
          }
        }
      }

      if (match.count > 0) {
        keywordMatches.push(match);
      }
    }

    if (totalMentions > 0) {
      criteriaMatches.push({
        criteriaId: criteria.id,
        criteriaName: criteria.name,
        totalMentions,
        positiveRatio: totalMentions > 0 ? positiveMentions / totalMentions : 0,
        keywordMatches,
        topPositiveSamples: positiveSamples,
        topNegativeSamples: negativeSamples
      });
    }
  }

  return {
    productId,
    reviewCount: reviews.length,
    criteriaMatches,
    lastUpdated: new Date().toISOString()
  };
}

/**
 * 단일 카테고리 키워드 매칭
 */
async function matchCategoryKeywords(categoryKey: string): Promise<boolean> {
  const categoryName = CATEGORY_NAMES[categoryKey] || categoryKey;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 [${categoryKey}] ${categoryName} 키워드 매칭 시작`);
  console.log('='.repeat(60));

  // 1. 카테고리 분석 결과 로드
  console.log('\n1️⃣ 카테고리 분석 결과 로드...');
  const analysis = loadCategoryAnalysis(categoryKey);
  if (!analysis) {
    console.log('   ⚠️ 먼저 analyze-reviews-supabase.ts를 실행하세요.');
    return false;
  }
  console.log(`   ✅ ${analysis.hiddenCriteria.length}개 체감속성 발견`);

  // 2. 제품 목록 가져오기
  console.log('\n2️⃣ Supabase에서 제품 목록 로드...');
  const products = await fetchProductsFromSupabase(categoryKey);
  if (products.length === 0) {
    console.log('   ⚠️ 제품이 없습니다.');
    return false;
  }
  console.log(`   ✅ ${products.length}개 제품 발견`);

  // 3. 제품별 키워드 매칭
  console.log('\n3️⃣ 제품별 키워드 매칭 중...');
  const results: Record<string, ProductKeywordData> = {};
  let processedCount = 0;
  let matchedCount = 0;

  for (const product of products) {
    const reviews = await fetchReviewsForProduct(product.pcode, product.source);
    
    if (reviews.length === 0) {
      continue;
    }

    const productData = matchProductKeywords(product.pcode, reviews, analysis);
    
    if (productData.criteriaMatches.length > 0) {
      results[product.pcode] = productData;
      matchedCount++;
    }

    processedCount++;
    if (processedCount % 10 === 0) {
      console.log(`   ... ${processedCount}/${products.length} 처리 완료`);
    }
  }

  console.log(`   ✅ 매칭 완료: ${matchedCount}개 제품에서 키워드 발견`);

  // 4. 결과 저장
  const outputDir = path.join(process.cwd(), 'data', 'experience-index', 'products');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${categoryKey}_product_keywords.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n4️⃣ 결과 저장: ${outputPath}`);

  // 5. 결과 요약
  console.log('\n📋 매칭 결과 요약:');
  for (const criteria of analysis.hiddenCriteria) {
    let totalProducts = 0;
    let totalMentions = 0;

    for (const productId of Object.keys(results)) {
      const productData = results[productId];
      const match = productData.criteriaMatches.find(m => m.criteriaId === criteria.id);
      if (match && match.totalMentions > 0) {
        totalProducts++;
        totalMentions += match.totalMentions;
      }
    }

    if (totalProducts > 0) {
      console.log(`   🏷️ ${criteria.name}: ${totalProducts}개 제품, ${totalMentions}회 언급`);
    }
  }

  return true;
}

/**
 * 메인 함수
 */
async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.log('사용법:');
    console.log('  npx tsx scripts/match-keywords-supabase.ts <categoryKey>');
    console.log('  npx tsx scripts/match-keywords-supabase.ts --all');
    console.log('\n사용 가능한 카테고리:');
    Object.keys(CATEGORY_CODE_MAP).forEach(key => {
      console.log(`  - ${key} (${CATEGORY_NAMES[key] || key})`);
    });
    return;
  }

  if (arg === '--all') {
    console.log('🚀 모든 카테고리 키워드 매칭 시작...\n');
    const results: { category: string; success: boolean }[] = [];

    for (const categoryKey of Object.keys(CATEGORY_CODE_MAP)) {
      try {
        const success = await matchCategoryKeywords(categoryKey);
        results.push({ category: categoryKey, success });
      } catch (error) {
        console.error(`❌ ${categoryKey} 매칭 실패:`, error);
        results.push({ category: categoryKey, success: false });
      }

      // DB 부하 방지를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 결과 요약
    console.log('\n' + '='.repeat(60));
    console.log('📊 전체 매칭 결과');
    console.log('='.repeat(60));
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`✅ 성공: ${succeeded}개`);
    console.log(`❌ 실패: ${failed}개`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.category}`);
    });
  } else {
    // 단일 카테고리 매칭
    if (!CATEGORY_CODE_MAP[arg]) {
      console.error(`❌ 알 수 없는 카테고리: ${arg}`);
      console.log('\n사용 가능한 카테고리:');
      Object.keys(CATEGORY_CODE_MAP).forEach(key => {
        console.log(`  - ${key} (${CATEGORY_NAMES[key] || key})`);
      });
      return;
    }

    await matchCategoryKeywords(arg);
  }
}

main().catch(console.error);
