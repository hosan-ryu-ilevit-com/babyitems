/**
 * Knowledge Generation Pipeline v2
 *
 * DB 리뷰 + Gemini 웹서치 그라운딩 기반 고품질 지식 마크다운 생성
 *
 * Usage:
 *   npx tsx scripts/knowledge/generate-knowledge.ts airfryer
 *   npx tsx scripts/knowledge/generate-knowledge.ts baby_bottle
 */

import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const geminiApiKey = process.env.GEMINI_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!geminiApiKey || !supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: geminiApiKey });
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// Data Loaders from Supabase
// ============================================================================

interface Review {
  content: string;
  rating: number;
  sentiment?: string;
  mentioned_pros?: string[];
  mentioned_cons?: string[];
  key_phrase?: string;
  source: string;
}

interface Product {
  pcode: string;
  name: string;
  brand?: string;
  price?: number;
  review_summary?: string;
  pros?: string[];
  cons?: string[];
  target_persona?: string[];
  spec_summary_text?: string;
  value_score?: number;
  quality_score?: number;
}

interface CategoryInfo {
  market_trend?: string;
  buying_guide?: string;
  common_tradeoffs?: any[];
  price_segments?: Record<string, any>;
  common_cons?: string[];
  top_brands?: any[];
}

async function loadReviewsFromDB(categoryKey: string, limit = 200): Promise<Review[]> {
  console.log('  Loading reviews from knowledge_reviews_v2...');

  // 먼저 해당 카테고리의 pcode들 가져오기
  const { data: products } = await supabase
    .from('knowledge_products_v2')
    .select('pcode')
    .eq('category_key', categoryKey);

  if (!products || products.length === 0) {
    console.log('  No products found, trying general products table...');
    const { data: generalProducts } = await supabase
      .from('products')
      .select('pcode')
      .eq('category_key', categoryKey);

    if (!generalProducts || generalProducts.length === 0) {
      return [];
    }

    // 일반 products 테이블에서 리뷰 로드 시도
    return [];
  }

  const pcodes = products.map(p => p.pcode);

  // 리뷰 로드
  const { data: reviews, error } = await supabase
    .from('knowledge_reviews_v2')
    .select('content, rating, sentiment, mentioned_pros, mentioned_cons, key_phrase, source')
    .in('pcode', pcodes)
    .limit(limit);

  if (error) {
    console.error('  Error loading reviews:', error.message);
    return [];
  }

  return reviews || [];
}

async function loadCategoryInfo(categoryKey: string): Promise<CategoryInfo | null> {
  console.log('  Loading category info from knowledge_categories_v2...');

  const { data, error } = await supabase
    .from('knowledge_categories_v2')
    .select('*')
    .eq('category_key', categoryKey)
    .single();

  if (error) {
    console.log('  Category info not found:', error.message);
    return null;
  }

  return data;
}

async function loadProducts(categoryKey: string): Promise<Product[]> {
  console.log('  Loading products from knowledge_products_v2...');

  const { data: v2Products } = await supabase
    .from('knowledge_products_v2')
    .select('pcode, name, brand, price, review_summary, pros, cons, target_persona, spec_summary_text, value_score, quality_score')
    .eq('category_key', categoryKey)
    .order('popularity_rank', { ascending: true })
    .limit(30);

  if (v2Products && v2Products.length > 0) {
    return v2Products;
  }

  // Fallback
  const { data: products } = await supabase
    .from('products')
    .select('pcode, name, brand, price, review_count')
    .eq('category_key', categoryKey)
    .order('review_count', { ascending: false })
    .limit(30);

  return (products || []).map(p => ({
    ...p,
    review_summary: '',
    pros: [],
    cons: [],
  }));
}

// ============================================================================
// Web Search with Gemini Grounding
// ============================================================================

