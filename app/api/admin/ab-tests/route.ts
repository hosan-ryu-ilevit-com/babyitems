/**
 * A/B 테스트 결과 조회 API
 * GET /api/admin/ab-tests
 * GET /api/admin/ab-tests?testName=ai-helper-label-test
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const testName = searchParams.get('testName');

  try {
    const supabase = await createClient();

    if (testName) {
      // 특정 테스트의 상세 결과
      const { data, error } = await supabase
        .from('ab_tests')
        .select('*')
        .eq('test_name', testName)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 통계 계산
      const stats = calculateStats(data || []);

      return NextResponse.json({
        testName,
        stats,
        rawData: data
      });
    } else {
      // 모든 테스트 요약
      const { data, error } = await supabase
        .from('ab_tests')
        .select('test_name, variant, converted, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // 테스트별로 그룹화
      const grouped = groupByTest(data || []);

      return NextResponse.json({
        tests: grouped
      });
    }
  } catch (error) {
    console.error('Failed to fetch AB test results:', error);
    return NextResponse.json(
      { error: 'Failed to fetch results' },
      { status: 500 }
    );
  }
}

interface ABTestRecord {
  test_name: string;
  variant: string;
  converted: boolean;
  created_at: string;
}

function calculateStats(records: ABTestRecord[]) {
  const variantStats: Record<string, {
    variant: string;
    total: number;
    conversions: number;
    conversionRate: number;
  }> = {};

  records.forEach(record => {
    if (!variantStats[record.variant]) {
      variantStats[record.variant] = {
        variant: record.variant,
        total: 0,
        conversions: 0,
        conversionRate: 0
      };
    }

    variantStats[record.variant].total++;
    if (record.converted) {
      variantStats[record.variant].conversions++;
    }
  });

  // 전환율 계산
  Object.values(variantStats).forEach(stats => {
    stats.conversionRate = stats.total > 0
      ? (stats.conversions / stats.total) * 100
      : 0;
  });

  return {
    variants: Object.values(variantStats),
    totalSessions: records.length,
    totalConversions: records.filter(r => r.converted).length
  };
}

function groupByTest(records: ABTestRecord[]) {
  const grouped: Record<string, {
    testName: string;
    totalSessions: number;
    variants: string[];
    lastUpdated: string;
  }> = {};

  records.forEach(record => {
    if (!grouped[record.test_name]) {
      grouped[record.test_name] = {
        testName: record.test_name,
        totalSessions: 0,
        variants: [],
        lastUpdated: record.created_at
      };
    }

    grouped[record.test_name].totalSessions++;
    if (!grouped[record.test_name].variants.includes(record.variant)) {
      grouped[record.test_name].variants.push(record.variant);
    }
  });

  return Object.values(grouped);
}
