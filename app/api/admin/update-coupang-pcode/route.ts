/**
 * 다나와 제품에 쿠팡 Product ID + 리뷰 정보 업데이트 API
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase environment variables are not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { pcode, coupang_pcode, average_rating, review_count, coupang_thumbnail } = body;

    if (!pcode) {
      return NextResponse.json({ error: 'pcode is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      coupang_pcode: coupang_pcode || null,
      updated_at: new Date().toISOString(),
    };

    // 리뷰 정보도 함께 업데이트
    if (average_rating !== undefined) {
      updateData.average_rating = average_rating;
    }
    if (review_count !== undefined) {
      updateData.review_count = review_count;
    }
    // 쿠팡 썸네일 저장
    if (coupang_thumbnail !== undefined) {
      updateData.coupang_thumbnail = coupang_thumbnail;
    }

    const { data, error } = await supabase
      .from('danawa_products')
      .update(updateData)
      .eq('pcode', pcode)
      .select()
      .single();

    if (error) {
      console.error('Update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      data,
      message: coupang_pcode 
        ? `쿠팡 ID ${coupang_pcode} 연결 완료 (별점: ${average_rating}, 리뷰: ${review_count})` 
        : '쿠팡 ID 연결 해제됨'
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
