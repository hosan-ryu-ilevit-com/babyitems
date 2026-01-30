#!/usr/bin/env npx tsx
/**
 * 카테고리별 Product Info 프롬프트 생성 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/manual/generate-product-prompts.ts
 *   npx tsx scripts/indexing/manual/generate-product-prompts.ts --only-missing
 *   npx tsx scripts/indexing/manual/generate-product-prompts.ts --include-completed  # 이미 완료된 상품도 포함
 *
 * 출력:
 *   scripts/indexing/manual/output/product-prompts/[카테고리명].txt
 *   scripts/indexing/manual/output/product-prompts/[카테고리명]_2.txt (80개 초과 시)
 */

import * as fs from 'fs';
import * as path from 'path';

const MAX_PRODUCTS_PER_PROMPT = 80; // AI Studio 출력 토큰 한계 고려

interface CategoryProductData {
  categoryName: string;
  questions: {
    id: string;
    question: string;
    options: { value: string; label: string }[];
  }[];
  products: {
    pcode: string;
    name: string;
    brand: string | null;
    price: number | null;
    specSummary: string;
    hasProductInfo: boolean;
  }[];
  stats: {
    total: number;
    withProductInfo: number;
    withoutProductInfo: number;
  };
}

interface Product {
  pcode: string;
  name: string;
  brand: string | null;
  price: number | null;
  specSummary: string;
  hasProductInfo: boolean;
}

function generatePrompt(
  categoryName: string,
  questions: CategoryProductData['questions'],
  products: Product[],
  partInfo?: { part: number; total: number }
): string {
  // 맞춤질문 옵션 목록
  const questionsSection = questions.map((q, i) =>
    `${i + 1}. **${q.id}**: ${q.question}\n   옵션: ${q.options.map(o => `\`${o.value}\`(${o.label})`).join(', ')}`
  ).join('\n\n');

  // 상품 목록
  const productsList = products.map((p, i) =>
    `${i + 1}. [${p.pcode}] ${p.name}\n   브랜드: ${p.brand || '없음'} | 가격: ${p.price?.toLocaleString() || '없음'}원\n   스펙: ${p.specSummary.slice(0, 300) || '(없음)'}`
  ).join('\n\n');

  const partHeader = partInfo
    ? ` (Part ${partInfo.part}/${partInfo.total})`
    : '';

  return `당신은 "${categoryName}" 제품 분석 전문가입니다.${partHeader}

## 맞춤질문 옵션
아래 질문들에 대해 각 상품이 어떤 옵션에 해당하는지 매핑해주세요.(필요하다면 웹서치 적극적으로 활용)

${questionsSection}

## 분석할 상품 목록 (${products.length}개)
${productsList}

## 작업
각 상품의 스펙을 분석하여 맞춤질문 옵션에 매핑해주세요.
- 스펙에서 명확히 알 수 없는 경우 "unknown"
- confidence: "high" (확실) / "medium" (추정) / "low" (불확실)

## 응답 형식 (JSON 배열만 출력)
[
  {
    "pcode": "상품코드",
    "name": "상품명 (확인용)",
    "questionMapping": {
      "question_id_1": {
        "matchedOption": "option_value 또는 unknown",
        "confidence": "high/medium/low",
        "evidence": "판단 근거 (스펙에서 발견한 내용)"
      }
    },
    "analysis": {
      "strengths": ["장점1", "장점2"],
      "weaknesses": ["단점1"],
      "bestFor": "이런 사용자에게 추천"
    }
  }
]

