#!/usr/bin/env npx tsx
/**
 * 모든 카테고리 인덱싱 스크립트
 *
 * 사용법:
 *   npx tsx scripts/indexing/run-all-categories.ts
 *   npx tsx scripts/indexing/run-all-categories.ts --step=products
 *   npx tsx scripts/indexing/run-all-categories.ts --concurrency=5
 *
 * 옵션:
 *   --step: 실행할 단계 (questions | products | all) - 기본값: all
 *   --concurrency: 동시 처리 수 - 기본값: 7
 *   --skip-questions: 맞춤질문 생성 건너뛰기
 *   --dry-run: 실제 실행 없이 대상 카테고리만 출력
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
  const { step, concurrency, skipQuestions, dryRun } = args;

  console.log(`
╔══════════════════════════════════════════════════════════════╗
║              🚀 전체 카테고리 인덱싱 실행                     ║
╠══════════════════════════════════════════════════════════════╣
║  단계: ${step.padEnd(52)}║
║  동시처리: ${String(concurrency).padEnd(48)}║
║  맞춤질문 생성: ${skipQuestions ? '건너뛰기'.padEnd(43) : '포함'.padEnd(46)}║
╚══════════════════════════════════════════════════════════════╝
`);

  const startTime = Date.now();

  try {
    // 1. 활성 카테고리 목록 조회
    console.log('[Step 1] 카테고리 목록 조회 중...');
    const categories = await getActiveCategories();
    console.log(`  ✅ ${categories.length}개 카테고리 발견\n`);

    categories.forEach((cat, i) => {
      console.log(`     ${i + 1}. ${cat.query} (상품 ${cat.product_count}개)`);
    });

    if (dryRun) {
      console.log('\n🔍 Dry run 모드 - 실제 실행 없이 종료합니다.');
      return;
    }

    // 2. 순차적으로 각 카테고리 인덱싱
    console.log('\n[Step 2] 카테고리별 인덱싱 시작...\n');

    const results: { category: string; success: boolean; error?: string; timeMs: number }[] = [];

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i];
      const catStart = Date.now();

      console.log(`\n${'─'.repeat(60)}`);
      console.log(`📦 [${i + 1}/${categories.length}] ${cat.query} 처리 중...`);
      console.log(`${'─'.repeat(60)}`);

      try {
        await runIndexing(cat.query, step, concurrency, skipQuestions);
        const elapsed = ((Date.now() - catStart) / 1000).toFixed(1);
        results.push({ category: cat.query, success: true, timeMs: Date.now() - catStart });
        console.log(`\n✅ ${cat.query} 완료 (${elapsed}초)`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        results.push({ category: cat.query, success: false, error: errorMsg, timeMs: Date.now() - catStart });
        console.error(`\n❌ ${cat.query} 실패: ${errorMsg}`);
      }

      // 카테고리 간 딜레이 (Rate limit 방지)
      if (i < categories.length - 1) {
        console.log('\n⏳ 다음 카테고리 전 5초 대기...');
        await sleep(5000);
      }
    }

    // 3. 최종 결과 출력
    const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    console.log(`

╔══════════════════════════════════════════════════════════════╗
║                    ✅ 전체 인덱싱 완료                        ║
╠══════════════════════════════════════════════════════════════╣
║  총 카테고리: ${String(categories.length + '개').padEnd(45)}║
║  성공: ${String(successCount + '개').padEnd(52)}║
║  실패: ${String(failedCount + '개').padEnd(52)}║
║  총 소요시간: ${String(totalElapsed + '분').padEnd(45)}║
╚══════════════════════════════════════════════════════════════╝
`);

    // 실패한 카테고리 출력
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
      console.log('\n⚠️ 실패한 카테고리:');
      failed.forEach(f => {
        console.log(`   - ${f.category}: ${f.error}`);
      });
    }

    // 카테고리별 소요 시간
    console.log('\n📊 카테고리별 소요 시간:');
    results
      .sort((a, b) => b.timeMs - a.timeMs)
      .forEach(r => {
        const status = r.success ? '✅' : '❌';
        const time = (r.timeMs / 1000).toFixed(1);
        console.log(`   ${status} ${r.category}: ${time}초`);
      });

  } catch (error) {
    console.error('\n❌ 오류 발생:', error);
    process.exit(1);
  }
}

// ============================================================================
// 카테고리 조회
// ============================================================================

async function getActiveCategories(): Promise<{ query: string; product_count: number }[]> {
  const { data, error } = await supabase
    .from('knowledge_categories')
    .select('query, product_count')
    .eq('is_active', true)
    .order('product_count', { ascending: false });

  if (error) throw new Error(`카테고리 조회 실패: ${error.message}`);
  return data || [];
}

// ============================================================================
// 인덱싱 실행
// ============================================================================

function runIndexing(
  category: string,
  step: string,
  concurrency: number,
  skipQuestions: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      'tsx',
      'scripts/indexing/run-indexing.ts',
      `--category=${category}`,
      `--step=${step}`,
      `--concurrency=${concurrency}`,
    ];

    if (skipQuestions) {
      args.push('--skip-questions');
    }

    const child = spawn('npx', args, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`exit code: ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

// ============================================================================
// 유틸리티
// ============================================================================

function parseArgs(): {
  step: 'all' | 'questions' | 'products';
  concurrency: number;
  skipQuestions: boolean;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let step: 'all' | 'questions' | 'products' = 'all';
  let concurrency = 7;
  let skipQuestions = false;
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--step=')) {
      const stepArg = arg.split('=')[1] as 'all' | 'questions' | 'products';
      if (['all', 'questions', 'products'].includes(stepArg)) {
        step = stepArg;
      }
    } else if (arg.startsWith('--concurrency=')) {
      concurrency = parseInt(arg.split('=')[1]) || 7;
    } else if (arg === '--skip-questions') {
      skipQuestions = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return { step, concurrency, skipQuestions, dryRun };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 실행
main().catch(console.error);
