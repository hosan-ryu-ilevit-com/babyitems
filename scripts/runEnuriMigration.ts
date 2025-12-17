/**
 * 에누리 테이블 마이그레이션 실행 스크립트
 * Supabase REST API를 통해 SQL 실행
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║        에누리 테이블 마이그레이션 실행                    ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const migrationPath = path.join(__dirname, '../supabase/migrations/20241216_enuri_tables.sql');

  if (!fs.existsSync(migrationPath)) {
    console.error(`마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf-8');

  // SQL을 개별 명령어로 분리 (세미콜론 기준, 주석 제외)
  const statements = sql
    .split(/;[\s]*\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && !s.startsWith('/*'));

  console.log(`📄 ${statements.length}개의 SQL 명령어 발견\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt || stmt.length < 10) continue;

    // 명령어 유형 추출
    const firstLine = stmt.split('\n')[0].trim();
    const cmdType = firstLine.slice(0, 50);

    process.stdout.write(`[${i + 1}/${statements.length}] ${cmdType}... `);

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });

      if (error) {
        // RPC가 없으면 직접 실행 시도 (일부 명령어만 가능)
        if (error.message.includes('function') || error.message.includes('rpc')) {
          console.log('⚠️ RPC 없음 - Dashboard에서 실행 필요');
          errorCount++;
        } else {
          console.log(`❌ ${error.message.slice(0, 50)}`);
          errorCount++;
        }
      } else {
        console.log('✓');
        successCount++;
      }
    } catch (e) {
      console.log(`❌ ${e instanceof Error ? e.message.slice(0, 50) : 'Unknown error'}`);
      errorCount++;
    }
  }

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`완료: ${successCount} 성공, ${errorCount} 실패`);

  if (errorCount > 0) {
    console.log(`\n⚠️ 일부 명령어 실패. Supabase Dashboard SQL Editor에서 직접 실행하세요:`);
    console.log(`   ${migrationPath}\n`);
    console.log(`Dashboard URL: ${supabaseUrl.replace('.co', '.co/project/jpygsdcnqgfctsjucqzn/sql')}`);
  }
}

// 대안: SQL 파일 내용 출력
async function printSql() {
  const migrationPath = path.join(__dirname, '../supabase/migrations/20241216_enuri_tables.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  console.log('\n=== SQL 내용 (Dashboard에 복사하여 실행) ===\n');
  console.log(sql);
}

// 테이블 존재 여부 확인
async function checkTables() {
  console.log('📋 테이블 존재 여부 확인...\n');

  const tables = [
    'enuri_categories',
    'enuri_products',
    'enuri_reviews',
    'enuri_prices',
    'product_mappings'
  ];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`   ❌ ${table}: 없음 (${error.message.slice(0, 30)})`);
    } else {
      console.log(`   ✓ ${table}: 존재 (${count || 0}개 행)`);
    }
  }
}

// 메인
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--check')) {
    await checkTables();
  } else if (args.includes('--print')) {
    await printSql();
  } else {
    // 먼저 테이블 확인
    await checkTables();

    console.log('\n' + '─'.repeat(50));
    console.log('\n⚠️ Supabase REST API로는 DDL(CREATE TABLE) 실행이 제한됩니다.');
    console.log('   아래 방법 중 하나로 마이그레이션을 실행하세요:\n');
    console.log('1. Supabase Dashboard SQL Editor:');
    console.log(`   https://supabase.com/dashboard/project/jpygsdcnqgfctsjucqzn/sql/new\n`);
    console.log('2. SQL 파일 위치:');
    console.log('   supabase/migrations/20241216_enuri_tables.sql\n');
    console.log('3. --print 옵션으로 SQL 내용 출력:');
    console.log('   npx tsx scripts/runEnuriMigration.ts --print\n');
  }
}

main().catch(console.error);
