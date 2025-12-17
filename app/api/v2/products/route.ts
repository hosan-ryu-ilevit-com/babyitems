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
import { getDataSource, ENURI_CATEGORY_CODES } from '@/lib/dataSourceConfig';

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

    // 데이터 소스 확인 (다나와, 에누리, 또는 둘 다)
    const dataSource = getDataSource(categoryKey);
    
    let products: Array<Record<string, unknown>> | null = null;
    let error: Error | null = null;

    // Helper: 에누리 데이터 조회
    async function fetchEnuriProducts() {
      const enuriCategoryCode = ENURI_CATEGORY_CODES[categoryKey];
      
      let query = supabase
        .from('enuri_products')
        .select('model_no, title, brand, price, rank, thumbnail, spec, category_code, filter_attrs, review_count, average_rating')
        .eq('category_code', enuriCategoryCode)
        .gt('review_count', 0)
        .order('review_count', { ascending: false })
        .limit(limit);

      if (priceMin !== undefined) query = query.gte('price', priceMin);
      if (priceMax !== undefined) query = query.lte('price', priceMax);
      if (brands && brands.length > 0) query = query.in('brand', brands);

      const result = await query;
      if (result.error) return { data: null, error: result.error };

      // 에누리 형식 → 공통 형식 변환
      let enuriProducts = (result.data || []).map(p => ({
        pcode: p.model_no,
        title: p.title,
        brand: p.brand,
        price: p.price,
        rank: p.rank,
        thumbnail: p.thumbnail,
        spec: p.spec,
        category_code: p.category_code,
        filter_attrs: p.filter_attrs,
        review_count: p.review_count,
        average_rating: p.average_rating,
        dataSource: 'enuri' as const,
      }));

      // 에누리 최저가 조회
      if (enuriProducts.length > 0) {
        const modelNos = enuriProducts.map(p => p.pcode);
        const { data: pricesData } = await supabase
          .from('enuri_prices')
          .select('model_no, lowest_price')
          .in('model_no', modelNos);

        if (pricesData && pricesData.length > 0) {
          const priceMap = new Map(pricesData.map(p => [p.model_no, p.lowest_price]));
          enuriProducts = enuriProducts.map(product => ({
            ...product,
            lowestPrice: priceMap.get(product.pcode) || null,
          }));
        } else {
          enuriProducts = enuriProducts.map(product => ({ ...product, lowestPrice: null }));
        }
      }

      return { data: enuriProducts, error: null };
    }

    // Helper: 다나와 데이터 조회
    async function fetchDanawaProducts() {
      let query = supabase
        .from('danawa_products')
        .select('pcode, title, brand, price, rank, thumbnail, spec, category_code, filter_attrs, review_count, average_rating')
        .in('category_code', targetCategories)
        .gt('review_count', 0)
        .order('rank', { ascending: true, nullsFirst: false })
        .limit(limit);

      if (priceMin !== undefined) query = query.gte('price', priceMin);
      if (priceMax !== undefined) query = query.lte('price', priceMax);
      if (brands && brands.length > 0) query = query.in('brand', brands);

      const result = await query;
      if (result.error) return { data: null, error: result.error };

      let danawaProducts = (result.data || []).map(p => ({
        ...p,
        dataSource: 'danawa' as const,
        lowestPrice: null as number | null,
      }));

      // 다나와 최저가 조회
      if (danawaProducts.length > 0) {
        const pcodes = danawaProducts.map(p => p.pcode);
        const { data: pricesData } = await supabase
          .from('danawa_prices')
          .select('pcode, lowest_price')
          .in('pcode', pcodes);

        if (pricesData && pricesData.length > 0) {
          const priceMap = new Map(pricesData.map(p => [p.pcode, p.lowest_price]));
          danawaProducts = danawaProducts.map(product => ({
            ...product,
            lowestPrice: priceMap.get(product.pcode) || null,
          }));
        }
      }

      return { data: danawaProducts, error: null };
    }

    // 데이터 소스별 조회
    if (dataSource === 'both') {
      // ===== 다나와 + 에누리 합산 =====
      const [danawaResult, enuriResult] = await Promise.all([
        fetchDanawaProducts(),
        fetchEnuriProducts(),
      ]);

      if (danawaResult.error) {
        console.error('[v2/products] Danawa error:', danawaResult.error);
      }
      if (enuriResult.error) {
        console.error('[v2/products] Enuri error:', enuriResult.error);
      }

      const danawaProducts = danawaResult.data || [];
      const enuriProducts = enuriResult.data || [];

      // 다나와 pcode Set (중복 제거용)
      const danawaPcodeSet = new Set(danawaProducts.map(p => p.pcode));

      // 에누리에서 다나와와 중복되지 않는 제품만 추가
      const uniqueEnuriProducts = enuriProducts.filter(p => !danawaPcodeSet.has(p.pcode));

      // 합산 (다나와 먼저, 에누리 추가)
      products = [...danawaProducts, ...uniqueEnuriProducts];

      console.log(`[v2/products] Category: ${categoryKey} (BOTH), Danawa: ${danawaProducts.length}, Enuri: ${uniqueEnuriProducts.length}, Total: ${products.length}`);

    } else if (dataSource === 'enuri') {
      // ===== 에누리만 =====
      const result = await fetchEnuriProducts();
      error = result.error as Error | null;
      products = result.data;
      console.log(`[v2/products] Category: ${categoryKey} (ENURI), Products: ${products?.length || 0}`);

    } else {
      // ===== 다나와만 (기본) =====
      const result = await fetchDanawaProducts();
      error = result.error as Error | null;
      products = result.data;
      console.log(`[v2/products] Category: ${categoryKey} (DANAWA), Products: ${products?.length || 0}`);
    }

    if (error) {
      console.error('Supabase query error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
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