async function searchWebForInsights(categoryKey: string, categoryName: string): Promise<string> {
  console.log('  Performing web search with Gemini grounding...');

  const groundingTool = {
    googleSearch: {},
  };

  const searchPrompt = `
${categoryName || categoryKey} 구매 가이드 2025년 최신 정보를 검색하고 다음을 정리해주세요:

1. 2025년 ${categoryName || categoryKey} 시장 트렌드 (신기술, 인기 기능)
2. 구매 시 주의할 점과 흔한 실수
3. 가격대별 특징 (엔트리/미드레인지/프리미엄)
4. 브랜드별 장단점
5. 전문가들이 추천하는 체크리스트

한국어로 구체적이고 실용적인 정보를 정리해주세요.
`;

  try {
    // 웹서치 그라운딩은 gemini-2.5-flash-lite 사용 (빠름)
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite',
      contents: searchPrompt,
      config: {
        tools: [groundingTool],
      },
    });

    const text = response.text || '';
    const metadata = response.candidates?.[0]?.groundingMetadata;

    // 출처 정보 추가
    let sourcesInfo = '';
    if (metadata?.groundingChunks && metadata.groundingChunks.length > 0) {
      sourcesInfo = '\n\n### 참고 출처\n';
      metadata.groundingChunks.slice(0, 5).forEach((chunk: any, i: number) => {
        if (chunk.web?.title && chunk.web?.uri) {
          sourcesInfo += `- [${chunk.web.title}](${chunk.web.uri})\n`;
        }
      });
    }

    return text + sourcesInfo;
  } catch (error: any) {
    console.error('  Web search failed:', error.message);
    return '';
  }
}

// ============================================================================
// Knowledge Generation
// ============================================================================

