/**
 * 제품별 리뷰 키워드 매칭 스크립트
 * 목적: 카테고리 분석 결과의 키워드를 개별 제품 리뷰에 매칭
 */

import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';

interface Review {
  text: string;
  custom_metadata: {
    productId: string;
    category: string;
    rating: number;
  };
}

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

interface KeywordMatch {
  keyword: string;
  count: number;
  positiveCount: number;  // rating >= 4
  negativeCount: number;  // rating <= 2
  samples: Array<{
    text: string;
    rating: number;
  }>;
}

interface CriteriaMatch {
  criteriaId: string;
  criteriaName: string;
  totalMentions: number;
  positiveRatio: number;  // 긍정 리뷰에서의 언급 비율
  keywordMatches: KeywordMatch[];
  topPositiveSamples: string[];  // 긍정 리뷰 샘플
  topNegativeSamples: string[];  // 부정 리뷰 샘플
}

interface ProductKeywordData {
  productId: string;
  reviewCount: number;
  criteriaMatches: CriteriaMatch[];
  lastUpdated: string;
}

// JSONL 파일에서 리뷰 로드
async function loadReviews(category: string): Promise<Review[]> {
  const filePath = `./data/reviews/${category}.jsonl`;
  const reviews: Review[] = [];

  if (!fs.existsSync(filePath)) {
    console.error(`리뷰 파일이 없습니다: ${filePath}`);
    return reviews;
  }

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        reviews.push(JSON.parse(line));
      } catch {
        // 파싱 실패한 라인은 스킵
      }
    }
  }

  return reviews;
}