JSON만 출력하세요. 마크다운 코드블록 없이 순수 JSON만.`;
}

async function main() {
  const args = process.argv.slice(2);
  const onlyMissing = args.includes('--only-missing');
  const includeCompleted = args.includes('--include-completed');

  console.log('🚀 Product Info 프롬프트 생성 시작...');
  if (includeCompleted) {
    console.log('   (--include-completed: 이미 완료된 상품도 포함)');
  }
  console.log('');

  // 데이터 로드
  const dataPath = path.join(__dirname, 'output', 'products-data.json');
  if (!fs.existsSync(dataPath)) {
    console.log('❌ products-data.json이 없습니다.');
    console.log('   먼저 실행: npx tsx scripts/indexing/manual/export-product-data.ts');
    process.exit(1);
  }

  const data: CategoryProductData[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // 인덱싱 필요한 카테고리만 필터
  const categoriesToProcess = data.filter(cat => {
    const needsIndexing = cat.products.some(p => !p.hasProductInfo);
    return onlyMissing ? needsIndexing : true;
  });

  console.log(`📊 처리할 카테고리: ${categoriesToProcess.length}개\n`);

  // 출력 디렉토리 생성
  const outputDir = path.join(__dirname, 'output', 'product-prompts');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 결과 파일 디렉토리도 생성
  const resultsDir = path.join(__dirname, 'output', 'product-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  let totalPrompts = 0;

  // 프롬프트 생성
  for (const cat of categoriesToProcess) {
    const productsToIndex = includeCompleted
      ? cat.products  // 모든 상품 포함
      : cat.products.filter(p => !p.hasProductInfo);  // 미완료 상품만

    if (productsToIndex.length === 0) {
      console.log(`✅ ${cat.categoryName} - 이미 완료`);
      continue;
    }

    // 80개씩 분할
    const chunks: Product[][] = [];
    for (let i = 0; i < productsToIndex.length; i += MAX_PRODUCTS_PER_PROMPT) {
      chunks.push(productsToIndex.slice(i, i + MAX_PRODUCTS_PER_PROMPT));
    }

    if (chunks.length === 1) {
      // 분할 불필요
      const prompt = generatePrompt(cat.categoryName, cat.questions, chunks[0]);
      const outputPath = path.join(outputDir, `${cat.categoryName}.txt`);
      fs.writeFileSync(outputPath, prompt, 'utf-8');

      // 빈 결과 파일도 생성
      const resultPath = path.join(resultsDir, `${cat.categoryName}.json`);
      if (!fs.existsSync(resultPath)) {
        fs.writeFileSync(resultPath, '[]', 'utf-8');
      }

      console.log(`✅ ${cat.categoryName}.txt (${productsToIndex.length}개 상품)`);
      totalPrompts++;
    } else {
      // 분할 필요
      for (let i = 0; i < chunks.length; i++) {
        const partNum = i + 1;
        const suffix = partNum === 1 ? '' : `_${partNum}`;
        const prompt = generatePrompt(
          cat.categoryName,
          cat.questions,
          chunks[i],
          { part: partNum, total: chunks.length }
        );
        const outputPath = path.join(outputDir, `${cat.categoryName}${suffix}.txt`);
        fs.writeFileSync(outputPath, prompt, 'utf-8');

        // 빈 결과 파일도 생성
        const resultPath = path.join(resultsDir, `${cat.categoryName}${suffix}.json`);
        if (!fs.existsSync(resultPath)) {
          fs.writeFileSync(resultPath, '[]', 'utf-8');
        }

        totalPrompts++;
      }
      console.log(`✅ ${cat.categoryName} → ${chunks.length}개 파일로 분할 (총 ${productsToIndex.length}개 상품)`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📁 프롬프트 저장 위치: ${outputDir}`);
  console.log(`📁 결과 저장 위치: ${resultsDir}`);
  console.log(`📊 총 프롬프트 파일: ${totalPrompts}개`);
  console.log(`\n📋 사용 방법:`);
  console.log(`   1. product-prompts/[카테고리명].txt 복사 → AI Studio 실행`);
  console.log(`   2. JSON 결과를 product-results/[카테고리명].json에 저장`);
  console.log(`   3. 분할된 경우 각 파트 결과를 합쳐서 저장`);
  console.log(`   4. npx tsx scripts/indexing/manual/upload-product-results.ts 실행`);
  console.log(`${'='.repeat(60)}`);
}

main().catch(console.error);
