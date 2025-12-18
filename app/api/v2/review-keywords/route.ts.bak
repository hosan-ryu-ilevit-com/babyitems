/**
 * 리뷰 키워드 매칭 데이터 API
 * 제품별 리뷰에서 추출한 체감속성 데이터 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

interface KeywordMatch {
  keyword: string;
  count: number;
  positiveCount: number;
  negativeCount: number;
  samples: Array<{
    text: string;
    rating: number;
  }>;
}

interface CriteriaMatch {
  criteriaId: string;
  criteriaName: string;
  totalMentions: number;
  positiveRatio: number;
  keywordMatches: KeywordMatch[];
  topPositiveSamples: string[];
  topNegativeSamples: string[];
}

interface ProductKeywordData {
  productId: string;
  reviewCount: number;
  criteriaMatches: CriteriaMatch[];
  lastUpdated: string;
}

// 카테고리별 키워드 데이터 캐시
const dataCache: Record<string, Record<string, ProductKeywordData>> = {};

function loadKeywordData(categoryKey: string): Record<string, ProductKeywordData> | null {
  // 캐시 확인
  if (dataCache[categoryKey]) {
    return dataCache[categoryKey];
  }

  const filePath = path.join(
    process.cwd(),
    'data',
    'experience-index',
    'products',
    `${categoryKey}_product_keywords.json`
  );

  if (!fs.existsSync(filePath)) {
    console.log(`[review-keywords] No data file for category: ${categoryKey}`);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    dataCache[categoryKey] = data;
    return data;
  } catch (error) {
    console.error(`[review-keywords] Failed to load data for ${categoryKey}:`, error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categoryKey, pcodes, criteriaIds } = body as {
      categoryKey: string;
      pcodes: string[];
      criteriaIds?: string[];  // 특정 기준만 필터링 (옵션)
    };

    if (!categoryKey || !pcodes || pcodes.length === 0) {
      return NextResponse.json(
        { success: false, error: 'categoryKey and pcodes are required' },
        { status: 400 }
      );
    }

    const data = loadKeywordData(categoryKey);
    if (!data) {
      return NextResponse.json({
        success: true,
        data: {},
        message: `No keyword data available for category: ${categoryKey}`,
      });
    }

    // 요청된 pcode들에 대한 데이터만 반환
    const result: Record<string, {
      reviewCount: number;
      insights: Array<{
        criteriaId: string;
        criteriaName: string;
        totalMentions: number;
        positiveRatio: number;
        sentiment: 'positive' | 'neutral' | 'negative';
        topSample: string | null;
      }>;
    }> = {};

    for (const pcode of pcodes) {
      const productData = data[pcode];
      if (!productData) continue;

      const insights = productData.criteriaMatches
        .filter(match => {
          // criteriaIds가 지정되면 해당 기준만 필터링
          if (criteriaIds && criteriaIds.length > 0) {
            return criteriaIds.includes(match.criteriaId);
          }
          return match.totalMentions > 0;
        })
        .map(match => {
          // 감정 판단 (긍정 비율 기반)
          let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
          if (match.positiveRatio >= 0.7) {
            sentiment = 'positive';
          } else if (match.positiveRatio <= 0.3) {
            sentiment = 'negative';
          }

          // 대표 샘플 선택 (긍정이면 긍정 샘플, 부정이면 부정 샘플)
          let topSample: string | null = null;
          if (sentiment === 'positive' && match.topPositiveSamples.length > 0) {
            topSample = match.topPositiveSamples[0];
          } else if (sentiment === 'negative' && match.topNegativeSamples.length > 0) {
            topSample = match.topNegativeSamples[0];
          } else if (match.topPositiveSamples.length > 0) {
            topSample = match.topPositiveSamples[0];
          } else if (match.topNegativeSamples.length > 0) {
            topSample = match.topNegativeSamples[0];
          }

          return {
            criteriaId: match.criteriaId,
            criteriaName: match.criteriaName,
            totalMentions: match.totalMentions,
            positiveRatio: match.positiveRatio,
            sentiment,
            topSample,
          };
        })
        .sort((a, b) => b.totalMentions - a.totalMentions);  // 언급 횟수 순 정렬

      result[pcode] = {
        reviewCount: productData.reviewCount,
        insights,
      };
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[review-keywords] API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
