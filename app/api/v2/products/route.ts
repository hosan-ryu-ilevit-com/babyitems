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

/**
 * 제품명 정규화 (브랜드 + 핵심 모델명만 추출)
 * 예: "베이비브레짜 포뮬러 프로 어드밴스드 분유제조기" → "베이비브레짜 포뮬러 프로 어드밴스드"
 */
function normalizeProductTitle(title: string): string {
  return title
    // 카테고리 명칭 제거
    .replace(/\s*(분유제조기|분유포트|유모차|카시트|젖병|체온계|코흡입기|베이비모니터)\s*/gi, ' ')
    // 용량/색상 등 옵션 제거
    .replace(/\s*\d+(\.\d+)?\s*(ml|l|리터|㎖|ℓ)\s*/gi, ' ')
    .replace(/\s*(화이트|블랙|핑크|그레이|아이보리|베이지|블루|레드|그린)\s*/gi, ' ')
    // 특수문자 정리
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣-]/g, ' ')
    // 연속 공백 정리
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * 두 제품의 spec 병합 (에누리 spec이 더 풍부하면 우선 사용)
 */
function mergeSpecs(
  danawaSpec: Record<string, unknown> | null,
  enuriSpec: Record<string, unknown> | null
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  
  // 다나와 spec 먼저 추가
  if (danawaSpec) {
    Object.entries(danawaSpec).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '' && v !== '-') {
        merged[k] = v;
      }
    });
  }
  
  // 에누리 spec 병합 (다나와에 없는 키만 추가)
  if (enuriSpec) {
    Object.entries(enuriSpec).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '' && v !== '-') {
        // 이미 있는 키는 덮어쓰지 않음 (단, 다나와 값이 비어있으면 덮어씀)
        if (!merged[k] || merged[k] === '' || merged[k] === '-') {
          merged[k] = v;
        }
      }
    });
  }
  
  return merged;
}

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

    // 데이터 소스 확인
    const dataSource = getDataSource(categoryKey);
    let products: Array<Record<string, unknown>> | null = null;

    // Helper: 에누리 데이터 조회
    async function fetchEnuriProducts() {
      const enuriCategoryCode = ENURI_CATEGORY_CODES[categoryKey];
      if (!enuriCategoryCode) return [];
      
      let enuriQuery = supabase
        .from('enuri_products')
        .select('model_no, title, brand, price, rank, thumbnail, spec, category_code, filter_attrs, review_count, average_rating')
        .eq('category_code', enuriCategoryCode)
        .gt('review_count', 0)
        .order('review_count', { ascending: false })
        .limit(limit);

      if (priceMin !== undefined) enuriQuery = enuriQuery.gte('price', priceMin);
      if (priceMax !== undefined) enuriQuery = enuriQuery.lte('price', priceMax);
      if (brands && brands.length > 0) enuriQuery = enuriQuery.in('brand', brands);

      const enuriResult = await enuriQuery;
      if (enuriResult.error) {
        console.error('[v2/products] Enuri error:', enuriResult.error);
        return [];
      }

      let enuriProducts = (enuriResult.data || []).map(p => ({
        pcode: p.model_no,
        title: p.title,
        brand: p.brand,
        price: p.price,
        rank: p.rank,
        thumbnail: p.thumbnail,
        spec: p.spec,
        category_code: p.category_code,
        filter_attrs: p.filter_attrs,
        reviewCount: p.review_count,      // snake_case → camelCase
        averageRating: p.average_rating,  // snake_case → camelCase
        dataSource: 'enuri' as const,
        lowestPrice: null as number | null,
      }));

      // 에누리 최저가 조회
      if (enuriProducts.length > 0) {
        const modelNos = enuriProducts.map(p => p.pcode);
        const { data: pricesData } = await supabase
          .from('enuri_prices')
          .select('model_no, lowest_price')
          .in('model_no', modelNos);

        const priceMap = new Map(pricesData?.map(p => [p.model_no, p.lowest_price]) || []);
        enuriProducts = enuriProducts.map(product => ({
          ...product,
          lowestPrice: priceMap.get(product.pcode) || product.price || null,
        }));
      }

      return enuriProducts;
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

      const danawaResult = await query;
      if (danawaResult.error) {
        console.error('[v2/products] Danawa error:', danawaResult.error);
        return [];
      }

      let danawaProducts = (danawaResult.data || []).map(p => ({
        pcode: p.pcode,
        title: p.title,
        brand: p.brand,
        price: p.price,
        rank: p.rank,
        thumbnail: p.thumbnail,
        spec: p.spec,
        category_code: p.category_code,
        filter_attrs: p.filter_attrs,
        reviewCount: p.review_count,      // snake_case → camelCase
        averageRating: p.average_rating,  // snake_case → camelCase
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

      return danawaProducts;
    }

    // 데이터 소스별 조회
    if (dataSource === 'both') {
      // ===== 다나와 + 에누리 합산 (spec 병합 포함) =====
      const [danawaProducts, enuriProducts] = await Promise.all([
        fetchDanawaProducts(),
        fetchEnuriProducts(),
      ]);

      // 에누리 제품을 정규화된 title로 매핑 (spec 병합용)
      const enuriByNormalizedTitle = new Map<string, typeof enuriProducts[0]>();
      enuriProducts.forEach(p => {
        const normalizedTitle = normalizeProductTitle(p.title);
        // 같은 정규화 title이면 spec이 더 풍부한 것 선택
        const existing = enuriByNormalizedTitle.get(normalizedTitle);
        if (!existing || Object.keys(p.spec || {}).length > Object.keys(existing.spec || {}).length) {
          enuriByNormalizedTitle.set(normalizedTitle, p);
        }
      });

      // 다나와 제품에 에누리 spec 병합
      let specMergedCount = 0;
      const mergedDanawaProducts = danawaProducts.map(danawaProduct => {
        const normalizedTitle = normalizeProductTitle(danawaProduct.title);
        const matchingEnuri = enuriByNormalizedTitle.get(normalizedTitle);
        
        if (matchingEnuri) {
          const danawaSpecCount = Object.keys(danawaProduct.spec || {}).length;
          const enuriSpecCount = Object.keys(matchingEnuri.spec || {}).length;
          
          // 에누리 spec이 더 풍부하면 병합
          if (enuriSpecCount > danawaSpecCount) {
            specMergedCount++;
            return {
              ...danawaProduct,
              spec: mergeSpecs(
                danawaProduct.spec as Record<string, unknown>,
                matchingEnuri.spec as Record<string, unknown>
              ),
            };
          }
        }
        return danawaProduct;
      });

      // 다나와에 없는 에누리 제품 필터링 (정규화된 title 기준)
      const danawaNormalizedTitles = new Set(
        danawaProducts.map(p => normalizeProductTitle(p.title))
      );
      const uniqueEnuriProducts = enuriProducts.filter(p => 
        !danawaNormalizedTitles.has(normalizeProductTitle(p.title))
      );

      products = [...mergedDanawaProducts, ...uniqueEnuriProducts];
      console.log(`[v2/products] Category: ${categoryKey} (BOTH), Danawa: ${danawaProducts.length}, Enuri unique: ${uniqueEnuriProducts.length}, Spec merged: ${specMergedCount}, Total: ${products.length}`);

    } else if (dataSource === 'enuri') {
      // ===== 에누리만 =====
      products = await fetchEnuriProducts();
      console.log(`[v2/products] Category: ${categoryKey} (ENURI), Products: ${products?.length || 0}`);

    } else {
      // ===== 다나와만 (기본) =====
      products = await fetchDanawaProducts();
      console.log(`[v2/products] Category: ${categoryKey} (DANAWA), Products: ${products?.length || 0}`);
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
        products: products as unknown as ProductItem[],
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
