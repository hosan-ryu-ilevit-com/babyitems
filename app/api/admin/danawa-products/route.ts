/**
 * 다나와 제품 목록 조회 API (Admin용)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const groupId = searchParams.get('group'); // 그룹 ID (stroller, car_seat 등)
  const categoryCode = searchParams.get('category'); // 상세 카테고리 코드
  const onlyUnmapped = searchParams.get('unmapped') === 'true';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  try {
    const supabase = getSupabaseClient();
    let query = supabase
      .from('danawa_products')
      .select(`
        pcode,
        title,
        brand,
        price,
        thumbnail,
        category_code,
        coupang_pcode,
        danawa_categories!inner(category_name, group_id)
      `, { count: 'exact' });

    // 필터링 - 상세 카테고리 우선, 없으면 그룹
    if (categoryCode) {
      query = query.eq('category_code', categoryCode);
    } else if (groupId) {
      query = query.eq('danawa_categories.group_id', groupId);
    }

    if (onlyUnmapped) {
      query = query.is('coupang_pcode', null);
    }

    // 정렬 및 페이징
    query = query
      .order('rank', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      products: data || [],
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
