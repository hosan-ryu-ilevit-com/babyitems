/**
 * DB의 knowledge_categories 테이블에서 88개 카테고리에 대한 브랜드 질문 생성 여부 분석
 *
 * 실행: npx tsx scripts/analyze-brand-questions-db.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// .env.local 로드
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

interface BrandAnalysis {
  categoryKey: string;
  categoryName: string;
  uniqueBrands: number;
  concentration: number;
  topBrands: string[];
  score: number;
  involvement: 'high' | 'trust' | 'low';
  involvementScore: number;
  shouldGenerate: boolean;
  reasoning: string;
}

// Supabase 클라이언트
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * 카테고리명으로 관여도 판단
 */
function getCategoryInvolvement(categoryName: string): { involvement: 'high' | 'trust' | 'low'; score: number; reason: string } {
  const highKeywords = ['유모차', '카시트', '아기띠', '힙시트', '보행기', '점퍼루'];
  const trustKeywords = ['기저귀', '물티슈', '로션', '크림', '젖병', '젖꼭지', '쪽쪽이', '치발기', '분유', '이유식', '유산균', '비타민'];
  const lowKeywords = ['양말', '내복', '턱받이', '손수건', '욕조', '장난감', '완구'];

  if (highKeywords.some(k => categoryName.includes(k))) {
    return { involvement: 'high', score: 30, reason: '고관여 (안전/과시/장기사용)' };
  } else if (trustKeywords.some(k => categoryName.includes(k))) {
    return { involvement: 'trust', score: 15, reason: '신뢰기반 (피부접촉/발진우려)' };
  } else if (lowKeywords.some(k => categoryName.includes(k))) {
    return { involvement: 'low', score: 0, reason: '저관여 (단기사용/가성비)' };
  } else {
    return { involvement: 'trust', score: 15, reason: '기본 신뢰기반' };
  }
}

/**
 * DB에서 카테고리별 제품 데이터 조회 및 브랜드 분석
 */
