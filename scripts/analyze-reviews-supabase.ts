#!/usr/bin/env npx tsx
/**
 * Supabase 기반 카테고리 리뷰 체감속성 분석 스크립트
 * 
 * 사용법:
 *   npx tsx scripts/analyze-reviews-supabase.ts <categoryKey>
 *   npx tsx scripts/analyze-reviews-supabase.ts --all
 * 
 * 예시:
 *   npx tsx scripts/analyze-reviews-supabase.ts stroller
 *   npx tsx scripts/analyze-reviews-supabase.ts --all
 */

import 'dotenv/config';
import * as dotenv from 'dotenv';
import path from 'path';
import * as fs from 'fs';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Supabase 클라이언트
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Gemini 클라이언트
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY 환경변수가 필요합니다');
  process.exit(1);
}
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 카테고리 코드 매핑 (categoryUtils.ts와 동일)
const CATEGORY_CODE_MAP: Record<string, string[]> = {
  stroller: ['16349368', '16349193', '16349195', '16349196', 'stroller'],
  car_seat: ['16349200', '16349201', '16349202', '16353763', 'car_seat'],
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

interface Review {
  pcode: string;
  content: string;
  rating: number;
}

interface HiddenCriteria {
  id: string;
  name: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  mentionCount: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  keywords: string[];
  sampleEvidence: string[];
  questionForUser: string;
  filterOptions: string[];
}

interface CategoryAnalysis {
  categoryKey: string;
  categoryName: string;
  hiddenCriteria: HiddenCriteria[];
  specVsRealityGaps?: Array<{
    specClaim: string;
    realityFromReviews: string;
    mentionCount: number;
  }>;
  unexpectedUseCases?: Array<{
    useCase: string;
    mentionCount: number;
    quote: string;
  }>;
  analyzedAt: string;
  reviewCount: number;
}

/**
 * Supabase에서 카테고리별 리뷰 가져오기
 */
async function fetchReviewsFromSupabase(categoryKey: string): Promise<Review[]> {
  const categoryCodes = CATEGORY_CODE_MAP[categoryKey];
  if (!categoryCodes) {
    console.error(`❌ 알 수 없는 카테고리: ${categoryKey}`);
    return [];
  }

  const reviews: Review[] = [];

  // 1. 다나와 제품 pcode 가져오기
  const { data: danawaProducts } = await supabase
    .from('danawa_products')
    .select('pcode')
    .in('category_code', categoryCodes.filter(c => !isNaN(Number(c))));

  const danawaPcodes = danawaProducts?.map(p => p.pcode) || [];

  // 2. 에누리 제품 pcode 가져오기 (categoryKey가 문자열인 경우)
  const { data: enuriProducts } = await supabase
    .from('enuri_products')
    .select('pcode')
    .in('category_code', categoryCodes.filter(c => isNaN(Number(c))));

  const enuriPcodes = enuriProducts?.map(p => p.pcode) || [];

  const allPcodes = [...new Set([...danawaPcodes, ...enuriPcodes])];
  console.log(`   📦 ${allPcodes.length}개 제품 발견 (danawa: ${danawaPcodes.length}, enuri: ${enuriPcodes.length})`);

  if (allPcodes.length === 0) {
    return [];
  }

  // 3. 다나와 리뷰 가져오기
  const { data: danawaReviews } = await supabase
    .from('danawa_reviews')
    .select('pcode, content, rating')
    .in('pcode', allPcodes);

  if (danawaReviews) {
    reviews.push(...danawaReviews.filter(r => r.content && r.content.length > 20));
  }

  // 4. 에누리 리뷰 가져오기
  const { data: enuriReviews } = await supabase
    .from('enuri_reviews')
    .select('pcode, content, rating')
    .in('pcode', allPcodes);

  if (enuriReviews) {
    reviews.push(...enuriReviews.filter(r => r.content && r.content.length > 20));
  }

  console.log(`   📝 총 ${reviews.length}개 리뷰 로드`);
  return reviews;
}

/**
 * 감정별 샘플링 (고평점/저평점 분리, 긴 리뷰 우선)
 */
function sampleBalanced(reviews: Review[], highCount: number, lowCount: number) {
  const high = reviews
    .filter(r => r.rating >= 4)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, highCount);

  const low = reviews
    .filter(r => r.rating <= 2)
    .sort((a, b) => b.content.length - a.content.length)
    .slice(0, lowCount);

  return { high, low };
}