async function generateKnowledge(
  categoryKey: string,
  categoryName: string,
  reviews: Review[],
  products: Product[],
  categoryInfo: CategoryInfo | null,
  webInsights: string
): Promise<string> {
  console.log('  Generating final knowledge document...');

  // 리뷰 분석 요약
  const reviewAnalysis = reviews.length > 0 ? `
### 실제 구매자 리뷰 분석 (${reviews.length}개)
${reviews.slice(0, 30).map((r, i) => `- (${r.rating}점/${r.sentiment || '중립'}) ${r.content?.slice(0, 150) || r.key_phrase || ''}...`).join('\n')}

자주 언급된 장점: ${[...new Set(reviews.flatMap(r => r.mentioned_pros || []))].slice(0, 10).join(', ') || '분석 중'}
자주 언급된 단점: ${[...new Set(reviews.flatMap(r => r.mentioned_cons || []))].slice(0, 10).join(', ') || '분석 중'}
` : '(리뷰 데이터 수집 중)';

  // 상품 정보 요약
  const productSummary = products.slice(0, 10).map(p =>
    `- ${p.brand || ''} ${p.name}: ${p.price?.toLocaleString()}원 / 장점: ${(p.pros || []).join(', ') || '분석 중'} / 단점: ${(p.cons || []).join(', ') || '분석 중'}`
  ).join('\n');

  // 카테고리 기존 정보
  const existingInfo = categoryInfo ? `
### 기존 DB 정보
- 시장 트렌드: ${categoryInfo.market_trend || '없음'}
- 구매 가이드: ${categoryInfo.buying_guide || '없음'}
- 주요 트레이드오프: ${JSON.stringify(categoryInfo.common_tradeoffs || [])}
- 가격대: ${JSON.stringify(categoryInfo.price_segments || {})}
` : '';

  const prompt = `
당신은 ${categoryName || categoryKey} 전문 에디터입니다.
아래 데이터를 종합하여 **AI 쇼핑 상담 에이전트가 참조할 지식 문서**를 작성하세요.

## 입력 데이터

### 1. 웹 검색 결과 (2025년 최신)
${webInsights || '(웹 검색 결과 없음)'}

### 2. 실제 구매자 리뷰
${reviewAnalysis}

### 3. 상품 데이터베이스
${productSummary || '(상품 데이터 없음)'}

${existingInfo}

---

## 출력 형식 (마크다운)

# ${categoryName || categoryKey} 전문가 지식

## 핵심 구매 포인트
(가장 중요한 5가지 - 웹 검색 + 리뷰 기반)

## 2025년 시장 트렌드
(최신 트렌드, 신기술, 인기 기능)

## 사용자 유형별 추천

### 유형 1: (예: 1인 가구)
- 추천 스펙/기능
- 피해야 할 것
- 예산 가이드

### 유형 2: (예: 가족 단위)
...

### 유형 3: (예: 요리 마니아)
...

## 실제 사용자들의 생생한 후기

### 만족 포인트 TOP 5
(리뷰에서 추출한 실제 만족 포인트 + 빈도)

### 불만 포인트 TOP 5
(리뷰에서 추출한 실제 불만 + 대응 방법)

## 흔한 구매 실수
(웹 검색 + 리뷰 기반, 구체적 사례)

## 가격대별 가이드
- **엔트리 (~X만원)**: 특징, 추천 대상, 주의점
- **미드레인지 (X~Y만원)**: 특징, 추천 대상, 가성비 포인트
- **프리미엄 (Y만원~)**: 특징, 추천 대상, 투자 가치

## 브랜드별 특징
(웹 검색 기반 브랜드 평판)

## 상담 시 핵심 질문
1. (사용 패턴 파악용 - 이유 포함)
2. (예산 파악용 - 이유 포함)
3. (핵심 니즈 파악용 - 이유 포함)

---
*이 문서는 실제 구매자 리뷰 ${reviews.length}개와 웹 검색 결과를 분석하여 생성되었습니다.*
*마지막 업데이트: ${new Date().toISOString().split('T')[0]}*

---
**중요**: 각 섹션에서 반드시 **구체적인 수치, 브랜드명, 실제 리뷰 인용**을 포함하세요.
추상적인 조언이 아닌 실행 가능한 정보를 제공하세요.
`;

  // 지식 문서 생성은 gemini-2.5-flash 사용
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  let result = response.text || '';

  // 마크다운 코드블록 래퍼 제거
  result = result.replace(/^```markdown\n?/i, '').replace(/\n?```$/i, '');

  return result;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const categoryKey = process.argv[2];
  const categoryName = process.argv[3] || categoryKey;

  if (!categoryKey) {
    console.log('Usage: npx tsx scripts/knowledge/generate-knowledge.ts <categoryKey> [categoryName]');
    console.log('Example: npx tsx scripts/knowledge/generate-knowledge.ts airfryer 에어프라이어');
    process.exit(1);
  }

  console.log(`\n📚 Generating knowledge for: ${categoryKey} (${categoryName})\n`);

  // 1. 데이터 로드 (병렬)
  console.log('1. Loading data from database...');
  const [reviews, products, categoryInfo] = await Promise.all([
    loadReviewsFromDB(categoryKey),
    loadProducts(categoryKey),
    loadCategoryInfo(categoryKey),
  ]);
  console.log(`   - Reviews: ${reviews.length}`);
  console.log(`   - Products: ${products.length}`);
  console.log(`   - Category info: ${categoryInfo ? 'Found' : 'Not found'}`);

  // 2. 웹 검색
  console.log('\n2. Searching web for latest insights...');
  const webInsights = await searchWebForInsights(categoryKey, categoryName);
  console.log(`   - Web insights: ${webInsights ? 'Retrieved' : 'Failed'}`);

  // 3. 지식 생성
  console.log('\n3. Generating knowledge document...');
  const knowledge = await generateKnowledge(
    categoryKey,
    categoryName,
    reviews,
    products,
    categoryInfo,
    webInsights
  );

  // 4. 저장
  const outputDir = path.join(process.cwd(), 'data', 'knowledge', categoryKey);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'index.md');
  fs.writeFileSync(outputPath, knowledge, 'utf-8');

  console.log(`\n4. Saved to: ${outputPath}`);
  console.log('\n✅ Knowledge generation complete!\n');

  // 미리보기
  console.log('--- Preview (first 800 chars) ---');
  console.log(knowledge.slice(0, 800) + '...\n');
}

main().catch(console.error);
