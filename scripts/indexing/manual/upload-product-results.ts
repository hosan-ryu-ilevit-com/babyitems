#!/usr/bin/env npx tsx
/**
 * AI Studio Product Info 결과 업로드 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/manual/upload-product-results.ts
 *   npx tsx scripts/indexing/manual/upload-product-results.ts --category="공기청정기"
 *   npx tsx scripts/indexing/manual/upload-product-results.ts --dry-run
 *
 * 입력:
 *   scripts/indexing/manual/output/product-results/*.json
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ProductResult {
  pcode: string;
  name: string;
  questionMapping: Record<string, {
    matchedOption: string;
    confidence: string;
    evidence: string;
  }>;
  analysis: {
    strengths: string[];
    weaknesses: string[];
    bestFor: string;
  };
}

interface ProductInfo {
  version: number;
  indexedAt: string;
  specs: {
    raw: string;
    parsed: Record<string, string>;
    highlights: string[];
  };
  questionMapping: Record<string, {
    matchedOption: string;
    confidence: string;
    evidence: string;
  }>;
  webEnriched: null;
  analysis: {
    strengths: string[];
    weaknesses: string[];
    bestFor: string;
  } | null;
}

async function main() {
  const args = process.argv.slice(2);
  let targetCategory = '';
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      targetCategory = arg.split('=')[1].replace(/['"]/g, '');
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  console.log('🚀 Product Info 결과 업로드 시작...\n');
  if (dryRun) console.log('⚠️  DRY RUN 모드\n');

  const resultsDir = path.join(__dirname, 'output', 'product-results');

  if (!fs.existsSync(resultsDir)) {
    console.log(`❌ 결과 디렉토리가 없습니다: ${resultsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    console.log('❌ 업로드할 JSON 파일이 없습니다.');
    process.exit(1);
  }

  console.log(`📁 발견된 결과 파일: ${files.length}개\n`);

  const results: { category: string; success: number; skipped: number; error?: string }[] = [];

  for (const file of files) {
    const categoryName = path.basename(file, '.json');

    if (targetCategory && categoryName !== targetCategory) {
      continue;
    }

    console.log(`📤 ${categoryName} 처리 중...`);

    try {
      const filePath = path.join(resultsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data: ProductResult[] = JSON.parse(content);

      // 빈 배열이나 유효하지 않은 데이터 스킵
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`   ⏭️  스킵 (데이터 없음)`);
        results.push({ category: categoryName, success: 0, skipped: 0 });
        continue;
      }

      let successCount = 0;
      let skippedCount = 0;

      for (const product of data) {
        if (!product.pcode || !product.questionMapping) {
          skippedCount++;
          continue;
        }

        // 기존 상품 데이터 조회
        const { data: existingProduct, error: fetchError } = await supabase
          .from('knowledge_products_cache')
          .select('spec_summary')
          .eq('pcode', product.pcode)
          .single();

        if (fetchError || !existingProduct) {
          console.log(`   ⚠️ ${product.pcode} 찾을 수 없음`);
          skippedCount++;
          continue;
        }

        // ProductInfo 구성
        const productInfo: ProductInfo = {
          version: 1,
          indexedAt: new Date().toISOString(),
          specs: {
            raw: existingProduct.spec_summary || '',
            parsed: {},
            highlights: [],
          },
          questionMapping: product.questionMapping,
          webEnriched: null,
          analysis: product.analysis || null,
        };

        if (dryRun) {
          console.log(`   📄 ${product.pcode}: ${Object.keys(product.questionMapping).length}개 매핑`);
        } else {
          const { error: updateError } = await supabase
            .from('knowledge_products_cache')
            .update({ product_info: productInfo })
            .eq('pcode', product.pcode);

          if (updateError) {
            console.log(`   ❌ ${product.pcode}: ${updateError.message}`);
            skippedCount++;
            continue;
          }
        }

        successCount++;
      }

      results.push({ category: categoryName, success: successCount, skipped: skippedCount });
      console.log(`   ✅ 성공: ${successCount}개, 스킵: ${skippedCount}개`);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      results.push({ category: categoryName, success: 0, skipped: 0, error: errorMsg });
      console.log(`   ❌ 실패: ${errorMsg}`);
    }
  }

  // 결과 요약
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 업로드 결과');
  console.log(`${'='.repeat(60)}`);

  const totalSuccess = results.reduce((sum, r) => sum + r.success, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

  console.log(`   총 성공: ${totalSuccess}개`);
  console.log(`   총 스킵: ${totalSkipped}개`);

  if (results.some(r => r.error)) {
    console.log('\n⚠️ 실패 목록:');
    results.filter(r => r.error).forEach(r => {
      console.log(`   - ${r.category}: ${r.error}`);
    });
  }

  if (dryRun) {
    console.log('\n💡 실제 업로드하려면 --dry-run 없이 실행하세요.');
  }
}

main().catch(console.error);
