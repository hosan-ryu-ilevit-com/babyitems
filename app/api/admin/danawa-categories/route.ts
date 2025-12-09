/**
 * 다나와 카테고리 목록 조회 API (Admin용)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase credentials not configured');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    // 카테고리 그룹과 카테고리 모두 가져오기
    const { data: groups, error: groupsError } = await supabase
      .from('danawa_category_groups')
      .select('*')
      .order('display_order', { ascending: true });

    if (groupsError) {
      return NextResponse.json({ error: groupsError.message }, { status: 500 });
    }

    const { data: categories, error: categoriesError } = await supabase
      .from('danawa_categories')
      .select('*')
      .order('category_name', { ascending: true });

    if (categoriesError) {
      return NextResponse.json({ error: categoriesError.message }, { status: 500 });
    }

    // 그룹별로 카테고리 정리
    const groupedCategories = groups?.map(group => ({
      ...group,
      categories: categories?.filter(cat => cat.group_id === group.id) || []
    }));

    return NextResponse.json({
      groups: groupedCategories,
      allCategories: categories,
    });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