/**
 * LLM으로 체감속성 분석
 */
async function analyzeWithLLM(reviews: Review[], categoryKey: string, categoryName: string): Promise<CategoryAnalysis> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const reviewsText = reviews.map((r, i) =>
    `[리뷰 ${i + 1}] (별점: ${r.rating}점)\n${r.content.slice(0, 800)}`
  ).join('\n\n---\n\n');

  const prompt = `당신은 육아용품 구매 전문가입니다.

## 분석 대상
카테고리: ${categoryName} (${categoryKey})
리뷰 수: ${reviews.length}개

## 리뷰 데이터
${reviewsText}

## 분석 요청
위 리뷰들을 분석하여 **제조사 스펙에서는 알 수 없지만, 실제 구매 시 중요한 "숨겨진 구매 기준"**을 추출해주세요.

## 출력 형식 (JSON)
\`\`\`json
{
  "categoryKey": "${categoryKey}",
  "hiddenCriteria": [
    {
      "id": "criteria_id_snake_case",
      "name": "체감속성 이름 (한글)",
      "description": "이 기준이 왜 중요한지 설명",
      "importance": "high",
      "mentionCount": 5,
      "sentiment": "negative",
      "keywords": ["키워드1", "키워드2", "키워드3"],
      "sampleEvidence": ["실제 리뷰 문장1", "실제 리뷰 문장2"],
      "questionForUser": "사용자에게 물어볼 질문?",
      "filterOptions": ["옵션1", "옵션2", "상관없음"]
    }
  ],
  "specVsRealityGaps": [
    {
      "specClaim": "제조사가 주장하는 스펙",
      "realityFromReviews": "실제 리뷰에서 나온 현실",
      "mentionCount": 3
    }
  ],
  "unexpectedUseCases": [
    {
      "useCase": "예상치 못한 활용 사례",
      "mentionCount": 2,
      "quote": "실제 리뷰 인용"
    }
  ]
}
\`\`\`

## 주의사항
- 스펙에서 이미 알 수 있는 것(가격, 용량, 브랜드 등)은 제외
- 실제 사용자만 알 수 있는 체감 정보에 집중
- importance는 리뷰에서 언급 빈도와 감정 강도 기반으로 판단
- 최소 5개 이상의 hiddenCriteria 추출
- id는 영문 snake_case로 작성 (예: cleaning_frequency, noise_level)
- keywords는 리뷰에서 실제로 자주 등장하는 단어들`;

  const result = await model.generateContent(prompt);
  const response = result.response.text();

  // JSON 추출
  let jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
  if (!jsonMatch) {
    jsonMatch = response.match(/\{[\s\S]*"hiddenCriteria"[\s\S]*\}/);
  }

  if (jsonMatch) {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    try {
      const parsed = JSON.parse(jsonStr);
      return {
        ...parsed,
        categoryName,
        analyzedAt: new Date().toISOString(),
        reviewCount: reviews.length,
      };
    } catch (e) {
      // JSON 수정 시도 (trailing comma 제거 등)
      const cleaned = jsonStr
        .replace(/,(\s*[}\]])/g, '$1')
        .replace(/\n/g, ' ')
        .replace(/\t/g, ' ');
      try {
        const parsed = JSON.parse(cleaned);
        return {
          ...parsed,
          categoryName,
          analyzedAt: new Date().toISOString(),
          reviewCount: reviews.length,
        };
      } catch {
        console.error('❌ JSON 파싱 실패');
        fs.writeFileSync('./data/experience-index/raw_response.txt', response, 'utf-8');
        throw new Error('JSON 파싱 실패');
      }
    }
  }

  console.error('❌ JSON 매칭 실패');
  fs.writeFileSync('./data/experience-index/raw_response.txt', response, 'utf-8');
  throw new Error('JSON 매칭 실패');
}

/**
 * 단일 카테고리 분석
 */
