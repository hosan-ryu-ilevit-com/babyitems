/**
 * v2 기준제품 조회 API - Supabase danawa_products에서 조회
 * GET /api/v2/anchor-products?categoryKey=xxx&limit=50&search=keyword
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import logicMapData from '@/data/rules/logic_map.json';
import type { CategoryLogicMap } from '@/types/rules';
import { getDataSource, ENURI_CATEGORY_CODES } from '@/lib/dataSourceConfig';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryKey = searchParams.get('categoryKey');
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    const searchKeyword = searchParams.get('search')?.toLowerCase() || '';

    if (!categoryKey) {
      return NextResponse.json(
        { success: false, error: 'categoryKey is required' },
        { status: 400 }
      );
    }

    // logic_map에서 카테고리 정보 가져오기
    const logicMap = logicMapData as Record<string, CategoryLogicMap>;
    const categoryLogic = logicMap[categoryKey];

    if (!categoryLogic) {
      return NextResponse.json(
        { success: false, error: `Category '${categoryKey}' not found` },
        { status: 404 }
      );
    }

    const targetCategories = categoryLogic.target_categories;
    const dataSource = getDataSource(categoryKey);

    console.log(`🔍 [v2/anchor-products] Loading for: ${categoryKey} (${dataSource}), limit: ${limit}, search: "${searchKeyword}"`);

    let products: Array<Record<string, unknown>> | null = null;
    let error: { message: string } | null = null;

    // Helper: 에누리 조회
    async function fetchEnuri() {
      const enuriCategoryCode = ENURI_CATEGORY_CODES[categoryKey];
      const result = await supabase
        .from('enuri_products')
        .select('model_no, title, brand, price, rank, thumbnail, spec, category_code, review_count, average_rating')
        .eq('category_code', enuriCategoryCode)
        .gt('review_count', 0)
        .order('review_count', { ascending: false })
        .limit(limit);

      if (result.error) return { data: null, error: result.error };

      return {
        data: (result.data || []).map(p => ({
          pcode: p.model_no,
          title: p.title,
          brand: p.brand,
          price: p.price,
          rank: p.rank,
          thumbnail: p.thumbnail,
          spec: p.spec,
          category_code: p.category_code,
          review_count: p.review_count,
          average_rating: p.average_rating,
          dataSource: 'enuri' as const,
        })),
        error: null,
      };
    }

    // Helper: 다나와 조회
    async function fetchDanawa() {
      const result = await supabase
        .from('danawa_products')
        .select('pcode, title, brand, price, rank, thumbnail, spec, category_code, review_count, average_rating')
        .in('category_code', targetCategories)
        .gt('review_count', 0)
        .order('rank', { ascending: true, nullsFirst: false })
        .limit(limit);

      if (result.error) return { data: null, error: result.error };

      return {
        data: (result.data || []).map(p => ({
          ...p,
          dataSource: 'danawa' as const,
        })),
        error: null,
      };
    }

    if (dataSource === 'both') {
      // ===== 다나와 + 에누리 합산 =====
      const [danawaResult, enuriResult] = await Promise.all([fetchDanawa(), fetchEnuri()]);

      const danawaProducts = danawaResult.data || [];
      const enuriProducts = enuriResult.data || [];

      // 다나와 pcode Set (중복 제거용)
      const danawaPcodeSet = new Set(danawaProducts.map(p => p.pcode));
      const uniqueEnuriProducts = enuriProducts.filter(p => !danawaPcodeSet.has(p.pcode));

      products = [...danawaProducts, ...uniqueEnuriProducts];

      console.log(`[v2/anchor-products] BOTH - Danawa: ${danawaProducts.length}, Enuri: ${uniqueEnuriProducts.length}`);

    } else if (dataSource === 'enuri') {
      // ===== 에누리만 =====
      const result = await fetchEnuri();
      error = result.error;
      products = result.data;

    } else {
      // ===== 다나와만 =====
      const result = await fetchDanawa();
      error = result.error;
      products = result.data;
    }

    if (error) {
      console.error('[v2/anchor-products] Supabase error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 검색 필터
    let filteredProducts = products || [];
    if (searchKeyword) {
      filteredProducts = filteredProducts.filter(product => {
        const searchText = `${product.brand || ''} ${product.title}`.toLowerCase();
        return searchText.includes(searchKeyword);
      });
    }

    // 응답 형식 변환
    const formattedProducts = filteredProducts.map(product => ({
      productId: product.pcode as string,
      모델명: product.title as string,
      브랜드: (product.brand as string) || '',
      최저가: product.price as number,
      썸네일: product.thumbnail as string,
      리뷰수: (product.review_count as number) || 0,
      평균평점: (product.average_rating as number) || 0,
      순위: product.rank as number,
      dataSource: dataSource,
    }));

    console.log(`✅ [v2/anchor-products] Found ${formattedProducts.length} products`);

    return NextResponse.json({
      success: true,
      categoryKey,
      products: formattedProducts,
      total: formattedProducts.length,
    });
  } catch (error) {
    console.error('[v2/anchor-products] API error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load anchor products' },
      { status: 500 }
    );
  }
}
