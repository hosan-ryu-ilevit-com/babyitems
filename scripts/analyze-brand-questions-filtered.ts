/**
 * DB의 knowledge_categories 88개에 대해서만 브랜드 질문 생성 분석
 * (data/knowledge 폴더 기반, URL 인코딩 중복 제거)
 *
 * 실행: npx tsx scripts/analyze-brand-questions-filtered.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface BrandAnalysis {
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

const knowledgeDir = path.join(process.cwd(), 'data/knowledge');

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

function analyzeBrandImportanceSimple(indexMdPath: string, categoryName: string): BrandAnalysis | null {
  try {
    const content = fs.readFileSync(indexMdPath, 'utf-8');

    // 브랜드 정보 추출
    const brandMatches = content.match(/- \*\*브랜드\*\*: (.+)/g);
    if (!brandMatches || brandMatches.length === 0) {
      return null;
    }

    // 브랜드 카운트
    const brandCounts: Record<string, number> = {};
    brandMatches.forEach(match => {
      const brand = match.replace(/- \*\*브랜드\*\*: /, '').trim();
      brandCounts[brand] = (brandCounts[brand] || 0) + 1;
    });

    const uniqueBrands = Object.keys(brandCounts).length;
    const totalProducts = brandMatches.length;
    const maxCount = Math.max(...Object.values(brandCounts));
    const concentration = maxCount / totalProducts;

    // 브랜드가 2개 이하면 생성 안 함
    if (uniqueBrands <= 2) {
      const { involvement, score: involvementScore } = getCategoryInvolvement(categoryName);
      return {
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

    // 1. 브랜드 다양성 (30점 만점)
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

    // 2. 가격 분포 (20점 만점)
    const priceMatches = content.match(/- \*\*가격\*\*: ([\d,]+)원/g);
    if (priceMatches && priceMatches.length > 5) {
      const prices = priceMatches.map(m => parseInt(m.replace(/[^0-9]/g, '')));
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

    // 3. 카테고리 관여도 (30점 만점)
    const { involvement, score: involvementScore, reason: involvementReason } = getCategoryInvolvement(categoryName);
    score += involvementScore;
    reasons.push(involvementReason);

    // Top 브랜드 추출
    const topBrands = Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name}(${count}개)`);

    return {
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
    return null;
  }
}

async function main() {
  console.log(`\n📊 DB 기반 브랜드 질문 생성 분석 (88개 카테고리)\n`);
  console.log('='.repeat(150));

  // 1. DB에서 카테고리 목록 조회
  const { data: dbCategories, error } = await supabase
    .from('knowledge_categories')
    .select('query')
    .eq('is_active', true)
    .order('id');

  if (error || !dbCategories) {
    console.error('카테고리 조회 실패:', error);
    return;
  }

  const categoryNames = new Set(dbCategories.map(c => c.query));
  console.log(`\n총 ${categoryNames.size}개 DB 카테고리 확인\n`);

  // 2. data/knowledge 폴더에서 해당 카테고리들만 분석
  const results: BrandAnalysis[] = [];

  for (const categoryName of categoryNames) {
    // URL 인코딩된 버전과 한글 버전 모두 확인
    const encodedName = encodeURIComponent(categoryName);
    const possiblePaths = [
      path.join(knowledgeDir, categoryName, 'index.md'),
      path.join(knowledgeDir, encodedName, 'index.md')
    ];

    for (const indexPath of possiblePaths) {
      if (fs.existsSync(indexPath)) {
        const analysis = analyzeBrandImportanceSimple(indexPath, categoryName);
        if (analysis) {
          results.push(analysis);
          break; // 하나 찾으면 중단
        }
      }
    }
  }

  // 3. 결과 정렬 (점수 높은 순)
  results.sort((a, b) => b.score - a.score);

  // 4. 통계
  const shouldGenerateCount = results.filter(r => r.shouldGenerate).length;
  const totalCount = results.length;

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

  // 8. 아기용품만 필터링 분석
  const babyKeywords = [
    '유모차', '카시트', '아기띠', '힙시트', '보행기', '점퍼루',
    '기저귀', '물티슈', '쪽쪽이', '젖병', '젖꼭지', '치발기',
    '분유', '이유식', '유아', '아기', '신생아',
    '바운서', '모빌', '수유', '유축', '보틀워머',
    '콧물흡입기', '놀이', '소꿉', '인형', '블록', '로봇장난감'
  ];

  const babyProducts = results.filter(r =>
    babyKeywords.some(k => r.categoryName.includes(k))
  );

  const babyGenerateCount = babyProducts.filter(r => r.shouldGenerate).length;

  console.log(`\n${'='.repeat(150)}`);
  console.log(`\n🍼 아기용품만 분석:`);
  console.log(`  총 ${babyProducts.length}개 - 브랜드 질문 ${babyGenerateCount}개 생성 (${Math.round(babyGenerateCount / babyProducts.length * 100)}%)`);

  const babyHigh = babyProducts.filter(r => r.involvement === 'high');
  const babyTrust = babyProducts.filter(r => r.involvement === 'trust');
  const babyLow = babyProducts.filter(r => r.involvement === 'low');

  console.log(`  🔴 고관여: ${babyHigh.length}개 - ${babyHigh.filter(r => r.shouldGenerate).length}개 생성 (${Math.round(babyHigh.filter(r => r.shouldGenerate).length / Math.max(1, babyHigh.length) * 100)}%)`);
  console.log(`  🟡 신뢰기반: ${babyTrust.length}개 - ${babyTrust.filter(r => r.shouldGenerate).length}개 생성 (${Math.round(babyTrust.filter(r => r.shouldGenerate).length / Math.max(1, babyTrust.length) * 100)}%)`);
  console.log(`  🟢 저관여: ${babyLow.length}개 - ${babyLow.filter(r => r.shouldGenerate).length}개 생성 (${Math.round(babyLow.filter(r => r.shouldGenerate).length / Math.max(1, babyLow.length) * 100)}%)`);

  // 생성 안 되는 아기용품
  const babyNotGenerated = babyProducts.filter(r => !r.shouldGenerate);
  if (babyNotGenerated.length > 0) {
    console.log(`\n  ❌ 브랜드 질문 생성 안 되는 아기용품 (${babyNotGenerated.length}개):`);
    babyNotGenerated.forEach(r => {
      const involvementBadge = r.involvement === 'high' ? '🔴' : r.involvement === 'trust' ? '🟡' : '🟢';
      console.log(`     ${r.categoryName.padEnd(20)} | ${involvementBadge} ${r.involvement.padEnd(5)} (${String(r.involvementScore).padStart(2)}점) | 총점: ${String(r.score).padStart(2)}점`);
    });
  }

  console.log('\n');
}

main();
