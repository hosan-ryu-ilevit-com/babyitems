/**
 * v2 다나와 필터 조회 API
 * GET /api/v2/filters/[categoryCode]
 * 
 * 해당 카테고리의 다나와 필터 옵션들을 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DanawaFilter {
  id: number;
  category_code: string;
  filter_name: string;
  options: string[];
  option_count: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ categoryCode: string }> }
) {
  try {
    const { categoryCode } = await params;

    // DB에서 필터 조회
    const { data: filters, error } = await supabase
      .from('danawa_filters')
      .select('*')
      .eq('category_code', categoryCode)
      .order('filter_name');

    if (error) {
      console.error('Filters fetch error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        categoryCode,
        filters: filters as DanawaFilter[],
        count: filters?.length || 0,
      },
    });
  } catch (error) {
    console.error('Filters API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch filters' },
      { status: 500 }
    );
  }
}
