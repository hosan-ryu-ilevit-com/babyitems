import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * V2 결과 페이지용 Supabase 데이터 조회 API
 * - 다나와 가격 정보 (danawa_prices)
 * - 제품 스펙/리뷰 정보 (danawa_products)
 */
export async function POST(req: NextRequest) {
  try {
    const { pcodes } = await req.json();

    if (!pcodes || !Array.isArray(pcodes) || pcodes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'pcodes array is required' },
        { status: 400 }
      );
    }

    console.log(`📊 [V2 Result API] Fetching data for ${pcodes.length} products`);

    // 병렬로 다나와 데이터 조회
    const [danawaPricesResult, danawaSpecsResult] = await Promise.all([
      // 1. 다나와 가격 정보
      supabase
        .from('danawa_prices')
        .select('pcode, lowest_price, lowest_mall, lowest_link, mall_prices')
        .in('pcode', pcodes),

      // 2. 다나와 제품 스펙 + 리뷰 정보
      supabase
        .from('danawa_products')
        .select('pcode, spec, filter_attrs, review_count, average_rating')
        .in('pcode', pcodes),
    ]);

    if (danawaPricesResult.error) {
      console.error('❌ Danawa price fetch error:', danawaPricesResult.error);
    }
    if (danawaSpecsResult.error) {
      console.error('❌ Danawa specs fetch error:', danawaSpecsResult.error);
    }

    const prices = danawaPricesResult.data || [];
    const specs = danawaSpecsResult.data || [];

    console.log(`✅ [V2 Result API] Fetched ${prices.length} prices, ${specs.length} specs`);

    return NextResponse.json({
      success: true,
      data: {
        prices,
        specs,
      },
    });
  } catch (error) {
    console.error('V2 Result API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
