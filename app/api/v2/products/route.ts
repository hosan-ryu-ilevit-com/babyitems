/**
 * v2 상품 조회 API - 카테고리별 상품 필터링
 * POST /api/v2/products
 * 
 * 요청:
 * - categoryKey: 카테고리 키 (logic_map의 키)
 * - priceMin?: 최소 가격
 * - priceMax?: 최대 가격
 * - brands?: 브랜드 필터 (배열)
 * - limit?: 조회 개수 (기본 100)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import logicMapData from '@/data/rules/logic_map.json';
import type { CategoryLogicMap } from '@/types/rules';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface ProductsRequest {
  categoryKey: string;
  priceMin?: number;
  priceMax?: number;
  brands?: string[];
  limit?: number;
  targetCategoryCodes?: string[];  // For sub-category specific queries (category_code 필터)
  filterAttribute?: {              // For attribute-based filtering (filter_attrs 필터)
    key: string;
    value: string;
  };
}

export interface ProductItem {
  pcode: string;
  title: string;
  brand: string | null;
  price: number | null;
  lowestPrice: number | null;  // 다나와 최저가 (우선 사용)
  rank: number | null;
  thumbnail: string | null;
  spec: Record<string, unknown>;
  category_code: string;
  filter_attrs?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const body: ProductsRequest = await request.json();
    const { categoryKey, priceMin, priceMax, brands, limit = 100, targetCategoryCodes, filterAttribute } = body;

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    // 1. logic_map에서 target_categories 가져오기
    const logicMap = logicMapData as Record<string, CategoryLogicMap>;
    const categoryLogic = logicMap[categoryKey];

    if (!categoryLogic) {
      return NextResponse.json(
        {
          success: false,
          error: `Category '${categoryKey}' not found`,
          availableCategories: Object.keys(logicMap)
        },
        { status: 404 }
      );
    }

    // Use provided targetCategoryCodes (sub-category) or default from logic_map
    const targetCategories = targetCategoryCodes || categoryLogic.target_categories;

    // 2. Supabase 쿼리 구성
    let query = supabase
      .from('danawa_products')
      .select('pcode, title, brand, price, rank, thumbnail, spec, category_code, filter_attrs')
      .in('category_code', targetCategories)
      .order('rank', { ascending: true, nullsFirst: false })
      .limit(limit);

    // 가격 필터
    if (priceMin !== undefined) {
      query = query.gte('price', priceMin);
    }
    if (priceMax !== undefined) {
      query = query.lte('price', priceMax);
    }

    // 브랜드 필터
    if (brands && brands.length > 0) {
      query = query.in('brand', brands);
    }

    // 3. 쿼리 실행
    let { data: products, error } = await query;

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 4. 다나와 최저가 조회 및 병합
    if (products && products.length > 0) {
      const pcodes = products.map(p => p.pcode);
      const { data: pricesData } = await supabase
        .from('danawa_prices')
        .select('pcode, lowest_price')
        .in('pcode', pcodes);

      if (pricesData && pricesData.length > 0) {
        const priceMap = new Map(pricesData.map(p => [p.pcode, p.lowest_price]));
        products = products.map(product => ({
          ...product,
          lowestPrice: priceMap.get(product.pcode) || null,
        }));
      } else {
        // 최저가 데이터가 없으면 lowestPrice를 null로 설정
        products = products.map(product => ({
          ...product,
          lowestPrice: null,
        }));
      }
    }

    // 5. 속성 필터 (filter_attrs 기반) - Supabase JSONB 필터링 대신 JS에서 필터링
    // (Supabase JSONB 필터링은 복잡하므로 클라이언트 사이드에서 처리)
    if (filterAttribute && products) {
      const { key, value } = filterAttribute;
      products = products.filter(product => {
        const filterAttrs = product.filter_attrs as Record<string, unknown> | null;
        if (!filterAttrs) return false;

        const attrValue = filterAttrs[key];
        if (attrValue === undefined || attrValue === null) return false;

        // 문자열 비교 (대소문자 무시)
        return String(attrValue).toLowerCase() === value.toLowerCase();
      });
    }

    // 6. 응답
    return NextResponse.json({
      success: true,
      data: {
        categoryKey,
        categoryName: categoryLogic.category_name,
        targetCategories,
        products: products as ProductItem[],
        count: products?.length || 0,
        filters: {
          priceMin,
          priceMax,
          brands,
        },
      },
    });
  } catch (error) {
    console.error('Products API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch products' },
      { status: 500 }
    );
  }
}
