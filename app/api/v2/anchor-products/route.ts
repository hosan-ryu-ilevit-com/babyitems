/**
 * v2 기준제품 조회 API - Supabase에서 rank 기준 정렬
 * GET /api/v2/anchor-products?categoryKey=xxx&limit=50&search=keyword
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import logicMapData from '@/data/rules/logic_map.json';
import type { CategoryLogicMap } from '@/types/rules';

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

    // 1. logic_map에서 target_categories 가져오기
    const logicMap = logicMapData as Record<string, CategoryLogicMap>;
    const categoryLogic = logicMap[categoryKey];

    if (!categoryLogic) {
      return NextResponse.json(
        { success: false, error: `Category '${categoryKey}' not found` },
        { status: 404 }
      );
    }

    const targetCategories = categoryLogic.target_categories;

    console.log(`🔍 [v2/anchor-products] Loading for: ${categoryKey}, limit: ${limit}, search: "${searchKeyword}"`);

    // 2. Supabase 쿼리 - rank 기준 정렬
    let query = supabase
      .from('danawa_products')
      .select('pcode, title, brand, price, rank, thumbnail, spec, category_code, review_count, average_rating')
      .in('category_code', targetCategories)
      .order('rank', { ascending: true, nullsFirst: false })
      .limit(limit);

    const { data: products, error } = await query;

    if (error) {
      console.error('[v2/anchor-products] Supabase error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // 3. 검색 필터 (클라이언트 사이드)
    let filteredProducts = products || [];
    if (searchKeyword) {
      filteredProducts = filteredProducts.filter(product => {
        const searchText = `${product.brand || ''} ${product.title}`.toLowerCase();
        return searchText.includes(searchKeyword);
      });
    }

    // 4. 응답 형식 변환 (AnchorProductChangeBottomSheet와 호환)
    const formattedProducts = filteredProducts.map(product => ({
      productId: product.pcode,
      모델명: product.title,
      브랜드: product.brand || '',
      최저가: product.price,
      썸네일: product.thumbnail,
      리뷰수: product.review_count || 0,
      평균평점: product.average_rating || 0,
      순위: product.rank,
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
