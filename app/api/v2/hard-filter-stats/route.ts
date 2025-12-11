// 하드필터 인기 옵션 통계 API (공개 - 비밀번호 불필요)
import { NextRequest, NextResponse } from 'next/server';
import { getRecentEvents } from '@/lib/logging/query';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    // 최근 30일 이벤트 가져오기 (어드민 stats와 같은 데이터 소스)
    const events = await getRecentEvents(30);

    if (!events || events.length === 0) {
      return NextResponse.json({
        category: category || 'all',
        options: [],
        lastUpdated: new Date().toISOString()
      });
    }

    // 하드필터 선택 집계: questionId -> value -> { label, count }
    const optionCounts: Map<string, Map<string, { label: string; count: number }>> = new Map();

    events.forEach((event) => {
      // v2_hard_filter_answer 이벤트에서 통계 수집
      if (
        event.eventType === 'v2_hard_filter_answer' &&
        event.v2FlowData?.hardFilter
      ) {
        const { hardFilter } = event.v2FlowData;
        const eventCategory = event.v2FlowData.category;

        // 카테고리 필터링 (특정 카테고리만 또는 전체)
        if (category && eventCategory !== category) {
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
      }
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

    return NextResponse.json({
      category: category || 'all',
      options: allOptions,
      lastUpdated: new Date().toISOString()
    } as CategoryHardFilterStats);

  } catch (error) {
    console.error('Hard filter stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch hard filter statistics' },
      { status: 500 }
    );
  }
}
