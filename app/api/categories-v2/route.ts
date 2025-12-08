/**
 * Supabase 기반 카테고리 조회 API (공개용)
 * - danawa_category_groups: 카테고리 그룹 (유모차, 카시트 등)
 * - danawa_categories: 실제 카테고리들
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 공개 읽기용 클라이언트 (RLS 정책으로 읽기 허용됨)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface CategoryGroup {
  id: string;
  name: string;
  display_order: number;
  is_active: boolean;
  categories: DanawaCategory[];
}

export interface DanawaCategory {
  category_code: string;
  category_name: string;
  group_id: string;
  total_product_count: number;
  crawled_product_count: number;
}

export async function GET() {
  try {
    // 활성화된 카테고리 그룹 가져오기
    const { data: groups, error: groupsError } = await supabase
      .from('danawa_category_groups')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (groupsError) {
      console.error('Groups fetch error:', groupsError);
      return NextResponse.json({ error: groupsError.message }, { status: 500 });
    }

    // 모든 카테고리 가져오기
    const { data: categories, error: categoriesError } = await supabase
      .from('danawa_categories')
      .select('*')
      .order('category_name', { ascending: true });

    if (categoriesError) {
      console.error('Categories fetch error:', categoriesError);
      return NextResponse.json({ error: categoriesError.message }, { status: 500 });
    }

    // 그룹별로 카테고리 정리
    const groupedCategories: CategoryGroup[] = (groups || []).map(group => ({
      id: group.id,
      name: group.name,
      display_order: group.display_order,
      is_active: group.is_active,
      categories: (categories || []).filter(cat => cat.group_id === group.id),
    }));

    // 미분류 카테고리 (group_id가 null인 경우)
    const uncategorized = (categories || []).filter(cat => !cat.group_id);

    return NextResponse.json({
      groups: groupedCategories,
      uncategorized,
      totalGroups: groupedCategories.length,
      totalCategories: categories?.length || 0,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
