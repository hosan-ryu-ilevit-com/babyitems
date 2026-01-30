#!/usr/bin/env npx tsx
/**
 * 카테고리별 AI Studio 프롬프트 생성 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/manual/generate-prompts.ts
 *   npx tsx scripts/indexing/manual/generate-prompts.ts --only-missing  # 맞춤질문 없는 카테고리만
 *
 * 출력:
 *   scripts/indexing/manual/output/prompts/[카테고리명].txt
 */

import * as fs from 'fs';
import * as path from 'path';

interface CategoryData {
  categoryName: string;
  hasCustomQuestions: boolean;
  products: {
    pcode: string;
    name: string;
    brand: string | null;
    price: number | null;
    specSummary: string;
    reviewCount: number;
    rating: number | null;
  }[];
  reviews: {
    rating: number;
    content: string;
  }[];
  priceStats: {
    min: number;
    max: number;
    avg: number;
  };
  topBrands: string[];
}

function generatePrompt(cat: CategoryData): string {
  // 상위 10개 상품 스펙
  const productSpecs = cat.products.slice(0, 10).map((p, i) =>
    `${i + 1}. ${p.name} | ${p.specSummary || '(스펙 없음)'}`
  ).join('\n');

  // 긍정 리뷰 (4-5점, 최대 10개)
  const positiveReviews = cat.reviews
    .filter(r => r.rating >= 4 && r.content.length >= 30)
    .slice(0, 10)
    .map((r, i) => `${i + 1}. [${r.rating}점] ${r.content.slice(0, 200)}`)
    .join('\n');

  // 부정 리뷰 (1-3점, 최대 10개)
  const negativeReviews = cat.reviews
    .filter(r => r.rating <= 3 && r.content.length >= 30)
    .slice(0, 10)
    .map((r, i) => `${i + 1}. [${r.rating}점] ${r.content.slice(0, 200)}`)
    .join('\n');

  return `당신은 "${cat.categoryName}" 구매 결정을 돕는 전문 쇼핑 컨시어지입니다.

## 시장 데이터
- **카테고리:** ${cat.categoryName}
- **상품 수:** ${cat.products.length}개
- **가격대:** ${cat.priceStats.min.toLocaleString()}원 ~ ${cat.priceStats.max.toLocaleString()}원 (평균 ${cat.priceStats.avg.toLocaleString()}원)
- **주요 브랜드:** ${cat.topBrands.join(', ') || '정보 없음'}

## 상위 제품 스펙 (상위 10개)
${productSpecs || '(상품 정보 없음)'}

## 리뷰 샘플
### 긍정 리뷰 (4-5점)
${positiveReviews || '(긍정 리뷰 없음)'}

### 부정 리뷰 (1-3점)
${negativeReviews || '(부정 리뷰 없음)'}

## 작업
1. 위 데이터를 분석하여 이 카테고리의 핵심 구매 결정 요소를 파악하세요
2. 3-5개의 맞춤질문을 생성하세요 (예산 질문 제외 - 예산은 별도 처리됨)
3. 각 질문은 2-4개의 상호 배타적 옵션을 가져야 합니다
4. 옵션의 isPopular는 가장 인기있는 옵션 1개에만 true로 설정

## 응답 형식 (JSON만 출력, 마크다운 코드블록 없이)
{
  "overview": "이 카테고리에 대한 3-5문장 개요. 선택이 어려운 이유, 중요한 기준 설명",
  "questions": [
    {
      "id": "snake_case_id",
      "question": "질문 텍스트 (30-50자)",
      "reason": "이 질문이 중요한 이유 (2-3문장)",
      "options": [
        {
          "value": "option_value",
          "label": "옵션 라벨 (10-20자)",
          "description": "옵션 설명 (20-40자)",
          "isPopular": false
        }
      ],
      "type": "single",
      "priority": 1,
      "dataSource": "indexed",
      "completed": false
    }
  ]
}`;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyMissing = args.includes('--only-missing');

  console.log('🚀 카테고리별 프롬프트 생성 시작...\n');

  // 데이터 로드
  const dataPath = path.join(__dirname, 'output', 'categories-data.json');
  if (!fs.existsSync(dataPath)) {
    console.log('❌ categories-data.json이 없습니다.');
    console.log('   먼저 실행: npx tsx scripts/indexing/manual/export-category-data.ts');
    process.exit(1);
  }

  const data: CategoryData[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // 필터링
  let categories = data;
  if (onlyMissing) {
    categories = data.filter(c => !c.hasCustomQuestions);
    console.log(`📊 맞춤질문 없는 카테고리만: ${categories.length}개\n`);
  } else {
    console.log(`📊 전체 카테고리: ${categories.length}개\n`);
  }

  // 출력 디렉토리 생성
  const outputDir = path.join(__dirname, 'output', 'prompts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 프롬프트 생성
  for (const cat of categories) {
    const prompt = generatePrompt(cat);
    const outputPath = path.join(outputDir, `${cat.categoryName}.txt`);
    fs.writeFileSync(outputPath, prompt, 'utf-8');
    console.log(`✅ ${cat.categoryName}.txt (상품 ${cat.products.length}개, 리뷰 ${cat.reviews.length}개)`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📁 프롬프트 저장 위치: ${outputDir}`);
  console.log(`\n📋 사용 방법:`);
  console.log(`   1. 각 .txt 파일을 AI Studio에 복사`);
  console.log(`   2. 실행 후 JSON 결과를 output/results/[카테고리명].json에 저장`);
  console.log(`   3. npx tsx scripts/indexing/manual/upload-results.ts 실행`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(console.error);
