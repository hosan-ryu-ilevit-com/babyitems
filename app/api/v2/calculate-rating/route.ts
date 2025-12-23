/**
 * V2 평균별점 계산 및 DB 저장 API
 * POST /api/v2/calculate-rating
 *
 * 평균별점(average_rating)이 비어있는 제품에 대해:
 * 1. 리뷰 테이블에서 평균 계산
 * 2. DB에 저장
 * 3. 계산된 값 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface RatingRequest {
  pcodes: string[];  // pcode 또는 model_no 배열
}

interface RatingResult {
  pcode: string;
  average_rating: number | null;
  review_count: number;
  source: 'cached' | 'calculated';
}

export async function POST(request: NextRequest) {
  try {
    const { pcodes }: RatingRequest = await request.json();

    if (!pcodes || !Array.isArray(pcodes) || pcodes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'pcodes array is required' },
        { status: 400 }
      );
    }

    console.log(`[calculate-rating] Processing ${pcodes.length} products`);

    const results: RatingResult[] = [];

    // 다나와와 에누리 제품 정보 병렬 조회
    const [danawaProducts, enuriProducts] = await Promise.all([
      supabase
        .from('danawa_products')
        .select('pcode, average_rating, review_count')
        .in('pcode', pcodes),
      supabase
        .from('enuri_products')
        .select('model_no, average_rating, review_count')
        .in('model_no', pcodes),
    ]);

    // 다나와 제품 처리
    const danawaMap = new Map<string, { average_rating: number | null; review_count: number }>();
    for (const p of danawaProducts.data || []) {
      danawaMap.set(p.pcode, { average_rating: p.average_rating, review_count: p.review_count || 0 });
    }

    // 에누리 제품 처리 (다나와에 없는 것만)
    const enuriMap = new Map<string, { average_rating: number | null; review_count: number }>();
    for (const p of enuriProducts.data || []) {
      if (!danawaMap.has(p.model_no)) {
        enuriMap.set(p.model_no, { average_rating: p.average_rating, review_count: p.review_count || 0 });
      }
    }

    // 각 pcode에 대해 처리
    for (const pcode of pcodes) {
      // 다나와에서 찾기
      if (danawaMap.has(pcode)) {
        const data = danawaMap.get(pcode)!;
        
        // 이미 평균별점이 있으면 그대로 반환
        if (data.average_rating !== null && data.average_rating > 0) {
          results.push({
            pcode,
            average_rating: data.average_rating,
            review_count: data.review_count,
            source: 'cached',
          });
          continue;
        }

        // 평균별점 없으면 리뷰에서 계산
        const { data: reviews } = await supabase
          .from('danawa_reviews')
          .select('rating')
          .eq('pcode', pcode)
          .not('rating', 'is', null);

        if (reviews && reviews.length > 0) {
          const validRatings = reviews.filter(r => r.rating > 0).map(r => r.rating);
          if (validRatings.length > 0) {
            const avgRating = validRatings.reduce((a, b) => a + b, 0) / validRatings.length;
            const roundedRating = Math.round(avgRating * 10) / 10;  // 소수점 1자리

            // DB 업데이트
            await supabase
              .from('danawa_products')
              .update({ average_rating: roundedRating })
              .eq('pcode', pcode);

            console.log(`[calculate-rating] Danawa ${pcode}: calculated ${roundedRating} from ${validRatings.length} reviews`);

            results.push({
              pcode,
              average_rating: roundedRating,
              review_count: data.review_count,
              source: 'calculated',
            });
            continue;
          }
        }

        // 리뷰도 없으면 null
        results.push({
          pcode,
          average_rating: null,
          review_count: data.review_count,
          source: 'cached',
        });
        continue;
      }

      // 에누리에서 찾기
      if (enuriMap.has(pcode)) {
        const data = enuriMap.get(pcode)!;

        // 이미 평균별점이 있으면 그대로 반환
        if (data.average_rating !== null && data.average_rating > 0) {
          results.push({
            pcode,
            average_rating: data.average_rating,
            review_count: data.review_count,
            source: 'cached',
          });
          continue;
        }

        // 평균별점 없으면 리뷰에서 계산
        const { data: reviews } = await supabase
          .from('enuri_reviews')
          .select('rating')
          .eq('model_no', pcode)
          .not('rating', 'is', null);

        if (reviews && reviews.length > 0) {
          const validRatings = reviews.filter(r => r.rating > 0).map(r => r.rating);
          if (validRatings.length > 0) {
            const avgRating = validRatings.reduce((a, b) => a + b, 0) / validRatings.length;
            const roundedRating = Math.round(avgRating * 10) / 10;

            // DB 업데이트
            await supabase
              .from('enuri_products')
              .update({ average_rating: roundedRating })
              .eq('model_no', pcode);

            console.log(`[calculate-rating] Enuri ${pcode}: calculated ${roundedRating} from ${validRatings.length} reviews`);

            results.push({
              pcode,
              average_rating: roundedRating,
              review_count: data.review_count,
              source: 'calculated',
            });
            continue;
          }
        }

        // 리뷰도 없으면 null
        results.push({
          pcode,
          average_rating: null,
          review_count: data.review_count,
          source: 'cached',
        });
        continue;
      }

      // 둘 다 없으면 null
      results.push({
        pcode,
        average_rating: null,
        review_count: 0,
        source: 'cached',
      });
    }

    const calculatedCount = results.filter(r => r.source === 'calculated').length;
    console.log(`[calculate-rating] Completed: ${results.length} total, ${calculatedCount} calculated`);

    return NextResponse.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('[calculate-rating] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to calculate ratings' },
      { status: 500 }
    );
  }
}



