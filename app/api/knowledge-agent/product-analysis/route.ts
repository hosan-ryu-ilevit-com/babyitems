/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Knowledge Agent - Product Analysis API (DEPRECATED)
 *
 * ⚠️ 이 API는 deprecated 되었습니다.
 * 대신 아래 3개의 분리된 API를 병렬로 호출하세요:
 * - /api/knowledge-agent/product-analysis/pros-cons
 * - /api/knowledge-agent/product-analysis/condition-eval
 * - /api/knowledge-agent/product-analysis/normalize-specs
 *
 * 참고: oneLiner는 final-recommend API에서 생성됩니다.
 * 이 API는 하위 호환성을 위해 유지되며, 내부적으로 분리된 API들을 호출합니다.
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

interface ProductAnalysisRequest {
  categoryKey: string;
  categoryName: string;
  products: any[];
  userContext: any;
  preEvaluations?: Record<string, any>;
  filterTags?: any[];
}

interface ProductAnalysisResponse {
  success: boolean;
  data?: {
    analyses: any[];
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ProductAnalysisResponse>> {
  console.warn('[product-analysis] ⚠️ DEPRECATED: Use split APIs instead (pros-cons, condition-eval, one-liner, normalize-specs)');

  try {
    const body: ProductAnalysisRequest = await request.json();
    const { categoryName, products, userContext, preEvaluations, filterTags } = body;

    if (!products || products.length === 0) {
      return NextResponse.json(
        { success: false, error: 'products array is required' },
        { status: 400 }
      );
    }

    const baseUrl = request.nextUrl.origin;

    // 3개 API 병렬 호출 (oneLiner는 final-recommend에서 생성)
    const [prosConsRes, conditionEvalRes, normalizeSpecsRes] = await Promise.all([
      fetch(`${baseUrl}/api/knowledge-agent/product-analysis/pros-cons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName, products }),
      }),
      fetch(`${baseUrl}/api/knowledge-agent/product-analysis/condition-eval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName,
          products,
          userContext,
          preEvaluations,
          filterTags,
        }),
      }),
      fetch(`${baseUrl}/api/knowledge-agent/product-analysis/normalize-specs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName, products }),
      }),
    ]);

    const [prosConsData, conditionEvalData, normalizeSpecsData] = await Promise.all([
      prosConsRes.ok ? prosConsRes.json() : { success: false },
      conditionEvalRes.ok ? conditionEvalRes.json() : { success: false },
      normalizeSpecsRes.ok ? normalizeSpecsRes.json() : { success: false },
    ]);

    // 결과 병합
    const analyses = products.map((product: any) => {
      const pcode = String(product.pcode);

      const prosConsResult = prosConsData.data?.results?.find((r: any) => String(r.pcode) === pcode);
      const conditionEvalResult = conditionEvalData.data?.results?.find((r: any) => String(r.pcode) === pcode);
      const normalizedSpecs = normalizeSpecsData.data?.result?.specsByProduct?.[pcode] || {};

      return {
        pcode,
        selectedConditionsEvaluation: conditionEvalResult?.selectedConditionsEvaluation || [],
        contextMatch: conditionEvalResult?.contextMatch,
        oneLiner: product.oneLiner || '',  // oneLiner는 final-recommend에서 이미 생성됨
        additionalPros: (product.highlights || []).map((text: string) => ({ text, citations: [] })),
        cons: (product.concerns || []).map((text: string) => ({ text, citations: [] })),
        prosFromReviews: prosConsResult?.pros || [],
        consFromReviews: prosConsResult?.cons || [],
        normalizedSpecs,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        analyses,
        generated_by: 'llm',
      },
    });
  } catch (error) {
    console.error('[product-analysis] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to analyze products' },
      { status: 500 }
    );
  }
}
