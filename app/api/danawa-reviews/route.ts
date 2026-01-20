/**
 * 리뷰 조회 API (다나와 + 에누리 통합)
 * GET /api/danawa-reviews?pcode=10371804
 * 
 * 다나와 리뷰를 먼저 조회하고, 없으면 에누리 리뷰를 조회합니다.
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
  dataSource?: 'danawa' | 'enuri';
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
    // 0. 먼저 knowledge_reviews_cache에서 리뷰 조회 (Knowledge Agent 캐시)
    const { data: knowledgeReviews, error: knowledgeError } = await supabase
      .from('knowledge_reviews_cache')
      .select('*')
      .eq('pcode', pcode)
      .order('review_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (!knowledgeError && knowledgeReviews && knowledgeReviews.length > 0) {
      // knowledge_reviews_cache 형식을 DanawaReview 형식으로 변환
      const convertedReviews: DanawaReview[] = knowledgeReviews.map((review, index) => ({
        id: review.id || index,
        pcode: review.pcode,
        rating: review.rating,
        content: review.content,
        author: review.author,
        review_date: review.review_date,
        mall_name: review.mall_name,
        images: (review.image_urls || []).map((url: string) => ({ thumbnail: url, original: url })),
        helpful_count: 0,
        crawled_at: review.cached_at,
      }));

      // 평균 별점 계산
      const avgRating = convertedReviews.reduce((sum, r) => sum + r.rating, 0) / convertedReviews.length;

      const response: DanawaReviewsResponse = {
        success: true,
        pcode,
        reviewCount: convertedReviews.length,
        averageRating: Math.round(avgRating * 10) / 10,
        reviews: convertedReviews,
        dataSource: 'danawa', // knowledge cache지만 다나와 형식으로 반환
      };
      return NextResponse.json(response);
    }

    // 1. knowledge_reviews_cache에 없으면 다나와에서 리뷰 조회
    const { data: danawaProduct } = await supabase
      .from('danawa_products')
      .select('review_count, average_rating')
      .eq('pcode', pcode)
      .maybeSingle();

    const { data: danawaReviews, error: danawaError } = await supabase
      .from('danawa_reviews')
      .select('*', { count: 'exact' })
      .eq('pcode', pcode)
      .order('review_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    // 다나와에 리뷰가 있으면 반환
    if (!danawaError && danawaReviews && danawaReviews.length > 0) {
      const response: DanawaReviewsResponse = {
        success: true,
        pcode,
        reviewCount: danawaProduct?.review_count || danawaReviews.length,
        averageRating: danawaProduct?.average_rating || null,
        reviews: danawaReviews,
        dataSource: 'danawa',
      };
      return NextResponse.json(response);
    }

    // 2. 다나와에 없으면 에누리에서 조회 (pcode = model_no)
    const { data: enuriProduct } = await supabase
      .from('enuri_products')
      .select('review_count, average_rating')
      .eq('model_no', pcode)
      .maybeSingle();

    const { data: enuriReviews, error: enuriError } = await supabase
      .from('enuri_reviews')
      .select('*')
      .eq('model_no', pcode)
      .order('review_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);

    if (enuriError) {
      console.error('Enuri reviews error:', enuriError);
    }

    // 에누리 리뷰를 다나와 형식으로 변환
    const convertedReviews: DanawaReview[] = (enuriReviews || []).map((review, index) => ({
      id: review.id || index,
      pcode: review.model_no,
      rating: review.rating,
      content: review.content,
      author: review.author,
      review_date: review.review_date,
      mall_name: review.source,  // 에누리는 source 필드 사용
      images: review.images || [],
      helpful_count: review.helpful_count || 0,
      crawled_at: review.crawled_at,
    }));

    const response: DanawaReviewsResponse = {
      success: true,
      pcode,
      reviewCount: enuriProduct?.review_count || convertedReviews.length,
      averageRating: enuriProduct?.average_rating || null,
      reviews: convertedReviews,
      dataSource: 'enuri',
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Failed to fetch reviews:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}
