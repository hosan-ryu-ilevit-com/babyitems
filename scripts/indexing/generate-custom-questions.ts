#!/usr/bin/env npx tsx
/**
 * 맞춤질문 생성 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/generate-custom-questions.ts --category="이유식조리기"
 *
 * 기능:
 * 1. Supabase에서 카테고리 상품 데이터 조회
 * 2. 웹검색으로 트렌드 분석
 * 3. 리뷰 분석으로 주요 관심사 추출
 * 4. LLM으로 맞춤질문 생성
 * 5. MD 포맷으로 knowledge_categories 테이블에 저장
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { generateQuestionsMarkdown } from '../../lib/indexing/markdown-utils';
import { analyzeCategoryTrends } from '../../lib/indexing/web-enricher';
import { callGeminiWithRetry, parseJSONResponse } from '../../lib/ai/gemini';
import type { QuestionTodo, CustomQuestionsMetadata } from '../../lib/indexing/types';

// ============================================================================
// 설정
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const geminiApiKey = process.env.GEMINI_API_KEY;
const ai = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

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
}

interface CachedReview {
  pcode: string;
  rating: number;
  content: string;
}

interface TrendAnalysis {
  trends: string[];
  buyingFactors: string[];
  commonConcerns: string[];
}

interface ReviewAnalysis {
  positiveKeywords: string[];
  negativeKeywords: string[];
  commonConcerns: string[];
}

// ============================================================================
// 메인 함수
// ============================================================================

async function main() {
  const args = parseArgs();
  const categoryName = args.category;

  if (!categoryName) {
    console.error('Usage: npx tsx scripts/indexing/generate-custom-questions.ts --category="카테고리명"');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 맞춤질문 생성 시작: ${categoryName}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  try {
    // 1. 상품 데이터 조회
    console.log('[Step 1] 상품 데이터 조회 중...');
    const products = await getProductsFromCache(categoryName);
    console.log(`  ✅ ${products.length}개 상품 로드 완료`);

    if (products.length === 0) {
      throw new Error(`"${categoryName}" 카테고리에 상품이 없습니다.`);
    }

    // 2. 웹검색 트렌드 분석
    console.log('\n[Step 2] 웹검색 트렌드 분석 중...');
    const trendAnalysis = await analyzeCategoryTrends(categoryName);
    if (trendAnalysis) {
      console.log(`  ✅ 트렌드: ${trendAnalysis.trends.slice(0, 3).join(', ')}`);
      console.log(`  ✅ 구매 고려사항: ${trendAnalysis.buyingFactors.slice(0, 3).join(', ')}`);
    } else {
      console.log('  ⚠️ 트렌드 분석 실패 (계속 진행)');
    }

    // 3. 리뷰 분석
    console.log('\n[Step 3] 리뷰 분석 중...');
    const pcodes = products.map(p => p.pcode);
    const reviews = await getReviewsFromCache(pcodes);
    const reviewAnalysis = await analyzeReviewsWithLLM(categoryName, reviews);
    if (reviewAnalysis) {
      console.log(`  ✅ 긍정 키워드: ${reviewAnalysis.positiveKeywords.slice(0, 3).join(', ')}`);
      console.log(`  ✅ 부정 키워드: ${reviewAnalysis.negativeKeywords.slice(0, 3).join(', ')}`);
    } else {
      console.log('  ⚠️ 리뷰 분석 실패 (계속 진행)');
    }

    // 4. 맞춤질문 생성
    console.log('\n[Step 4] 맞춤질문 생성 중...');
    const questions = await generateQuestions(
      categoryName,
      products,
      trendAnalysis,
      reviewAnalysis
    );
    console.log(`  ✅ ${questions.length}개 질문 생성 완료`);

    // 질문 미리보기
    questions.forEach((q, i) => {
      console.log(`\n  📝 질문 ${i + 1}: ${q.question}`);
      console.log(`     옵션: ${q.options.map(o => o.label).join(' / ')}`);
    });

    // 5. 개요 생성
    console.log('\n[Step 5] 개요 생성 중...');
    const overview = await generateOverview(categoryName, products, trendAnalysis, reviewAnalysis, questions);
    console.log(`  ✅ 개요 생성 완료`);

    // 6. MD 포맷 변환 및 저장
    console.log('\n[Step 6] 저장 중...');
    const metadata: CustomQuestionsMetadata = {
      categoryName,
      generatedAt: new Date().toISOString(),
      productCount: products.length,
      reviewCount: reviews.length,
      llmModel: 'gemini-2.5-flash-lite',
    };

    const markdown = generateQuestionsMarkdown(questions, metadata, overview);

    // Supabase 저장
    const { error } = await supabase
      .from('knowledge_categories')
      .update({ custom_questions: markdown })
      .eq('query', categoryName);

    if (error) {
      throw new Error(`저장 실패: ${error.message}`);
    }

    console.log(`  ✅ knowledge_categories 테이블에 저장 완료`);

    // 완료
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ 맞춤질문 생성 완료! (${elapsed}초)`);
    console.log(`${'='.repeat(60)}\n`);

    // 결과 미리보기
    console.log('📄 생성된 마크다운 미리보기:\n');
    console.log(markdown.slice(0, 2000));
    if (markdown.length > 2000) {
      console.log('\n... (이하 생략)');
    }

  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    process.exit(1);
  }
}

// ============================================================================
// 데이터 조회 함수
// ============================================================================

async function getProductsFromCache(categoryName: string): Promise<CachedProduct[]> {
  const { data, error } = await supabase
    .from('knowledge_products_cache')
    .select('pcode, name, brand, price, spec_summary, review_count, rating')
    .eq('query', categoryName)
    .order('rank', { ascending: true })
    .limit(50);

  if (error) throw new Error(`상품 조회 실패: ${error.message}`);
  return data || [];
}

async function getReviewsFromCache(pcodes: string[]): Promise<CachedReview[]> {
  const { data, error } = await supabase
    .from('knowledge_reviews_cache')
    .select('pcode, rating, content')
    .in('pcode', pcodes)
    .limit(2000);

  if (error) throw new Error(`리뷰 조회 실패: ${error.message}`);
  return data || [];
}

// ============================================================================
// 분석 함수
// ============================================================================

async function analyzeReviewsWithLLM(
  categoryName: string,
  reviews: CachedReview[]
): Promise<ReviewAnalysis | null> {
  if (!ai || reviews.length < 20) return null;

  // 긍정/부정 리뷰 샘플링
  const positive = reviews
    .filter(r => r.rating >= 4 && r.content.length >= 30)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 20);

  const negative = reviews
    .filter(r => r.rating <= 3 && r.content.length >= 30)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, 20);

  if (positive.length + negative.length < 10) return null;

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
  });

  const prompt = `
"${categoryName}" 제품 리뷰를 분석해주세요.

## 긍정 리뷰 (4-5점)
${positive.map((r, i) => `${i + 1}. [${r.rating}점] ${r.content.slice(0, 200)}`).join('\n')}

## 부정 리뷰 (1-3점)
${negative.map((r, i) => `${i + 1}. [${r.rating}점] ${r.content.slice(0, 200)}`).join('\n')}

## 추출 규칙
- 여러 리뷰에서 반복되는 내용만 추출
- 2-5단어로 간결하게
- 각 항목 최대 6개

## 응답 (JSON만)
{
  "positiveKeywords": ["...", "..."],
  "negativeKeywords": ["...", "..."],
  "commonConcerns": ["...", "..."]
}
`;

  try {
    const result = await callGeminiWithRetry(() => model.generateContent(prompt));
    return parseJSONResponse<ReviewAnalysis>(result.response.text());
  } catch (error) {
    console.error('리뷰 분석 실패:', error);
    return null;
  }
}

// ============================================================================
// 질문 생성 함수
// ============================================================================

async function generateQuestions(
  categoryName: string,
  products: CachedProduct[],
  trendAnalysis: TrendAnalysis | null,
  reviewAnalysis: ReviewAnalysis | null
): Promise<QuestionTodo[]> {
  if (!ai) {
    throw new Error('Gemini API가 설정되지 않았습니다.');
  }

  // 가격 분석
  const prices = products.map(p => p.price).filter((p): p is number => p !== null && p > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 500000;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 100000;

  // 브랜드 분석
  const brandCounts = new Map<string, number>();
  products.forEach(p => {
    if (p.brand) {
      brandCounts.set(p.brand, (brandCounts.get(p.brand) || 0) + 1);
    }
  });
  const topBrands = [...brandCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name]) => name);

  // 스펙 샘플
  const specsSample = products.slice(0, 10).map((p, i) =>
    `${i + 1}. ${p.name} | ${p.spec_summary || '(스펙 없음)'}`
  ).join('\n');

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { temperature: 0.5, maxOutputTokens: 3000 },
  });

  const prompt = `
당신은 "${categoryName}" 구매 결정을 돕는 전문 쇼핑 컨시어지입니다.

## 시장 데이터
- **카테고리:** ${categoryName}
- **상품 수:** ${products.length}개
- **가격대:** ${minPrice.toLocaleString()}원 ~ ${maxPrice.toLocaleString()}원 (평균 ${avgPrice.toLocaleString()}원)
- **주요 브랜드:** ${topBrands.join(', ')}
${trendAnalysis ? `
- **2026년 트렌드:** ${trendAnalysis.trends.join(', ')}
- **⭐ 핵심 구매 고려사항:** ${trendAnalysis.buyingFactors.join(' / ')}
- **주요 걱정사항:** ${trendAnalysis.commonConcerns.join(', ')}` : ''}
${reviewAnalysis ? `
- **리뷰 긍정 키워드:** ${reviewAnalysis.positiveKeywords.join(', ')}
- **리뷰 부정 키워드:** ${reviewAnalysis.negativeKeywords.join(', ')}` : ''}

## 상위 제품 스펙
${specsSample}

## 질문 생성 규칙
1. **핵심 구매 고려사항을 반드시 질문에 반영**하세요
2. 예산 질문은 별도로 생성하니 여기서는 생성하지 마세요
3. 3-5개의 핵심 질문을 생성하세요
4. 각 질문은 2-4개의 옵션을 가져야 합니다
5. 옵션은 상호 배타적이어야 합니다
6. reason 필드에는 이 질문이 중요한 이유를 자연어로 상세히 작성하세요

## 응답 형식 (JSON 배열만 출력)
[
  {
    "id": "snake_case_id",
    "question": "질문 텍스트 (30-50자)",
    "reason": "이 질문이 중요한 이유. ${categoryName}에서 이 선택이 어떤 영향을 미치는지 자연어로 2-3문장 상세히 설명. 트렌드나 리뷰에서 발견한 인사이트를 포함하면 좋습니다.",
    "options": [
      {
        "value": "option_value",
        "label": "옵션 라벨 (10-20자)",
        "description": "이 옵션의 특징이나 장점을 자연어로 설명 (20-40자)",
        "isPopular": true/false
      }
    ],
    "type": "single",
    "priority": 1,
    "dataSource": "indexed",
    "completed": false
  }
]
`;

  const result = await callGeminiWithRetry(() => model.generateContent(prompt), 3, 2000);
  const questions = parseJSONResponse<QuestionTodo[]>(result.response.text());

  // 예산 질문 추가
  const budgetQuestion = generateBudgetQuestion(categoryName, minPrice, maxPrice, avgPrice);
  questions.push(budgetQuestion);

  return questions;
}

function generateBudgetQuestion(
  categoryName: string,
  minPrice: number,
  maxPrice: number,
  avgPrice: number
): QuestionTodo {
  // 가격대 구간 설정
  const ranges = [];
  if (minPrice < avgPrice * 0.6) {
    ranges.push({
      value: 'entry',
      label: `${Math.round(avgPrice * 0.5 / 10000)}만원 이하`,
      description: '가성비 좋은 입문용 제품',
      isPopular: false,
    });
  }
  ranges.push({
    value: 'mid',
    label: `${Math.round(avgPrice / 10000)}만원대`,
    description: '인기 가격대, 가장 많은 선택지',
    isPopular: true,
  });
  if (maxPrice > avgPrice * 1.5) {
    ranges.push({
      value: 'premium',
      label: `${Math.round(avgPrice * 1.5 / 10000)}만원 이상`,
      description: '프리미엄 제품, 추가 기능',
      isPopular: false,
    });
  }
  ranges.push({
    value: 'skip',
    label: '상관없어요',
    description: '예산에 상관없이 추천받고 싶어요',
    isPopular: false,
  });

  return {
    id: 'budget',
    question: `예산은 어느 정도로 생각하세요? (평균 ${Math.round(avgPrice / 10000)}만원대)`,
    reason: `${categoryName}의 가격대는 ${Math.round(minPrice / 10000)}만원에서 ${Math.round(maxPrice / 10000)}만원까지 다양합니다. 예산에 따라 선택할 수 있는 제품의 기능과 품질이 달라집니다.`,
    options: ranges,
    type: 'single',
    priority: 99,
    dataSource: 'indexed',
    completed: false,
  };
}

// ============================================================================
// 개요 생성 함수
// ============================================================================

async function generateOverview(
  categoryName: string,
  products: CachedProduct[],
  trendAnalysis: TrendAnalysis | null,
  reviewAnalysis: ReviewAnalysis | null,
  questions: QuestionTodo[]
): Promise<string> {
  if (!ai) {
    return `${categoryName} 카테고리의 ${products.length}개 상품과 리뷰를 분석하여 ${questions.length}개의 맞춤질문을 생성했습니다.`;
  }

  const model = ai.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: { temperature: 0.6, maxOutputTokens: 500 },
  });

  const questionSummary = questions.map(q => q.question).join(', ');

  const prompt = `
"${categoryName}" 카테고리의 맞춤질문 개요를 자연어로 작성해주세요.

## 데이터
- 분석 상품: ${products.length}개
- 주요 브랜드: ${[...new Set(products.map(p => p.brand).filter(Boolean))].slice(0, 5).join(', ')}
${trendAnalysis ? `- 트렌드: ${trendAnalysis.trends.slice(0, 3).join(', ')}` : ''}
${reviewAnalysis ? `- 리뷰 인사이트: ${reviewAnalysis.positiveKeywords.slice(0, 3).join(', ')} / ${reviewAnalysis.negativeKeywords.slice(0, 3).join(', ')}` : ''}
- 생성된 질문: ${questionSummary}

## 작성 규칙
- 3-5문장으로 간결하게
- ${categoryName}에서 선택이 왜 어려운지, 어떤 기준이 중요한지 설명
- 자연스러운 문장으로 (마크다운 포맷 없이, 순수 텍스트만)
`;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch {
    return `${categoryName} 카테고리의 ${products.length}개 상품과 리뷰를 분석하여 ${questions.length}개의 맞춤질문을 생성했습니다.`;
  }
}

// ============================================================================
// 유틸리티
// ============================================================================

function parseArgs(): { category: string } {
  const args = process.argv.slice(2);
  let category = '';

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      category = arg.split('=')[1].replace(/['"]/g, '');
    }
  }

  return { category };
}

// 실행
main().catch(console.error);
