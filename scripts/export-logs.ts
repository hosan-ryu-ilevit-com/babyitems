// Supabase 데이터를 점진적으로 추출하는 스크립트
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface DailyLog {
  id: number;
  date: string;
  events: any[];
  created_at?: string;
}

async function exportLogs() {
  console.log('🚀 Starting log export...');

  const BATCH_SIZE = 10; // 한 번에 10개씩만 가져오기
  const OUTPUT_DIR = path.join(__dirname, '../data/backup');

  // 백업 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  try {
    // 1. 전체 날짜 목록 가져오기 (가벼운 쿼리)
    console.log('📅 Fetching all dates...');
    const { data: dates, error: datesError } = await supabase
      .from('daily_logs')
      .select('date')
      .order('date', { ascending: false });

    if (datesError) {
      console.error('❌ Failed to fetch dates:', datesError);
      return;
    }

    console.log(`✅ Found ${dates?.length || 0} dates`);

    if (!dates || dates.length === 0) {
      console.log('No data to export');
      return;
    }

    // 2. 날짜별로 데이터 추출 (하나씩)
    const allLogs: DailyLog[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i].date;
      console.log(`\n📦 [${i + 1}/${dates.length}] Fetching logs for ${date}...`);

      try {
        const { data: log, error: logError } = await supabase
          .from('daily_logs')
          .select('*')
          .eq('date', date)
          .single();

        if (logError) {
          console.error(`  ❌ Failed: ${logError.message}`);
          errorCount++;

          // 개별 파일로 에러 로그 저장
          fs.writeFileSync(
            path.join(OUTPUT_DIR, `error_${date}.json`),
            JSON.stringify({ date, error: logError }, null, 2)
          );

          continue;
        }

        if (log) {
          allLogs.push(log);
          successCount++;

          // 개별 파일로도 저장 (안전)
          fs.writeFileSync(
            path.join(OUTPUT_DIR, `log_${date}.json`),
            JSON.stringify(log, null, 2)
          );

          console.log(`  ✅ Success: ${log.events?.length || 0} events`);
        }

        // API 레이트 리밋 방지 (1초 대기)
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`  ❌ Unexpected error:`, error);
        errorCount++;
      }
    }

    // 3. 전체 데이터를 하나의 파일로 저장
    const outputFile = path.join(OUTPUT_DIR, 'all_logs.json');
    fs.writeFileSync(outputFile, JSON.stringify(allLogs, null, 2));

    console.log('\n✅ Export completed!');
    console.log(`  📁 Output directory: ${OUTPUT_DIR}`);
    console.log(`  ✅ Success: ${successCount} dates`);
    console.log(`  ❌ Failed: ${errorCount} dates`);
    console.log(`  📄 Total file: ${outputFile}`);
    console.log(`  📄 Individual files: ${successCount} files`);

    // 통계 출력
    const totalEvents = allLogs.reduce((sum, log) => sum + (log.events?.length || 0), 0);
    console.log(`\n📊 Statistics:`);
    console.log(`  Total dates: ${allLogs.length}`);
    console.log(`  Total events: ${totalEvents}`);

    return allLogs;
  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  }
}

// 실행
exportLogs()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed:', error);
    process.exit(1);
  });
