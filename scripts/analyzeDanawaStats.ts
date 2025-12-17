import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface CategoryStats {
  total: number;
  emptyRank: number;
  emptyReviewCount: number;
  zeroReviewCount: number;  // review_count === 0
}

async function analyzeDanawaStats() {
  // 1. 전체 제품 데이터 가져오기 (페이지네이션)
  const allProducts: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data: products, error } = await supabase
      .from('danawa_products')
      .select('category_code, rank, review_count')
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('Supabase 오류:', error);
      return;
    }

    if (!products || products.length === 0) break;

    allProducts.push(...products);
    offset += pageSize;

    if (products.length < pageSize) break;
  }

  const products = allProducts;

  // 2. 카테고리 이름 매핑 가져오기
  const { data: categories } = await supabase
    .from('danawa_categories')
    .select('category_code, category_name');

  const categoryNames: Record<string, string> = {};
  categories?.forEach(cat => {
    categoryNames[cat.category_code] = cat.category_name;
  });

  // 3. 통계 계산
  const stats: Record<string, CategoryStats> = {};

  products?.forEach(product => {
    const catCode = product.category_code || 'unknown';
    const catName = categoryNames[catCode] || catCode;

    if (!stats[catName]) {
      stats[catName] = { total: 0, emptyRank: 0, emptyReviewCount: 0, zeroReviewCount: 0 };
    }
    stats[catName].total++;

    // rank 체크 (null, undefined)
    if (product.rank === null || product.rank === undefined) {
      stats[catName].emptyRank++;
    }

    // review_count 체크
    if (product.review_count === null || product.review_count === undefined) {
      stats[catName].emptyReviewCount++;
    }

    // review_count === 0 체크
    if (product.review_count === 0) {
      stats[catName].zeroReviewCount++;
    }
  });

  // 4. 결과 출력
  console.log('=== 다나와 Product DB 현황 (Supabase) ===\n');
  console.log('카테고리별 분석:\n');

  let totalProducts = 0;
  let totalEmptyRank = 0;
  let totalEmptyReview = 0;
  let totalZeroReview = 0;

  Object.keys(stats).sort().forEach(cat => {
    const s = stats[cat];
    totalProducts += s.total;
    totalEmptyRank += s.emptyRank;
    totalEmptyReview += s.emptyReviewCount;
    totalZeroReview += s.zeroReviewCount;

    const zeroPct = ((s.zeroReviewCount / s.total) * 100).toFixed(1);

    console.log(`【${cat}】`);
    console.log(`  - 총 제품: ${s.total}개`);
    console.log(`  - review_count = 0: ${s.zeroReviewCount}개 (${zeroPct}%)`);
    console.log('');
  });

  console.log('========== 전체 요약 ==========');
  console.log(`총 제품 수: ${totalProducts}개`);
  console.log(`review_count = 0: ${totalZeroReview}개 (${((totalZeroReview/totalProducts)*100).toFixed(1)}%)`);

  // 5. 통합 카테고리별 분석
  console.log('\n\n========== 통합 카테고리별 분석 ==========\n');

  // 카테고리 그룹 정의
  const categoryGroups: Record<string, string[]> = {
    '카시트': ['일체형', '분리형', '바구니형', '부스터형'],
    '유모차': ['디럭스형', '절충형', '휴대용/트라이크', '쌍둥이용'],
    '기저귀': ['하기스', '팸퍼스', '마미포코', '보솜이', '나비잠', '그외 브랜드'],
    '분유포트': ['분유포트'],
    '젖병': ['젖병'],
    '젖꼭지/노리개': ['젖꼭지/노리개'],
    '분유': ['분유'],
    '귀 체온계': ['귀 체온계'],
    '코흡입/투약기': ['코흡입/투약기'],
    '홈 IP 카메라': ['홈 IP 카메라'],
  };

  // 카테고리별로 그룹핑
  const byCategory: Record<string, any[]> = {};
  products.forEach(p => {
    const catCode = p.category_code || 'unknown';
    const catName = categoryNames[catCode] || catCode;
    if (!byCategory[catName]) byCategory[catName] = [];
    byCategory[catName].push(p);
  });

  // 통합 카테고리별 통계
  console.log('통합카테고리 | 총 제품 | 리뷰0 | 리뷰0 비율 | 리뷰 있는 제품');
  console.log('-------------|---------|-------|-----------|---------------');

  const groupStats: Array<{ name: string; total: number; zeroReview: number; withReview: number }> = [];

  for (const [groupName, subCats] of Object.entries(categoryGroups)) {
    let total = 0;
    let zeroReview = 0;

    for (const subCat of subCats) {
      const prods = byCategory[subCat] || [];
      total += prods.length;
      zeroReview += prods.filter(p => p.review_count === 0).length;
    }

    const withReview = total - zeroReview;
    const zeroPct = total > 0 ? ((zeroReview / total) * 100).toFixed(1) : '0.0';

    groupStats.push({ name: groupName, total, zeroReview, withReview });

    console.log(
      `${groupName.padEnd(12)} | ${String(total).padStart(7)} | ${String(zeroReview).padStart(5)} | ${zeroPct.padStart(8)}% | ${withReview}개`
    );
  }

  // 리뷰0 비율 높은 순으로 정렬해서 다시 출력
  console.log('\n\n========== 리뷰0 비율 높은 순 ==========\n');
  groupStats
    .sort((a, b) => (b.zeroReview / b.total) - (a.zeroReview / a.total))
    .forEach(g => {
      const pct = ((g.zeroReview / g.total) * 100).toFixed(1);
      console.log(`${g.name.padEnd(12)} : ${pct}% (${g.zeroReview}/${g.total}) → 리뷰 있는 제품 ${g.withReview}개`);
    });

  // 6. 모든 카테고리 통합 분석 (주의 필요 순)
  console.log('\n\n========== 전체 카테고리 주의필요 순 ==========\n');

  // 모든 개별 카테고리 수집
  const allCategoryStats: Array<{
    name: string;
    parent: string;
    total: number;
    zeroReview: number;
    withReview: number;
    zeroPct: number;
  }> = [];

  // 하위 카테고리가 있는 그룹
  const subCategoryGroups: Record<string, { parent: string; subs: string[] }> = {
    '유모차': { parent: '유모차', subs: ['디럭스형', '절충형', '휴대용/트라이크', '쌍둥이용'] },
    '카시트': { parent: '카시트', subs: ['일체형', '분리형', '바구니형', '부스터형'] },
    '기저귀': { parent: '기저귀', subs: ['하기스', '팸퍼스', '마미포코', '보솜이', '나비잠', '그외 브랜드'] },
  };

  // 단일 카테고리
  const singleCategories = ['분유포트', '젖병', '젖꼭지/노리개', '분유', '귀 체온계', '코흡입/투약기', '홈 IP 카메라'];

  // 하위 카테고리들 추가
  for (const [, group] of Object.entries(subCategoryGroups)) {
    for (const subCat of group.subs) {
      const prods = byCategory[subCat] || [];
      const total = prods.length;
      const zeroReview = prods.filter(p => p.review_count === 0).length;
      const withReview = total - zeroReview;
      const zeroPct = total > 0 ? (zeroReview / total) * 100 : 0;

      allCategoryStats.push({
        name: subCat,
        parent: group.parent,
        total,
        zeroReview,
        withReview,
        zeroPct,
      });
    }
  }

  // 단일 카테고리들 추가
  for (const cat of singleCategories) {
    const prods = byCategory[cat] || [];
    const total = prods.length;
    const zeroReview = prods.filter(p => p.review_count === 0).length;
    const withReview = total - zeroReview;
    const zeroPct = total > 0 ? (zeroReview / total) * 100 : 0;

    allCategoryStats.push({
      name: cat,
      parent: '-',
      total,
      zeroReview,
      withReview,
      zeroPct,
    });
  }

  // 리뷰 있는 제품 수 기준 오름차순 정렬 (적은 순)
  allCategoryStats.sort((a, b) => a.withReview - b.withReview);

  console.log('순위 | 카테고리          | 상위그룹 | 총제품 | 리뷰0% | 리뷰있음 | 상태');
  console.log('-----|------------------|----------|--------|--------|----------|------');

  allCategoryStats.forEach((cat, i) => {
    let status = '✅';
    if (cat.withReview <= 5) status = '🔴 위험';
    else if (cat.withReview <= 15) status = '🟡 주의';
    else if (cat.withReview <= 30) status = '🟠 관심';

    console.log(
      `${String(i + 1).padStart(4)} | ${cat.name.padEnd(16)} | ${cat.parent.padEnd(8)} | ${String(cat.total).padStart(6)} | ${cat.zeroPct.toFixed(1).padStart(5)}% | ${String(cat.withReview).padStart(8)}개 | ${status}`
    );
  });
}

analyzeDanawaStats();
