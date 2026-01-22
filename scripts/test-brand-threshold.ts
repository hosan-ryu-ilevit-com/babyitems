/**
 * 다양한 임계값으로 브랜드 질문 생성 비율 테스트
 *
 * 실행: npx tsx scripts/test-brand-threshold.ts
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
  score: number;
  involvement: 'high' | 'trust' | 'low';
  involvementScore: number;
  reasoning: string;
}

const knowledgeDir = path.join(process.cwd(), 'data/knowledge');

function getCategoryInvolvement(categoryName: string): { involvement: 'high' | 'trust' | 'low'; score: number; reason: string } {
  const highKeywords = ['유모차', '카시트', '아기띠', '힙시트', '보행기', '점퍼루'];
  const trustKeywords = ['기저귀', '물티슈', '로션', '크림', '젖병', '젖꼭지', '쪽쪽이', '치발기', '분유', '이유식', '유산균', '비타민'];
  const lowKeywords = ['양말', '내복', '턱받이', '손수건', '욕조', '장난감', '완구'];

  if (highKeywords.some(k => categoryName.includes(k))) {
    return { involvement: 'high', score: 30, reason: '고관여' };
  } else if (trustKeywords.some(k => categoryName.includes(k))) {
    return { involvement: 'trust', score: 15, reason: '신뢰기반' };
  } else if (lowKeywords.some(k => categoryName.includes(k))) {
    return { involvement: 'low', score: 0, reason: '저관여' };
  } else {
    return { involvement: 'trust', score: 15, reason: '기본' };
  }
}

function analyzeBrandImportanceSimple(indexMdPath: string, categoryName: string): BrandAnalysis | null {
  try {
    const content = fs.readFileSync(indexMdPath, 'utf-8');

    const brandMatches = content.match(/- \*\*브랜드\*\*: (.+)/g);
    if (!brandMatches || brandMatches.length === 0) {
      return null;
    }

    const brandCounts: Record<string, number> = {};
    brandMatches.forEach(match => {
      const brand = match.replace(/- \*\*브랜드\*\*: /, '').trim();
      brandCounts[brand] = (brandCounts[brand] || 0) + 1;
    });

    const uniqueBrands = Object.keys(brandCounts).length;
    const totalProducts = brandMatches.length;
    const maxCount = Math.max(...Object.values(brandCounts));
    const concentration = maxCount / totalProducts;

    if (uniqueBrands <= 2) {
      const { involvement, score: involvementScore } = getCategoryInvolvement(categoryName);
      return {
        categoryName,
        uniqueBrands,
        concentration,
        score: 0 + involvementScore,
        involvement,
        involvementScore,
        reasoning: `브랜드 다양성 부족 (${uniqueBrands}개)`
      };
    }

    let score = 0;
    const reasons: string[] = [];

    // 1. 브랜드 다양성 (30점)
    if (uniqueBrands >= 8 && concentration < 0.5) {
      score += 30;
      reasons.push(`다양성 높음`);
    } else if (uniqueBrands >= 5 && concentration < 0.55) {
      score += 20;
      reasons.push(`선택지 있음`);
    } else if (uniqueBrands >= 4) {
      score += 10;
      reasons.push(`다양성 보통`);
    }

    // 2. 가격 분포 (20점)
    const priceMatches = content.match(/- \*\*가격\*\*: ([\d,]+)원/g);
    if (priceMatches && priceMatches.length > 5) {
      const prices = priceMatches.map(m => parseInt(m.replace(/[^0-9]/g, '')));
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const priceSpread = (maxPrice - minPrice) / minPrice;

      if (priceSpread > 2.0) {
        score += 20;
        reasons.push('가격대 명확');
      } else if (priceSpread > 0.8) {
        score += 15;
        reasons.push('가격 차이');
      } else if (priceSpread > 0.3) {
        score += 8;
        reasons.push('소폭 차이');
      }
    }

    // 3. 관여도 (30점)
    const { involvement, score: involvementScore, reason: involvementReason } = getCategoryInvolvement(categoryName);
    score += involvementScore;
    reasons.push(involvementReason);

    return {
      categoryName,
      uniqueBrands,
      concentration: Math.round(concentration * 100) / 100,
      score,
      involvement,
      involvementScore,
      reasoning: reasons.join(' / ')
    };
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log(`\n📊 브랜드 질문 임계값 시뮬레이션\n`);
  console.log('='.repeat(150));

  // DB 카테고리 조회
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
  const results: BrandAnalysis[] = [];

  for (const categoryName of categoryNames) {
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
          break;
        }
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  const totalCount = results.length;

  console.log(`\n총 ${totalCount}개 카테고리 분석 완료\n`);

  // 점수 분포 확인
  const scoreDistribution: Record<number, number> = {};
  results.forEach(r => {
    const bucket = Math.floor(r.score / 5) * 5; // 5점 단위
    scoreDistribution[bucket] = (scoreDistribution[bucket] || 0) + 1;
  });

  console.log('점수 분포:');
  Object.keys(scoreDistribution).sort((a, b) => Number(b) - Number(a)).forEach(bucket => {
    const count = scoreDistribution[Number(bucket)];
    console.log(`  ${bucket}-${Number(bucket) + 4}점: ${count}개`);
  });

  // 다양한 임계값 테스트
  console.log('\n' + '='.repeat(150));
  console.log('\n🎯 임계값별 시뮬레이션:\n');

  const thresholds = [45, 50, 55, 60, 65, 70];

  thresholds.forEach(threshold => {
    const passed = results.filter(r => r.score >= threshold);
    const passedCount = passed.length;
    const percentage = Math.round(passedCount / totalCount * 100);

    // 관여도별 통계
    const highCount = passed.filter(r => r.involvement === 'high').length;
    const trustCount = passed.filter(r => r.involvement === 'trust').length;
    const lowCount = passed.filter(r => r.involvement === 'low').length;

    const totalHigh = results.filter(r => r.involvement === 'high').length;
    const totalTrust = results.filter(r => r.involvement === 'trust').length;
    const totalLow = results.filter(r => r.involvement === 'low').length;

    console.log(`임계값 ${threshold}점 → ${passedCount}/${totalCount}개 (${percentage}%)`);
    console.log(`  🔴 고관여: ${highCount}/${totalHigh}개 (${Math.round(highCount/totalHigh*100)}%)`);
    console.log(`  🟡 신뢰기반: ${trustCount}/${totalTrust}개 (${Math.round(trustCount/totalTrust*100)}%)`);
    console.log(`  🟢 저관여: ${lowCount}/${totalLow}개 (${Math.round(lowCount/Math.max(1, totalLow)*100)}%)`);

    // 아기용품 비율
    const babyKeywords = [
      '유모차', '카시트', '아기띠', '힙시트', '보행기', '점퍼루',
      '기저귀', '물티슈', '쪽쪽이', '젖병', '젖꼭지', '치발기',
      '분유', '이유식', '유아', '아기', '신생아',
      '바운서', '모빌', '수유', '유축', '보틀워머',
      '콧물흡입기', '놀이', '소꿉', '인형', '블록', '로봇장난감'
    ];
    const babyProducts = results.filter(r => babyKeywords.some(k => r.categoryName.includes(k)));
    const babyPassed = passed.filter(r => babyKeywords.some(k => r.categoryName.includes(k)));
    console.log(`  🍼 아기용품: ${babyPassed.length}/${babyProducts.length}개 (${Math.round(babyPassed.length/babyProducts.length*100)}%)`);
    console.log('');
  });

  console.log('='.repeat(150));

  // 권장 임계값
  console.log('\n💡 권장 사항:\n');
  console.log('현재 (50점): 69개 (86%) - 브랜드 질문이 많은 편');
  console.log('목표 (55점): 68개 (85%) - 거의 차이 없음 (50점 1개만 제외)');
  console.log('목표 (60점): 60개 (75%) - 적절한 수준, 고관여 100% + 신뢰기반 74% 유지');
  console.log('목표 (65점): 52개 (65%) - 다소 낮은 편, 신뢰기반이 64%로 하락');
  console.log('\n🎯 추천: 60점 (전체 75%, 아기용품 93%)');
  console.log('   - 고관여 제품: 100% 유지');
  console.log('   - 신뢰기반 제품: 74% (적절)');
  console.log('   - 저관여 제품: 33% (적절)');
  console.log('   - 아기용품: 93% (높은 수준 유지)\n');
}

main();