async function analyzeCategory(categoryKey: string): Promise<boolean> {
  const categoryName = CATEGORY_NAMES[categoryKey] || categoryKey;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 [${categoryKey}] ${categoryName} 분석 시작`);
  console.log('='.repeat(60));

  // 1. 리뷰 로드
  console.log('\n1️⃣ Supabase에서 리뷰 로드 중...');
  const allReviews = await fetchReviewsFromSupabase(categoryKey);

  if (allReviews.length === 0) {
    console.log(`   ⚠️ 리뷰가 없습니다. 스킵합니다.`);
    return false;
  }

  // 2. 샘플링
  console.log('\n2️⃣ 샘플링 중...');
  const { high, low } = sampleBalanced(allReviews, 30, 20);
  console.log(`   고평점(4-5★): ${high.length}개`);
  console.log(`   저평점(1-2★): ${low.length}개`);

  const sampledReviews = [...high, ...low];

  if (sampledReviews.length < 10) {
    console.log(`   ⚠️ 샘플이 너무 적습니다 (${sampledReviews.length}개). 스킵합니다.`);
    return false;
  }

  // 3. LLM 분석
  console.log('\n3️⃣ LLM 분석 중... (약 10-30초 소요)');
  const startTime = Date.now();
  const analysis = await analyzeWithLLM(sampledReviews, categoryKey, categoryName);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   ✅ 완료! (${elapsed}초)`);

  // 4. 결과 저장
  const outputDir = path.join(process.cwd(), 'data', 'experience-index');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, `${categoryKey}_analysis.json`);
  fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2), 'utf-8');
  console.log(`\n4️⃣ 결과 저장: ${outputPath}`);

  // 5. 결과 요약
  console.log('\n📋 분석 결과 요약:');
  console.log(`   🔍 숨겨진 구매 기준: ${analysis.hiddenCriteria?.length || 0}개`);
  analysis.hiddenCriteria?.slice(0, 5).forEach((c, i) => {
    console.log(`      ${i + 1}. ${c.name} [${c.importance}] - ${c.sentiment}`);
  });

  return true;
}

/**
 * 메인 함수
 */
async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.log('사용법:');
    console.log('  npx tsx scripts/analyze-reviews-supabase.ts <categoryKey>');
    console.log('  npx tsx scripts/analyze-reviews-supabase.ts --all');
    console.log('\n사용 가능한 카테고리:');
    Object.keys(CATEGORY_CODE_MAP).forEach(key => {
      console.log(`  - ${key} (${CATEGORY_NAMES[key] || key})`);
    });
    return;
  }

  if (arg === '--all') {
    // 모든 카테고리 분석
    console.log('🚀 모든 카테고리 분석 시작...\n');
    const results: { category: string; success: boolean }[] = [];

    for (const categoryKey of Object.keys(CATEGORY_CODE_MAP)) {
      // 이미 완료된 카테고리 스킵
      if (['formula_maker', 'baby_formula_dispenser'].includes(categoryKey)) {
        console.log(`⏭️ ${categoryKey} - 이미 완료됨, 스킵`);
        results.push({ category: categoryKey, success: true });
        continue;
      }

      try {
        const success = await analyzeCategory(categoryKey);
        results.push({ category: categoryKey, success });
      } catch (error) {
        console.error(`❌ ${categoryKey} 분석 실패:`, error);
        results.push({ category: categoryKey, success: false });
      }

      // API rate limit 방지를 위한 딜레이
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 결과 요약
    console.log('\n' + '='.repeat(60));
    console.log('📊 전체 분석 결과');
    console.log('='.repeat(60));
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`✅ 성공: ${succeeded}개`);
    console.log(`❌ 실패: ${failed}개`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.category}`);
    });
  } else {
    // 단일 카테고리 분석
    if (!CATEGORY_CODE_MAP[arg]) {
      console.error(`❌ 알 수 없는 카테고리: ${arg}`);
      console.log('\n사용 가능한 카테고리:');
      Object.keys(CATEGORY_CODE_MAP).forEach(key => {
        console.log(`  - ${key} (${CATEGORY_NAMES[key] || key})`);
      });
      return;
    }

    await analyzeCategory(arg);
  }
}

main().catch(console.error);
