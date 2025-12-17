#!/usr/bin/env npx tsx
/**
 * formula_maker 카테고리 리뷰 키워드 분석
 * Supabase에서 리뷰 데이터를 가져와서 체감속성 키워드 매칭 수행
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 카테고리 분석 결과 (이전에 LLM으로 분석한 5개 기준)
const CATEGORY_ANALYSIS = {
  hiddenCriteria: [
    {
      id: 'cleaning_frequency',
      name: '세척 빈도 및 편리성',
      keywords: ['세척', '청소', '깔때기', '분유통', '번거로움', '귀찮', '위생'],
    },
    {
      id: 'accuracy',
      name: '분유 농도 및 용량 정확도',
      keywords: ['농도', '용량', '정확', '오차', '일정', '흔들', '섞'],
    },
    {
      id: 'noise',
      name: '작동 소음',
      keywords: ['소음', '시끄럽', '조용', '새벽', '깸', '모터', '소리'],
    },
    {
      id: 'durability_parts',
      name: '부품 내구성',
      keywords: ['깔때기', '플라스틱', '마모', '파손', '고장', '교체', '내구'],
    },
    {
      id: 'ease_of_use',
      name: '사용 편의성',
      keywords: ['조립', '뻑뻑', '힘듦', '어려움', '사용법', '설정', '버튼'],
    },
  ],
};

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

async function main() {
  console.log('🔍 formula_maker 카테고리 리뷰 분석 시작...\n');

  // 1. formula_maker 카테고리 제품 목록 가져오기
  // category_code 16349381 (분유제조기)
  const CATEGORY_CODE = '16349381';

  // 다나와 제품 확인
  const { data: danawaProducts, error: danawaError } = await supabase
    .from('danawa_products')
    .select('pcode, title, category_code')
    .eq('category_code', CATEGORY_CODE);

  if (danawaError) {
    console.error('다나와 제품 조회 오류:', danawaError);
  }

  // 에누리 제품도 확인
  const { data: enuriProducts, error: enuriError } = await supabase
    .from('enuri_products')
    .select('pcode, title, category_code')
    .eq('category_code', CATEGORY_CODE);

  if (enuriError) {
    console.error('에누리 제품 조회 오류:', enuriError);
  }

  const allProducts = [
    ...(danawaProducts || []).map(p => ({ ...p, source: 'danawa' })),
    ...(enuriProducts || []).map(p => ({ ...p, source: 'enuri' })),
  ];

  console.log(`📦 총 ${allProducts.length}개 제품 발견`);
  console.log(`   - 다나와: ${danawaProducts?.length || 0}개`);
  console.log(`   - 에누리: ${enuriProducts?.length || 0}개`);

  if (allProducts.length === 0) {
    console.log('\n⚠️ 제품이 없습니다. 다른 카테고리 코드를 확인해주세요.');

    // 분유제조기 관련 제품 검색
    const { data: searchResults } = await supabase
      .from('danawa_products')
      .select('pcode, title, category_code')
      .ilike('title', '%분유%')
      .limit(10);

    console.log('\n🔎 "분유" 키워드로 검색된 제품:');
    searchResults?.forEach(p => {
      console.log(`   [${p.category_code}] ${p.title} (${p.pcode})`);
    });
    return;
  }

  // 2. 각 제품의 리뷰 가져오기
  const productKeywordData: Record<string, ProductKeywordData> = {};

  for (const product of allProducts) {
    console.log(`\n📝 리뷰 분석: ${product.title} (${product.pcode})`);

    // 리뷰 가져오기
    let reviews: Review[] = [];

    if (product.source === 'danawa') {
      const { data } = await supabase
        .from('danawa_reviews')
        .select('pcode, content, rating')
        .eq('pcode', product.pcode);
      reviews = data || [];
    } else {
      const { data } = await supabase
        .from('enuri_reviews')
        .select('pcode, content, rating')
        .eq('pcode', product.pcode);
      reviews = data || [];
    }

    if (reviews.length === 0) {
      console.log(`   ⚠️ 리뷰 없음`);
      continue;
    }

    console.log(`   📊 ${reviews.length}개 리뷰 발견`);

    // 3. 키워드 매칭
    const criteriaMatches: CriteriaMatch[] = [];

    for (const criteria of CATEGORY_ANALYSIS.hiddenCriteria) {
      const keywordMatches: KeywordMatch[] = [];
      let totalMentions = 0;
      let positiveCount = 0;
      const positiveSamples: string[] = [];
      const negativeSamples: string[] = [];

      for (const keyword of criteria.keywords) {
        const matches: KeywordMatch = {
          keyword,
          count: 0,
          positiveCount: 0,
          negativeCount: 0,
          samples: [],
        };

        for (const review of reviews) {
          if (!review.content) continue;

          if (review.content.includes(keyword)) {
            matches.count++;
            totalMentions++;

            const isPositive = review.rating >= 4;
            if (isPositive) {
              matches.positiveCount++;
              positiveCount++;
              if (positiveSamples.length < 3) {
                positiveSamples.push(review.content.substring(0, 200));
              }
            } else {
              matches.negativeCount++;
              if (negativeSamples.length < 3) {
                negativeSamples.push(review.content.substring(0, 200));
              }
            }

            if (matches.samples.length < 2) {
              matches.samples.push({
                text: review.content.substring(0, 200),
                rating: review.rating,
              });
            }
          }
        }

        if (matches.count > 0) {
          keywordMatches.push(matches);
        }
      }

      if (totalMentions > 0) {
        criteriaMatches.push({
          criteriaId: criteria.id,
          criteriaName: criteria.name,
          totalMentions,
          positiveRatio: positiveCount / totalMentions,
          keywordMatches,
          topPositiveSamples: positiveSamples,
          topNegativeSamples: negativeSamples,
        });
      }
    }

    if (criteriaMatches.length > 0) {
      productKeywordData[product.pcode] = {
        productId: product.pcode,
        reviewCount: reviews.length,
        criteriaMatches,
        lastUpdated: new Date().toISOString(),
      };

      console.log(`   ✅ ${criteriaMatches.length}개 기준 매칭됨`);
      criteriaMatches.forEach(cm => {
        console.log(`      - ${cm.criteriaName}: ${cm.totalMentions}건 (긍정 ${(cm.positiveRatio * 100).toFixed(0)}%)`);
      });
    }
  }

  // 4. 결과 저장
  const outputDir = path.join(process.cwd(), 'data', 'experience-index', 'products');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'formula_maker_product_keywords.json');
  fs.writeFileSync(outputPath, JSON.stringify(productKeywordData, null, 2));

  console.log(`\n✅ 분석 완료!`);
  console.log(`   📁 저장 위치: ${outputPath}`);
  console.log(`   📊 분석된 제품: ${Object.keys(productKeywordData).length}개`);
}

main().catch(console.error);
