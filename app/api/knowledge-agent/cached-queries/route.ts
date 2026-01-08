/**
 * Knowledge Agent - 캐시된 쿼리 목록 조회 API
 *
 * Supabase knowledge_products_cache 테이블에서 캐시된 쿼리(카테고리) 목록 반환
 */

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // 캐시된 쿼리 목록 조회 (distinct query)
    const { data, error } = await supabase
      .from('knowledge_products_cache')
      .select('query')
      .order('crawled_at', { ascending: false });

    if (error) {
      console.error('[CachedQueries] Error:', error.message);
      return NextResponse.json({ success: false, queries: [], error: error.message });
    }

    // 중복 제거
    const queries = [...new Set((data || []).map(row => row.query))];

    return NextResponse.json({
      success: true,
      queries,
      count: queries.length,
    });
  } catch (error) {
    console.error('[CachedQueries] Error:', error);
    return NextResponse.json({
      success: false,
      queries: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
