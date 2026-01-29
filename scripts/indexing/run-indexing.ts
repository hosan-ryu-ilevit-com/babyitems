#!/usr/bin/env npx tsx
/**
 * 통합 인덱싱 실행 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/run-indexing.ts --category="이유식조리기"
 *   npx tsx scripts/indexing/run-indexing.ts --category="이유식조리기" --step=questions
 *   npx tsx scripts/indexing/run-indexing.ts --category="이유식조리기" --step=products --concurrency=5
 *
 * 옵션:
 *   --category: 카테고리명 (필수)
 *   --step: 실행할 단계 (questions | products | all) - 기본값: all
 *   --concurrency: 동시 처리 수 - 기본값: 3
 *   --skip-questions: 맞춤질문 생성 건너뛰기 (이미 생성된 경우)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// 설정
// ============================================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================================================
// 메인 함수
// ============================================================================

async function main() {
  const args = parseArgs();
  const { category, step, concurrency, skipQuestions } = args;

  if (!category) {
    printUsage();
    process.exit(1);
  }

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    🚀 통합 인덱싱 실행                        ║
╠══════════════════════════════════════════════════════════════╣
║  카테고리: ${category.padEnd(48)}║
║  단계: ${step.padEnd(52)}║
║  동시처리: ${String(concurrency).padEnd(48)}║
╚══════════════════════════════════════════════════════════════╝
`);

  const startTime = Date.now();

  try {
    // Step 1: 맞춤질문 생성
    if ((step === 'all' || step === 'questions') && !skipQuestions) {
      console.log('\n' + '─'.repeat(60));
      console.log('📝 Step 1: 맞춤질문 생성');
      console.log('─'.repeat(60));

      // 기존 맞춤질문 확인
      const hasQuestions = await checkExistingQuestions(category);
      if (hasQuestions) {
        console.log('⚠️  기존 맞춤질문이 있습니다. 덮어쓰시겠습니까?');
        console.log('    (--skip-questions 옵션으로 건너뛸 수 있습니다)');
      }

      await runScript('generate-custom-questions.ts', [`--category=${category}`]);
      console.log('\n✅ 맞춤질문 생성 완료!');
    }

    // Step 2: Product Info 인덱싱
    if (step === 'all' || step === 'products') {
      console.log('\n' + '─'.repeat(60));
      console.log('📦 Step 2: Product Info 인덱싱');
      console.log('─'.repeat(60));

      await runScript('index-product-info.ts', [
        `--category=${category}`,
        `--concurrency=${concurrency}`,
      ]);
      console.log('\n✅ Product Info 인덱싱 완료!');
    }

    // 완료 통계
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await printSummary(category, elapsed);

  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    process.exit(1);
  }
}

// ============================================================================
// 유틸리티 함수
// ============================================================================

async function checkExistingQuestions(category: string): Promise<boolean> {
  const { data } = await supabase
    .from('knowledge_categories')
    .select('custom_questions')
    .eq('query', category)
    .single();

  return !!data?.custom_questions;
}

function runScript(scriptName: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const scriptPath = `scripts/indexing/${scriptName}`;
    const child = spawn('npx', ['tsx', scriptPath, ...args], {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptName} 실행 실패 (exit code: ${code})`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function printSummary(category: string, elapsed: string) {
  // 카테고리 정보 조회
  const { data: catData } = await supabase
    .from('knowledge_categories')
    .select('product_count, custom_questions')
    .eq('query', category)
    .single();

  // 인덱싱된 상품 수 조회
  const { count: indexedCount } = await supabase
    .from('knowledge_products_cache')
    .select('*', { count: 'exact', head: true })
    .eq('query', category)
    .not('product_info', 'is', null);

  const questionCount = catData?.custom_questions
    ? (catData.custom_questions.match(/^## 질문/gm) || []).length
    : 0;

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    ✅ 인덱싱 완료                             ║
╠══════════════════════════════════════════════════════════════╣
║  카테고리: ${category.padEnd(48)}║
║  맞춤질문: ${String(questionCount + '개').padEnd(48)}║
║  인덱싱된 상품: ${String((indexedCount || 0) + '개').padEnd(43)}║
║  총 소요시간: ${String(elapsed + '초').padEnd(45)}║
╚══════════════════════════════════════════════════════════════╝

다음 단계:
  1. Supabase에서 knowledge_categories 테이블 확인 (custom_questions 컬럼)
  2. knowledge_products_cache 테이블에서 product_info 컬럼 확인
  3. 매핑 정확도 스팟체크
`);
}

function parseArgs(): {
  category: string;
  step: 'all' | 'questions' | 'products';
  concurrency: number;
  skipQuestions: boolean;
} {
  const args = process.argv.slice(2);
  let category = '';
  let step: 'all' | 'questions' | 'products' = 'all';
  let concurrency = 7;
  let skipQuestions = false;

  for (const arg of args) {
    if (arg.startsWith('--category=')) {
      category = arg.split('=')[1].replace(/['"]/g, '');
    } else if (arg.startsWith('--step=')) {
      const stepArg = arg.split('=')[1] as 'all' | 'questions' | 'products';
      if (['all', 'questions', 'products'].includes(stepArg)) {
        step = stepArg;
      }
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = parseInt(arg.split('=')[1]) || 3;
    } else if (arg === '--skip-questions') {
      skipQuestions = true;
    }
  }

  return { category, step, concurrency, skipQuestions };
}

function printUsage() {
  console.log(`
사용법:
  npx tsx scripts/indexing/run-indexing.ts --category="카테고리명"

옵션:
  --category=<name>     카테고리명 (필수)
  --step=<step>         실행 단계 (all | questions | products) - 기본값: all
  --concurrency=<n>     동시 처리 수 - 기본값: 3
  --skip-questions      맞춤질문 생성 건너뛰기

예시:
  # 전체 실행 (맞춤질문 생성 + Product Info 인덱싱)
  npx tsx scripts/indexing/run-indexing.ts --category="이유식조리기"

  # 맞춤질문만 생성
  npx tsx scripts/indexing/run-indexing.ts --category="이유식조리기" --step=questions

  # Product Info만 인덱싱 (맞춤질문 이미 있을 때)
  npx tsx scripts/indexing/run-indexing.ts --category="이유식조리기" --step=products

  # 높은 동시 처리로 실행
  npx tsx scripts/indexing/run-indexing.ts --category="이유식조리기" --concurrency=5
`);
}

// 실행
main().catch(console.error);
