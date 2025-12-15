/**
 * 다나와 리뷰 조회 API
 * GET /api/danawa-reviews?pcode=10371804
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface DanawaReviewImage {
  thumbnail: string;
  original?: string;
}

export interface DanawaReview {
  id: number;
  pcode: string;
  rating: number;
  content: string;
  author: string | null;
  review_date: string | null;
  mall_name: string | null;
  images: DanawaReviewImage[];
  helpful_count: number;
  crawled_at: string;
}

export interface DanawaReviewsResponse {
  success: boolean;
  pcode: string;
  reviewCount: number;
  averageRating: number | null;
  reviews: DanawaReview[];
  error?: string;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pcode = searchParams.get('pcode');
  const limit = parseInt(searchParams.get('limit') || '20', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  if (!pcode) {
    return NextResponse.json(
      { success: false, error: 'pcode parameter is required' },
      { status: 400 }
    );
  }

  try {
    // 1. 제품 메타데이터 조회 (리뷰수, 평균별점)
    const { data: productData } = await supabase
      .from('danawa_products')
      .select('review_count, average_rating')
      .eq('pcode', pcode)
      .maybeSingle();

    // 2. 리뷰 목록 조회
    const { data: reviews, error, count } = await supabase
      .from('danawa_reviews')
      .select('*', { count: 'exact' })
      .eq('pcode', pcode)
      .order('review_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const response: DanawaReviewsResponse = {
      success: true,
      pcode,
      reviewCount: productData?.review_count || count || 0,
      averageRating: productData?.average_rating || null,
      reviews: reviews || [],
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch danawa reviews:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}