async function analyzeBrandImportanceFromDB(
  categoryKey: string,
  categoryName: string
): Promise<BrandAnalysis | null> {
  try {
    // 1. 제품 조회 (브랜드, 가격 정보)
    // category 컬럼으로 조회 (query 값과 매칭)
    const { data: products, error } = await supabase
      .from('danawa_products')
      .select('pcode, brand, price')
      .eq('category', categoryName)
      .not('brand', 'is', null)
      .limit(120);

    if (error || !products || products.length === 0) {
      console.error(`[${categoryKey}] 제품 조회 실패:`, error);
      return null;
    }

    // 2. 브랜드 카운트 및 집중도 계산
    const brandCounts: Record<string, number> = {};
    products.forEach((p: any) => {
      if (p.brand) brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
    });

    const uniqueBrands = Object.keys(brandCounts).length;
    const totalProducts = products.length;
    const maxCount = Math.max(...Object.values(brandCounts));
    const concentration = maxCount / totalProducts;

    // 브랜드 2개 이하면 생성 안 함
    if (uniqueBrands <= 2) {
      const { involvement, score: involvementScore } = getCategoryInvolvement(categoryName);
      return {
        categoryKey,
        categoryName,
        uniqueBrands,
        concentration,
        topBrands: Object.keys(brandCounts).slice(0, 3),
        score: 0 + involvementScore,
        involvement,
        involvementScore,
        shouldGenerate: false,
        reasoning: `브랜드 다양성 부족 (${uniqueBrands}개만 존재)`
      };
    }

    let score = 0;
    const reasons: string[] = [];

    // 3. 브랜드 다양성 (30점 만점)
    if (uniqueBrands >= 8 && concentration < 0.5) {
      score += 30;
      reasons.push(`다양성 높음 (${uniqueBrands}개, 집중도 ${Math.round(concentration * 100)}%)`);
    } else if (uniqueBrands >= 5 && concentration < 0.55) {
      score += 20;
      reasons.push(`선택지 있음 (${uniqueBrands}개, 집중도 ${Math.round(concentration * 100)}%)`);
    } else if (uniqueBrands >= 4) {
      score += 10;
      reasons.push(`다양성 보통 (${uniqueBrands}개, 집중도 ${Math.round(concentration * 100)}%)`);
    } else {
      reasons.push(`다양성 낮음 (${uniqueBrands}개)`);
    }

    // 4. 가격 분포 (20점 만점)
    const prices = products.map((p: any) => p.price).filter((p: number | null) => p && p > 0);
    if (prices.length >= 5) {
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceSpread = (maxPrice - minPrice) / minPrice;

      if (priceSpread > 2.0) {
        score += 20;
        reasons.push('가격대 차별화 명확');
      } else if (priceSpread > 0.8) {
        score += 15;
        reasons.push('가격 차이 있음');
      } else if (priceSpread > 0.3) {
        score += 8;
        reasons.push('소폭 가격 차이');
      }
    }

    // 5. 카테고리 관여도 (30점 만점)
    const { involvement, score: involvementScore, reason: involvementReason } = getCategoryInvolvement(categoryName);
    score += involvementScore;
    reasons.push(involvementReason);

    // 6. Top 브랜드 추출
    const topBrands = Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name}(${count}개)`);

    return {
      categoryKey,
      categoryName,
      uniqueBrands,
      concentration: Math.round(concentration * 100) / 100,
      topBrands,
      score,
      involvement,
      involvementScore,
      shouldGenerate: score >= 60,
      reasoning: reasons.join(' / ')
    };
  } catch (error) {
    console.error(`[${categoryKey}] 분석 실패:`, error);
    return null;
  }
}

/**
 * 메인 실행
 */
async function main() {
  console.log(`\n📊 DB 기반 브랜드 질문 생성 분석 (knowledge_categories)\n`);
  console.log('='.repeat(150));

  // 1. DB에서 카테고리 목록 조회 (컬럼명 확인 필요)
  // 가능한 컬럼명: category_key / key / id, category_name / name
  const { data: categories, error } = await supabase
    .from('knowledge_categories')
    .select('*')
    .limit(1);

  if (error) {
    console.error('카테고리 조회 실패:', error);
    return;
  }

  // 첫 번째 레코드로 컬럼명 파악
  if (categories && categories.length > 0) {
    console.log('테이블 컬럼:', Object.keys(categories[0]));
  }

  // 실제 전체 조회
  const { data: allCategories, error: error2 } = await supabase
    .from('knowledge_categories')
    .select('*')
    .order('id');

  if (error2 || !allCategories) {
    console.error('전체 카테고리 조회 실패:', error2);
    return;
  }

  console.log(`\n총 ${allCategories.length}개 카테고리 분석 시작...\n`);

  // 2. 각 카테고리별 브랜드 분석
  const results: BrandAnalysis[] = [];
  for (const cat of allCategories) {
    // 컬럼명 동적 처리 (category_key 또는 key, category_name 또는 name)
    const categoryKey = cat.category_key || cat.key || cat.id;
    const categoryName = cat.category_name || cat.name || categoryKey;

    const analysis = await analyzeBrandImportanceFromDB(categoryKey, categoryName);
    if (analysis) {
      results.push(analysis);
      console.log(`✓ ${categoryName.padEnd(20)} | ${analysis.score}점 | ${analysis.involvement}`);
    }
  }

  // 3. 결과 정렬 (점수 높은 순)
  results.sort((a, b) => b.score - a.score);

  // 4. 통계
  const shouldGenerateCount = results.filter(r => r.shouldGenerate).length;
  const totalCount = results.length;

  console.log(`\n${'='.repeat(150)}`);
  console.log(`\n✅ 브랜드 질문 생성: ${shouldGenerateCount}개 / ${totalCount}개 (${Math.round(shouldGenerateCount / totalCount * 100)}%)\n`);

  // 5. 생성되는 카테고리
  console.log('🎯 브랜드 질문 생성되는 카테고리 (60점 이상):');
  console.log('-'.repeat(150));
  results.filter(r => r.shouldGenerate).forEach((r, i) => {
    const involvementBadge = r.involvement === 'high' ? '🔴' : r.involvement === 'trust' ? '🟡' : '🟢';
    console.log(`${String(i + 1).padStart(3)}. ${r.categoryName.padEnd(20)} | ${involvementBadge} ${r.involvement.padEnd(5)} (${String(r.involvementScore).padStart(2)}점) | 총점: ${String(r.score).padStart(2)}점 | 브랜드: ${r.uniqueBrands}개 | ${r.reasoning}`);
  });

  // 6. 생성 안 되는 카테고리
  console.log('\n❌ 브랜드 질문 생성 안 되는 카테고리 (60점 미만):');
  console.log('-'.repeat(150));
  results.filter(r => !r.shouldGenerate).forEach((r, i) => {
    const involvementBadge = r.involvement === 'high' ? '🔴' : r.involvement === 'trust' ? '🟡' : '🟢';
    console.log(`${String(i + 1).padStart(3)}. ${r.categoryName.padEnd(20)} | ${involvementBadge} ${r.involvement.padEnd(5)} (${String(r.involvementScore).padStart(2)}점) | 총점: ${String(r.score).padStart(2)}점 | 브랜드: ${r.uniqueBrands}개 | ${r.reasoning}`);
  });

  console.log(`\n${'='.repeat(150)}`);

  // 7. 관여도별 통계
  const highInvolvement = results.filter(r => r.involvement === 'high');
  const trustInvolvement = results.filter(r => r.involvement === 'trust');
  const lowInvolvement = results.filter(r => r.involvement === 'low');

  console.log(`\n📊 관여도별 분류:`);
  console.log(`  🔴 고관여 (High):   ${highInvolvement.length}개 - 브랜드 질문 ${highInvolvement.filter(r => r.shouldGenerate).length}개 생성 (${Math.round(highInvolvement.filter(r => r.shouldGenerate).length / Math.max(1, highInvolvement.length) * 100)}%)`);
  console.log(`  🟡 신뢰기반 (Trust): ${trustInvolvement.length}개 - 브랜드 질문 ${trustInvolvement.filter(r => r.shouldGenerate).length}개 생성 (${Math.round(trustInvolvement.filter(r => r.shouldGenerate).length / Math.max(1, trustInvolvement.length) * 100)}%)`);
  console.log(`  🟢 저관여 (Low):     ${lowInvolvement.length}개 - 브랜드 질문 ${lowInvolvement.filter(r => r.shouldGenerate).length}개 생성 (${Math.round(lowInvolvement.filter(r => r.shouldGenerate).length / Math.max(1, lowInvolvement.length) * 100)}%)`);

  console.log(`\n💡 요약: ${totalCount}개 카테고리 중 ${shouldGenerateCount}개(${Math.round(shouldGenerateCount / totalCount * 100)}%)에서 브랜드 질문 생성`);
  console.log(`📝 임계값: 60점 이상 (브랜드 다양성 30점 + 가격 분포 20점 + 카테고리 관여도 30점)\n`);
}

main();
