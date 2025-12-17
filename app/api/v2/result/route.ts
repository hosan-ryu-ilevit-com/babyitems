import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * V2 결과 페이지용 Supabase 데이터 조회 API
 * - 다나와 가격 정보 (danawa_prices)
 * - 에누리 가격 정보 (enuri_prices) - 다나와에 없는 경우
 * - 제품 스펙/리뷰 정보 (danawa_products, enuri_products)
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

    // 병렬로 다나와 + 에누리 데이터 조회
    const [
      danawaPricesResult, 
      danawaSpecsResult,
      enuriPricesResult,
      enuriSpecsResult,
    ] = await Promise.all([
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

      // 3. 에누리 가격 정보 (model_no = pcode)
      supabase
        .from('enuri_prices')
        .select('model_no, lowest_price, lowest_mall, lowest_link, mall_prices')
        .in('model_no', pcodes),

      // 4. 에누리 제품 스펙 + 리뷰 정보
      supabase
        .from('enuri_products')
        .select('model_no, spec, filter_attrs, review_count, average_rating')
        .in('model_no', pcodes),
    ]);

    if (danawaPricesResult.error) {
      console.error('❌ Danawa price fetch error:', danawaPricesResult.error);
    }
    if (danawaSpecsResult.error) {
      console.error('❌ Danawa specs fetch error:', danawaSpecsResult.error);
    }

    // 다나와 데이터
    const danawaPrices = danawaPricesResult.data || [];
    const danawaSpecs = danawaSpecsResult.data || [];
    
    // 에누리 데이터 (pcode 형식으로 변환 + mall_prices 형식 통일)
    const enuriPrices = (enuriPricesResult.data || []).map(p => {
      // 에누리 mall_prices를 다나와 형식으로 변환
      const convertedMallPrices = (p.mall_prices || []).map((mp: {
        mallName?: string;
        mallLogo?: string;
        price?: number;
        deliveryFee?: number;
        productUrl?: string;
      }) => ({
        mall: mp.mallName || '알 수 없음',
        price: mp.price || 0,
        delivery: mp.deliveryFee === 0 ? '(무료배송)' : `(${(mp.deliveryFee || 0).toLocaleString()}원)`,
        link: mp.productUrl || '',
        mallLogo: mp.mallLogo,  // 에누리는 로고 URL 있음
      }));

      return {
        pcode: p.model_no,
        lowest_price: p.lowest_price,
        lowest_mall: p.lowest_mall,
        lowest_link: p.lowest_link,
        mall_prices: convertedMallPrices,
      };
    });
    
    const enuriSpecs = (enuriSpecsResult.data || []).map(p => ({
      pcode: p.model_no,
      spec: p.spec,
      filter_attrs: p.filter_attrs,
      review_count: p.review_count,
      average_rating: p.average_rating,
    }));

    // 다나와 우선, 에누리 보충 (중복 제거)
    const danawaPcodeSet = new Set(danawaPrices.map(p => p.pcode));
    const danawaSpecPcodeSet = new Set(danawaSpecs.map(p => p.pcode));
    
    const prices = [
      ...danawaPrices,
      ...enuriPrices.filter(p => !danawaPcodeSet.has(p.pcode)),
    ];
    
    const specs = [
      ...danawaSpecs,
      ...enuriSpecs.filter(p => !danawaSpecPcodeSet.has(p.pcode)),
    ];

    console.log(`✅ [V2 Result API] Fetched ${prices.length} prices (danawa: ${danawaPrices.length}, enuri: ${enuriPrices.length}), ${specs.length} specs`);

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