// 카테고리 분석 결과 로드
function loadCategoryAnalysis(category: string): CategoryAnalysis | null {
  const filePath = `./data/experience-index/${category}_analysis.json`;

  if (!fs.existsSync(filePath)) {
    console.error(`분석 파일이 없습니다: ${filePath}`);
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// 텍스트에서 키워드 매칭
function matchKeywords(text: string, keywords: string[]): string[] {
  const matched: string[] = [];
  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    if (lowerText.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    }
  }

  return matched;
}

// 제품별 키워드 매칭 수행
function matchProductKeywords(
  productId: string,
  reviews: Review[],
  analysis: CategoryAnalysis
): ProductKeywordData {
  const productReviews = reviews.filter(r => r.custom_metadata.productId === productId);

  const criteriaMatches: CriteriaMatch[] = [];

  for (const criteria of analysis.hiddenCriteria) {
    const keywordMatches: KeywordMatch[] = [];
    let totalMentions = 0;
    let positiveMentions = 0;
    let negativeMentions = 0;
    const positiveSamples: string[] = [];
    const negativeSamples: string[] = [];

    // 각 키워드별 매칭
    for (const keyword of criteria.keywords) {
      const match: KeywordMatch = {
        keyword,
        count: 0,
        positiveCount: 0,
        negativeCount: 0,
        samples: []
      };

      for (const review of productReviews) {
        if (review.text.toLowerCase().includes(keyword.toLowerCase())) {
          match.count++;
          totalMentions++;

          const isPositive = review.custom_metadata.rating >= 4;
          const isNegative = review.custom_metadata.rating <= 2;

          if (isPositive) {
            match.positiveCount++;
            positiveMentions++;
          }
          if (isNegative) {
            match.negativeCount++;
            negativeMentions++;
          }

          // 샘플 수집 (최대 2개)
          if (match.samples.length < 2) {
            // 키워드 주변 문맥 추출 (키워드 포함 문장)
            const sentences = review.text.split(/[.!?]/);
            const relevantSentence = sentences.find(s =>
              s.toLowerCase().includes(keyword.toLowerCase())
            );
            if (relevantSentence) {
              match.samples.push({
                text: relevantSentence.trim().slice(0, 100),
                rating: review.custom_metadata.rating
              });
            }
          }

          // 전체 샘플 수집
          if (isPositive && positiveSamples.length < 3) {
            const sentences = review.text.split(/[.!?]/);
            const relevantSentence = sentences.find(s =>
              s.toLowerCase().includes(keyword.toLowerCase())
            );
            if (relevantSentence && !positiveSamples.includes(relevantSentence.trim())) {
              positiveSamples.push(relevantSentence.trim().slice(0, 80));
            }
          }
          if (isNegative && negativeSamples.length < 3) {
            const sentences = review.text.split(/[.!?]/);
            const relevantSentence = sentences.find(s =>
              s.toLowerCase().includes(keyword.toLowerCase())
            );
            if (relevantSentence && !negativeSamples.includes(relevantSentence.trim())) {
              negativeSamples.push(relevantSentence.trim().slice(0, 80));
            }
          }
        }
      }

      if (match.count > 0) {
        keywordMatches.push(match);
      }
    }

    if (totalMentions > 0 || keywordMatches.length > 0) {
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
    reviewCount: productReviews.length,
    criteriaMatches,
    lastUpdated: new Date().toISOString()
  };
}

// 고유 제품 ID 추출
function getUniqueProductIds(reviews: Review[]): string[] {
  const ids = new Set<string>();
  for (const review of reviews) {
    ids.add(review.custom_metadata.productId);
  }
  return Array.from(ids);
}

async function main() {
  const category = process.argv[2] || 'baby_formula_dispenser';
  console.log(`\n🔍 제품별 키워드 매칭: ${category}\n`);

  // 1. 카테고리 분석 결과 로드
  console.log('1️⃣ 카테고리 분석 결과 로드...');
  const analysis = loadCategoryAnalysis(category);
  if (!analysis) {
    console.error('분석 결과가 없습니다. 먼저 analyze-category-reviews.ts를 실행하세요.');
    process.exit(1);
  }
  console.log(`   ${analysis.hiddenCriteria.length}개 숨겨진 기준 발견`);

  // 2. 리뷰 로드
  console.log('\n2️⃣ 리뷰 로드 중...');
  const reviews = await loadReviews(category);
  console.log(`   총 ${reviews.length}개 리뷰`);

  // 3. 고유 제품 ID 추출
  const productIds = getUniqueProductIds(reviews);
  console.log(`   ${productIds.length}개 제품`);

  // 4. 제품별 매칭 수행
  console.log('\n3️⃣ 제품별 키워드 매칭 중...');
  const results: Record<string, ProductKeywordData> = {};

  for (const productId of productIds) {
    const productData = matchProductKeywords(productId, reviews, analysis);
    results[productId] = productData;
  }

  // 5. 결과 저장
  const outputDir = './data/experience-index/products';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${category}_product_keywords.json`);
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n4️⃣ 결과 저장: ${outputPath}`);

  // 6. 결과 요약 출력
  console.log('\n' + '='.repeat(60));
  console.log('📋 매칭 결과 요약');
  console.log('='.repeat(60));

  // 기준별 통계
  for (const criteria of analysis.hiddenCriteria) {
    let totalProducts = 0;
    let totalMentions = 0;

    for (const productId of productIds) {
      const productData = results[productId];
      const match = productData.criteriaMatches.find(m => m.criteriaId === criteria.id);
      if (match && match.totalMentions > 0) {
        totalProducts++;
        totalMentions += match.totalMentions;
      }
    }

    console.log(`\n🏷️ ${criteria.name}`);
    console.log(`   - 언급된 제품: ${totalProducts}/${productIds.length}개`);
    console.log(`   - 총 언급 횟수: ${totalMentions}회`);
  }

  // 상위 제품 출력 (세척 관련)
  const cleaningCriteria = analysis.hiddenCriteria.find(c => c.id === 'cleaning_frequency');
  if (cleaningCriteria) {
    console.log('\n' + '='.repeat(60));
    console.log('🧹 세척 관련 상위 제품 (긍정 비율 순)');
    console.log('='.repeat(60));

    const productRankings = productIds
      .map(id => {
        const data = results[id];
        const match = data.criteriaMatches.find(m => m.criteriaId === 'cleaning_frequency');
        return {
          productId: id,
          reviewCount: data.reviewCount,
          mentions: match?.totalMentions || 0,
          positiveRatio: match?.positiveRatio || 0,
          positiveSamples: match?.topPositiveSamples || [],
          negativeSamples: match?.topNegativeSamples || []
        };
      })
      .filter(p => p.mentions >= 2)  // 최소 2회 언급
      .sort((a, b) => b.positiveRatio - a.positiveRatio);

    for (const product of productRankings.slice(0, 5)) {
      console.log(`\n제품 ID: ${product.productId}`);
      console.log(`  리뷰 수: ${product.reviewCount}, 세척 언급: ${product.mentions}회`);
      console.log(`  긍정 비율: ${(product.positiveRatio * 100).toFixed(0)}%`);
      if (product.positiveSamples.length > 0) {
        console.log(`  👍 "${product.positiveSamples[0]}"`);
      }
      if (product.negativeSamples.length > 0) {
        console.log(`  👎 "${product.negativeSamples[0]}"`);
      }
    }
  }
}

main().catch(console.error);
