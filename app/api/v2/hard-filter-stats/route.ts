// 하드필터 인기 옵션 통계 API (공개 - 비밀번호 불필요)
import { NextRequest, NextResponse } from 'next/server';
import { supabase, isSupabaseAvailable } from '@/lib/supabase/client';

interface HardFilterOptionStats {
  questionId: string;
  value: string;
  label: string;
  count: number;
  percentage: number; // 해당 질문 내 선택 비율 (%)
  isPopular: boolean; // 질문별 상위 3개
}

interface CategoryHardFilterStats {
  category: string;
  options: HardFilterOptionStats[];
  lastUpdated: string;
}

// 서버 메모리 캐시 (1시간 TTL)
interface CacheEntry {
  data: CategoryHardFilterStats;
  timestamp: number;
}
const statsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 60 * 60 * 1000; // 1시간

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'all';

    // 캐시 확인
    const cacheKey = `hard-filter-stats:${category}`;
    const cached = statsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`[HardFilterStats] Cache hit for ${category}`);
      return NextResponse.json(cached.data);
    }

    if (!isSupabaseAvailable() || !supabase) {
      return NextResponse.json({
        category,
        options: [],
        lastUpdated: new Date().toISOString()
      });
    }

    // 14일 전 날짜 계산
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);
    const startDateStr = startDate.toISOString();

    // DB 레벨에서 event_type 필터링 (v2_hard_filter_answer만 조회)
    console.log(`[HardFilterStats] Fetching from DB with event_type filter...`);
    const { data: rows, error } = await supabase
      .from('event_logs')
      .select('event_data')
      .eq('event_type', 'v2_hard_filter_answer')
      .gte('timestamp', startDateStr)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('[HardFilterStats] DB error:', error);
      throw error;
    }

    console.log(`[HardFilterStats] Fetched ${rows?.length || 0} events`);

    if (!rows || rows.length === 0) {
      const emptyResult: CategoryHardFilterStats = {
        category,
        options: [],
        lastUpdated: new Date().toISOString()
      };
      statsCache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
      return NextResponse.json(emptyResult);
    }

    // 하드필터 선택 집계: questionId -> value -> { label, count }
    const optionCounts: Map<string, Map<string, { label: string; count: number }>> = new Map();

    rows.forEach((row) => {
      const eventData = row.event_data as any;
      if (!eventData?.v2FlowData?.hardFilter) return;

      const { hardFilter } = eventData.v2FlowData;
      const eventCategory = eventData.v2FlowData.category;

      // 카테고리 필터링 (특정 카테고리만 또는 전체)
      if (category !== 'all' && eventCategory !== category) {
        return;
      }

      const { questionId, selectedValues, selectedLabels } = hardFilter;

      if (!questionId || !selectedValues) return;

      if (!optionCounts.has(questionId)) {
        optionCounts.set(questionId, new Map());
      }

      const questionStats = optionCounts.get(questionId)!;

      selectedValues.forEach((value: string, index: number) => {
        // skip 옵션 제외 (상관없어요 등)
        if (value.toLowerCase() === 'skip' || value.includes('상관없')) {
          return;
        }

        const label = selectedLabels?.[index] || value;
        const existing = questionStats.get(value) || { label, count: 0 };
        existing.count++;
        questionStats.set(value, existing);
      });
    });

    // 결과 배열 생성
    const allOptions: HardFilterOptionStats[] = [];

    // 질문별로 상위 2개를 인기로 표시 + 선택 비율 계산
    optionCounts.forEach((valueMap, questionId) => {
      // 해당 질문의 전체 선택 횟수 계산
      const totalSelectionsForQuestion = Array.from(valueMap.values())
        .reduce((sum, { count }) => sum + count, 0);

      // 해당 질문의 옵션들을 count 순으로 정렬
      const sortedOptions = Array.from(valueMap.entries())
        .map(([value, { label, count }]) => ({
          questionId,
          value,
          label,
          count,
          percentage: totalSelectionsForQuestion > 0
            ? Math.round((count / totalSelectionsForQuestion) * 100)
            : 0,
          isPopular: false
        }))
        .sort((a, b) => b.count - a.count);

      // 상위 3개만 인기로 표시
      sortedOptions.forEach((opt, index) => {
        opt.isPopular = index < 3;
        allOptions.push(opt);
      });
    });

    const result: CategoryHardFilterStats = {
      category,
      options: allOptions,
      lastUpdated: new Date().toISOString()
    };

    // 캐시 저장
    statsCache.set(cacheKey, { data: result, timestamp: Date.now() });
    console.log(`[HardFilterStats] Cached result for ${category} (${allOptions.length} options)`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('Hard filter stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hard filter statistics' },
      { status: 500 }
    );
  }
}
