import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getReviewsForProduct, sampleLongestReviews, formatReviewsForLLM } from '@/lib/review';
import { Category } from '@/lib/data';
import { cache, TTL } from '@/lib/cache/simple';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

interface Tag {
  id: string;
  text: string;
}

interface GeneratedTags {
  pros: Tag[];
  cons: Tag[];
}

/**
 * POST /api/generate-tags
 * Generate dynamic tags from anchor product reviews
 */
export async function POST(req: NextRequest) {
  try {
    const { category, productId, productTitle } = await req.json();

    if (!category || !productId) {
      return NextResponse.json(
        { error: 'category and productId are required' },
        { status: 400 }
      );
    }

    const cacheKey = `tags:${category}:${productId}`;

    // Check cache first
    const cached = cache.get<GeneratedTags>(cacheKey);
    if (cached) {
      console.log(`✅ Cache hit for tags: ${cacheKey}`);
      return NextResponse.json({
        success: true,
        productId,
        productTitle,
        ...cached,
        cached: true,
      });
    }

    console.log(`🔍 Generating tags for: ${productTitle} (ID: ${productId})`);
    console.log(`📦 Category: ${category}`);

    // Get reviews for anchor product
    const startTime = Date.now();
    const allReviews = await getReviewsForProduct(category as Category, String(productId));
    const loadTime = Date.now() - startTime;

    console.log(`📄 Found ${allReviews.length} reviews in ${loadTime}ms`);

    if (allReviews.length === 0) {
      return NextResponse.json(
        {
          error: '리뷰 없음',
          details: '해당 제품의 리뷰를 찾을 수 없습니다.',
          productId,
        },
        { status: 404 }
      );
    }

    // Sample top 50 longest reviews
    const sampledReviews = sampleLongestReviews(allReviews, 50);
    const reviewsText = formatReviewsForLLM(sampledReviews, 80000); // Slightly lower limit for tags

    console.log(`📝 Sending ${reviewsText.length} chars to LLM for tag generation`);

    // Generate tags with LLM
    const query = `다음은 "${productTitle}" 제품의 실제 고객 리뷰입니다. 이 리뷰들을 분석해서 구체적이고 실용적인 장점/단점 특징을 추출해주세요.

**리뷰 데이터 (총 ${sampledReviews.length}개):**

${reviewsText}

**출력 형식 (반드시 JSON만 출력):**

\`\`\`json
{
  "pros": [
    {
      "id": "pros_1",
      "text": "구체적인 장점 설명 (20-40자, 사용자 입장에서 와닿는 문장)"
    }
  ],
  "cons": [
    {
      "id": "cons_1",
      "text": "구체적인 단점 설명 (20-40자, 사용자 입장에서 와닿는 문장)"
    }
  ]
}
\`\`\`

**중요 규칙:**
- 장점 5-8개, 단점 4-6개
- 각 특징은 구체적이고 실용적이어야 함 (예: "온도 조절이 정확해요" → "1도 단위로 정확하게 온도 조절할 수 있어요")
- 사용자 입장에서 선택하고 싶은 문장으로 작성 (평가가 아닌 설명)
- 별점 4-5점 리뷰에서 주로 장점 추출
- 별점 1-2점 리뷰에서 주로 단점 추출
- 반드시 JSON 형식만 출력`;

    const analysisStart = Date.now();
    const result = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: query,
      config: {
        temperature: 0.4,
      },
    });
    const analysisTime = Date.now() - analysisStart;

    if (!result.text) {
      throw new Error('No text returned from LLM');
    }

    let summaryText = result.text.trim();
    console.log(`🤖 LLM tag generation completed in ${analysisTime}ms`);

    // Parse JSON
    if (summaryText.includes('```json')) {
      summaryText = summaryText.split('```json')[1].split('```')[0].trim();
    } else if (summaryText.includes('```')) {
      summaryText = summaryText.split('```')[1].split('```')[0].trim();
    }

    let tags: GeneratedTags;
    try {
      tags = JSON.parse(summaryText) as GeneratedTags;
    } catch (parseError) {
      console.error('JSON parse failed:', summaryText.substring(0, 200));
      return NextResponse.json(
        {
          error: 'JSON 파싱 실패',
          details: 'LLM 응답을 파싱할 수 없습니다.',
          rawResponse: summaryText.substring(0, 500),
        },
        { status: 500 }
      );
    }

    // Validate tags
    if (!Array.isArray(tags.pros) || !Array.isArray(tags.cons)) {
      return NextResponse.json(
        {
          error: '잘못된 태그 형식',
          details: 'pros와 cons는 배열이어야 합니다.',
        },
        { status: 500 }
      );
    }

    console.log(`✅ Generated ${tags.pros.length} pros and ${tags.cons.length} cons`);

    // Cache the result for 24 hours
    cache.set(cacheKey, tags, TTL.ONE_DAY);

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      productId,
      productTitle,
      category,
      reviewCount: allReviews.length,
      pros: tags.pros,
      cons: tags.cons,
      processingTime: {
        load: loadTime,
        analysis: analysisTime,
        total: totalTime,
      },
      cached: false,
    });
  } catch (error) {
    console.error('Generate tags API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate tags', details: String(error) },
      { status: 500 }
    );
  }
}
