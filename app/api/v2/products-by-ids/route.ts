/**
 * v2 상품 ID별 조회 API - 찜한 상품 조회용
 * POST /api/v2/products-by-ids
 *
 * 요청:
 * - pcodes: pcode 배열
 *
 * 응답:
 * - products: 제품 정보 배열 (다나와 가격 정보 포함)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface ProductsByIdsRequest {
  pcodes: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body: ProductsByIdsRequest = await request.json();
    const { pcodes } = body;

    if (!pcodes || pcodes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'pcodes is required' },
        { status: 400 }
      );
    }

    // 병렬로 제품 정보와 다나와 가격 정보 조회
    const [productsResult, pricesResult] = await Promise.all([
      // 1. 제품 기본 정보
      supabase
        .from('danawa_products')
        .select('pcode, title, brand, price, thumbnail, category_code, review_count, average_rating')
        .in('pcode', pcodes),

      // 2. 다나와 가격 정보
      supabase
        .from('danawa_prices')
        .select('pcode, lowest_price, lowest_mall, lowest_link, mall_prices')
        .in('pcode', pcodes),
    ]);

    if (productsResult.error) {
      console.error('Supabase products query error:', productsResult.error);
      return NextResponse.json(
        { success: false, error: productsResult.error.message },
        { status: 500 }
      );
    }

    // 가격 정보를 pcode로 매핑
    const pricesMap = new Map<string, {
      lowest_price: number;
      lowest_mall: string;
      lowest_link: string;
      mall_prices: Array<{ mall: string; price: number; delivery: string; link?: string }>;
    }>();

    if (pricesResult.data) {
      pricesResult.data.forEach((price) => {
        pricesMap.set(price.pcode, {
          lowest_price: price.lowest_price,
          lowest_mall: price.lowest_mall,
          lowest_link: price.lowest_link,
          mall_prices: price.mall_prices || [],
        });
      });
    }

    // 제품 정보에 가격 정보 병합
    const productsWithPrices = (productsResult.data || []).map((product) => {
      const priceInfo = pricesMap.get(product.pcode);
      return {
        ...product,
        danawa_price: priceInfo || null,
      };
    });

    return NextResponse.json({
      success: true,
      products: productsWithPrices,
      count: productsWithPrices.length,
    });
  } catch (error) {
    console.error('Products by IDs API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}
