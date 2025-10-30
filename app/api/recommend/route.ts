import { NextRequest, NextResponse } from 'next/server';
import { generatePersona } from '@/lib/agents/personaGenerator';
import { loadAllProducts } from '@/lib/data/productLoader';
import { selectTopProducts, filterByBudget } from '@/lib/filtering/initialFilter';
import { Message, Recommendation } from '@/types';

/**
 * POST /api/recommend
 *
 * Phase 2-6: 전체 추천 워크플로우 실행
 * 1. Persona Generation + Reflection
 * 2. Initial Filtering (Code-based)
 * 3. Product Evaluation + Validation (TODO)
 * 4. Final Score Calculation
 * 5. Recommendation Generation (TODO)
 */
export async function POST(request: NextRequest) {
  try {
    const { messages, attributeAssessments } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // Phase 2: Persona Generation (Reflection 제거 - 속도 개선)
    console.log('Phase 2: Generating persona...');

    const chatHistory = messages
      .map((msg: Message) => `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`)
      .join('\n\n');

    const persona = await generatePersona(chatHistory);
    console.log('✓ Persona generated');

    // Phase 3: Initial Filtering
    console.log('Phase 3: Filtering products...');

    const allProducts = await loadAllProducts();
    console.log(`Loaded ${allProducts.length} products`);

    // 예산 필터링
    const budgetFilteredProducts = filterByBudget(allProducts, persona.budget);
    console.log(`After budget filter: ${budgetFilteredProducts.length} products`);

    // Top 5 선택
    const top5 = selectTopProducts(budgetFilteredProducts, persona, 5);
    console.log('✓ Top 5 products selected');

    // Phase 4-6: 간단한 버전으로 Top 3 추천 생성
    // TODO: AI 평가 및 검증 추가
    const recommendations: Recommendation[] = top5.slice(0, 3).map((productWithScore, index) => ({
      product: {
        id: productWithScore.id,
        title: productWithScore.title,
        price: productWithScore.price,
        reviewCount: productWithScore.reviewCount,
        reviewUrl: productWithScore.reviewUrl,
        ranking: productWithScore.ranking,
        thumbnail: productWithScore.thumbnail,
        coreValues: productWithScore.coreValues,
      },
      rank: (index + 1) as 1 | 2 | 3,
      finalScore: productWithScore.fitScore,
      personalizedReason: {
        strengths: [
          `고객님께서 중요하게 생각하시는 기능들을 잘 갖추고 있습니다.`,
          `전체 적합도 점수: ${productWithScore.fitScore.toFixed(0)}점`,
        ],
        weaknesses: [
          `추가적인 평가가 진행 중입니다.`,
        ],
      },
      comparison: `현재 ${productWithScore.ranking}위 제품입니다.`,
      additionalConsiderations: `리뷰 ${productWithScore.reviewCount}개`,
    }));

    console.log('✓ Recommendations generated');

    return NextResponse.json({
      persona,
      recommendations,
    });
  } catch (error) {
    console.error('Recommendation API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate recommendation', details: String(error) },
      { status: 500 }
    );
  }
}
