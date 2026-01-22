/**
 * 모든 카테고리에서 브랜드 질문 생성 여부 분석
 *
 * 실행: npx tsx scripts/analyze-brand-questions.ts
 */

import * as fs from 'fs';
import * as path from 'path';

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

// data/knowledge 폴더의 모든 카테고리 분석
const knowledgeDir = path.join(process.cwd(), 'data/knowledge');

function analyzeBrandImportanceSimple(indexMdPath: string): BrandAnalysis | null {
  try {
    const content = fs.readFileSync(indexMdPath, 'utf-8');

    // 브랜드 정보 추출 (- **브랜드**: XXX 형태)
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

    // 카테고리명 추출
    const categoryName = path.basename(path.dirname(indexMdPath));

    // 브랜드가 2개 이하면 생성 안 함
    if (uniqueBrands <= 2) {
      return {
        categoryName,
        uniqueBrands,
        concentration,
        topBrands: Object.keys(brandCounts).slice(0, 3),
        score: 0,
        involvement: 'low',
        involvementScore: 0,
        shouldGenerate: false,
        reasoning: `브랜드 다양성 부족 (${uniqueBrands}개만 존재)`
      };
    }

    let score = 0;
    const reasons: string[] = [];

    // 1. 브랜드 다양성 (30점 만점) - 배점 조정
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

    // 2. 가격 분포 (20점 만점) - 배점 조정
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

    // 3. 카테고리 관여도 (30점 만점) - 신규 추가
    let involvement: 'high' | 'trust' | 'low' = 'low';
    let involvementScore = 0;

    // 고관여 키워드
    const highKeywords = ['유모차', '카시트', '아기띠', '힙시트', '보행기', '점퍼루'];
    // 신뢰기반 키워드
    const trustKeywords = ['기저귀', '물티슈', '로션', '크림', '젖병', '젖꼭지', '쪽쪽이', '치발기', '분유', '이유식', '유산균', '비타민'];
    // 저관여 키워드
    const lowKeywords = ['양말', '내복', '턱받이', '손수건', '욕조', '장난감', '완구'];

    if (highKeywords.some(k => categoryName.includes(k))) {
      involvement = 'high';
      involvementScore = 30;
      reasons.push('고관여 (안전/과시/장기사용)');
    } else if (trustKeywords.some(k => categoryName.includes(k))) {
      involvement = 'trust';
      involvementScore = 15;
      reasons.push('신뢰기반 (피부접촉/발진우려)');
    } else if (lowKeywords.some(k => categoryName.includes(k))) {
      involvement = 'low';
      involvementScore = 0;
      reasons.push('저관여 (단기사용/가성비)');
    } else {
      // 키워드 매칭 실패 시 기본값 trust (중간)
      involvement = 'trust';
      involvementScore = 15;
      reasons.push('기본 신뢰기반');
    }

    score += involvementScore;

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
    console.error(`Error analyzing ${indexMdPath}:`, error);
    return null;
  }
}

// 모든 카테고리 분석
const categories = fs.readdirSync(knowledgeDir).filter(f => {
  const stat = fs.statSync(path.join(knowledgeDir, f));
  return stat.isDirectory();
});

console.log(`\n📊 전체 ${categories.length}개 카테고리 브랜드 질문 생성 분석\n`);
console.log('='.repeat(120));

const results: BrandAnalysis[] = [];

categories.forEach(category => {
  const indexPath = path.join(knowledgeDir, category, 'index.md');
  if (!fs.existsSync(indexPath)) {
    return;
  }

  const analysis = analyzeBrandImportanceSimple(indexPath);
  if (analysis) {
    results.push(analysis);
  }
});

// 결과 정렬 (점수 높은 순)
results.sort((a, b) => b.score - a.score);

// 통계
const shouldGenerateCount = results.filter(r => r.shouldGenerate).length;
const totalCount = results.length;

console.log(`\n✅ 브랜드 질문 생성: ${shouldGenerateCount}개 / ${totalCount}개 (${Math.round(shouldGenerateCount / totalCount * 100)}%)\n`);

// 생성되는 카테고리
console.log('🎯 브랜드 질문 생성되는 카테고리 (60점 이상):');
console.log('-'.repeat(150));
results.filter(r => r.shouldGenerate).forEach((r, i) => {
  const involvementBadge = r.involvement === 'high' ? '🔴' : r.involvement === 'trust' ? '🟡' : '🟢';
  console.log(`${String(i + 1).padStart(3)}. ${r.categoryName.padEnd(20)} | ${involvementBadge} ${r.involvement.padEnd(5)} (${String(r.involvementScore).padStart(2)}점) | 총점: ${String(r.score).padStart(2)}점 | 브랜드: ${r.uniqueBrands}개 | ${r.reasoning}`);
});

// 생성 안 되는 카테고리 (참고용)
console.log('\n❌ 브랜드 질문 생성 안 되는 카테고리 (60점 미만):');
console.log('-'.repeat(150));
results.filter(r => !r.shouldGenerate).slice(0, 20).forEach((r, i) => {
  const involvementBadge = r.involvement === 'high' ? '🔴' : r.involvement === 'trust' ? '🟡' : '🟢';
  console.log(`${String(i + 1).padStart(3)}. ${r.categoryName.padEnd(20)} | ${involvementBadge} ${r.involvement.padEnd(5)} (${String(r.involvementScore).padStart(2)}점) | 총점: ${String(r.score).padStart(2)}점 | 브랜드: ${r.uniqueBrands}개 | ${r.reasoning}`);
});

if (results.filter(r => !r.shouldGenerate).length > 20) {
  console.log(`\n... 외 ${results.filter(r => !r.shouldGenerate).length - 20}개 카테고리`);
}

console.log('\n' + '='.repeat(150));

// 관여도별 통계
const highInvolvement = results.filter(r => r.involvement === 'high');
const trustInvolvement = results.filter(r => r.involvement === 'trust');
const lowInvolvement = results.filter(r => r.involvement === 'low');

console.log(`\n📊 관여도별 분류:`);
console.log(`  🔴 고관여 (High):   ${highInvolvement.length}개 - 브랜드 질문 ${highInvolvement.filter(r => r.shouldGenerate).length}개 생성 (${Math.round(highInvolvement.filter(r => r.shouldGenerate).length / Math.max(1, highInvolvement.length) * 100)}%)`);
console.log(`  🟡 신뢰기반 (Trust): ${trustInvolvement.length}개 - 브랜드 질문 ${trustInvolvement.filter(r => r.shouldGenerate).length}개 생성 (${Math.round(trustInvolvement.filter(r => r.shouldGenerate).length / Math.max(1, trustInvolvement.length) * 100)}%)`);
console.log(`  🟢 저관여 (Low):     ${lowInvolvement.length}개 - 브랜드 질문 ${lowInvolvement.filter(r => r.shouldGenerate).length}개 생성 (${Math.round(lowInvolvement.filter(r => r.shouldGenerate).length / Math.max(1, lowInvolvement.length) * 100)}%)`);

console.log(`\n💡 요약: ${totalCount}개 카테고리 중 ${shouldGenerateCount}개(${Math.round(shouldGenerateCount / totalCount * 100)}%)에서 브랜드 질문 생성`);
console.log(`📝 임계값: 60점 이상 (브랜드 다양성 30점 + 가격 분포 20점 + 카테고리 관여도 30점)\n`);
