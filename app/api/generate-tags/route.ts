import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getReviewsForProduct, sampleBalancedBySentiment, formatReviewsForLLM } from '@/lib/review';
import { Category } from '@/lib/data';
import { cache, TTL } from '@/lib/cache/simple';
import { CATEGORY_ATTRIBUTES } from '@/data/categoryAttributes';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

interface Tag {
  id: string;
  text: string;
  mentionCount?: number;
  attributes: Record<string, number>; // NEW: { temperature_control: 1.0, usability: 0.3 }
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
    console.log(`⏱️  [${Date.now() - startTime}ms] Starting review fetch...`);

    const allReviews = await getReviewsForProduct(category as Category, String(productId));
    const loadTime = Date.now() - startTime;

    console.log(`📄 Found ${allReviews.length} reviews in ${loadTime}ms`);
    console.log(`⏱️  [${Date.now() - startTime}ms] Review fetch completed`);

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

    // Sample reviews balanced by sentiment (25 total: 15 high, 10 low - mid excluded)
    console.log(`⏱️  [${Date.now() - startTime}ms] Starting review sampling...`);
    const { high: highReviews, low: lowReviews } = sampleBalancedBySentiment(allReviews);
    console.log(`⏱️  [${Date.now() - startTime}ms] Sampling completed`);

    console.log(`⏱️  [${Date.now() - startTime}ms] Formatting reviews for LLM...`);
    const highReviewsText = formatReviewsForLLM(highReviews, 20000); // 60K → 20K
    const lowReviewsText = formatReviewsForLLM(lowReviews, 15000);   // 40K → 15K
    console.log(`⏱️  [${Date.now() - startTime}ms] Formatting completed`);

    console.log(`📝 Parallel processing: High(${highReviews.length}) + Low(${lowReviews.length}) reviews`);
    console.log(`   High reviews: ${highReviewsText.length} chars → Pros`);
    console.log(`   Low reviews: ${lowReviewsText.length} chars → Cons`);

    // Build category attributes section for prompt
    const categoryAttrs = CATEGORY_ATTRIBUTES[category as Category] || [];
    const attributesSection = categoryAttrs.length > 0
      ? categoryAttrs.map(attr => `
**${attr.name} (${attr.key})**
- 설명: ${attr.description}
- 중요도: ${attr.importance}
- 예시: ${attr.examples.join(', ')}`).join('\n')
      : '(카테고리 속성이 아직 정의되지 않았습니다)';

    console.log(`📊 Category attributes: ${categoryAttrs.length} attributes loaded for ${category}`);

    // Generate pros and cons in parallel for 2x speed boost
    console.log(`⏱️  [${Date.now() - startTime}ms] Starting parallel LLM calls...`);
    const analysisStart = Date.now();

    const [prosResult, consResult] = await Promise.all([
      // Generate PROS from high-rating reviews
      ai.models.generateContent({
        model: 'gemini-3-flash-preview', // Fast and cheap model
        contents: `다음은 "${productTitle}" 제품의 **고평점(4-5★) 리뷰**입니다. 이 리뷰들을 분석해서 **장점만** 추출해주세요.

**리뷰 데이터 (총 ${highReviews.length}개 고평점):**

${highReviewsText}

**이 카테고리(${category})의 핵심 평가 속성:**
${attributesSection}

**출력 형식 (반드시 JSON만 출력):**

\`\`\`json
{
  "pros": [
    {
      "id": "pros_1",
      "text": "구체적인 장점 설명 (20-40자, 사용자 입장에서 와닿는 문장)",
      "mentionCount": 5,
      "attributes": {
        "primary_attribute_key": 1.0,
        "secondary_attribute_key": 0.3
      }
    }
  ]
}
\`\`\`

**중요 규칙:**
- 장점 5-8개 추출
- mentionCount: 해당 특징을 언급한 리뷰 개수 (1-${highReviews.length})
- 각 특징은 최대한 구체적이고 실용적이어야 함 (예: "온도 조절이 정확해요" → "1도 단위로 정확하게 온도 조절할 수 있어요")
- 사용자 입장에서 선택하고 싶은 문장으로 작성 (평가가 아닌 설명)
- 알기 어려운 단어가 포함된다면 쉬운 단어와 병기. PP 소재, S 젖꼭지 등 육아용품 모르는 일반인들은 잘 모를 용어들 설명 필요. (예: ISOFIX → 국제표준인증(ISOFIX))
- **attributes 필드**: 각 장점이 관련된 속성을 매핑하세요
  - 주요 속성(primary): weight 1.0
  - 부차적 속성(secondary): weight 0.3-0.5
  - 관련 없는 속성은 포함하지 마세요
  - 속성 key는 위의 "핵심 평가 속성"에서 제공된 key를 사용하세요
- 반드시 JSON 형식만 출력`,
        config: { temperature: 0.1 },
      }),

      // Generate CONS from low-rating reviews
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `다음은 "${productTitle}" 제품의 **저평점(1-2★) 리뷰**입니다. 이 리뷰들을 분석해서 **단점만** 추출해주세요.

**리뷰 데이터 (총 ${lowReviews.length}개 저평점):**

${lowReviewsText}

**이 카테고리(${category})의 핵심 평가 속성:**
${attributesSection}

**출력 형식 (반드시 JSON만 출력):**

\`\`\`json
{
  "cons": [
    {
      "id": "cons_1",
      "text": "구체적인 단점 설명 (20-40자, 사용자 입장에서 와닿는 문장)",
      "mentionCount": 3,
      "attributes": {
        "primary_attribute_key": 1.0,
        "secondary_attribute_key": 0.3
      }
    }
  ]
}
\`\`\`

**중요 규칙:**
- 단점 4-6개 추출
- mentionCount: 해당 특징을 언급한 리뷰 개수 (1-${lowReviews.length})
- 각 특징은 최대한 구체적이고 실용적이어야 함. 추상적이지 않아야 하며(ex: 편리함 극대화) 구체적인 기능(피처)와 대응되어야 함(ex: 원터치 모드)
- 사용자 입장에서 선택하고 싶은 문장으로 작성 (평가가 아닌 설명)
- 일상적으로 알기 어려운 단어가 포함된다면 쉬운 단어와 병기
- **attributes 필드**: 각 단점이 관련된 속성을 매핑하세요
  - 주요 속성(primary): weight 1.0
  - 부차적 속성(secondary): weight 0.3-0.5
  - 관련 없는 속성은 포함하지 마세요
  - 속성 key는 위의 "핵심 평가 속성"에서 제공된 key를 사용하세요
- 반드시 JSON 형식만 출력`,
        config: { temperature: 0.1 },
      }),
    ]);

    const analysisTime = Date.now() - analysisStart;
    console.log(`⏱️  [${Date.now() - startTime}ms] Parallel LLM calls completed in ${analysisTime}ms`);

    if (!prosResult.text || !consResult.text) {
      throw new Error('No text returned from LLM');
    }

    console.log(`🤖 Parallel LLM generation completed in ${analysisTime}ms (2x faster!)`);

    // Parse PROS JSON
    console.log(`⏱️  [${Date.now() - startTime}ms] Starting JSON parsing...`);
    let prosText = prosResult.text.trim();
    if (prosText.includes('```json')) {
      prosText = prosText.split('```json')[1].split('```')[0].trim();
    } else if (prosText.includes('```')) {
      prosText = prosText.split('```')[1].split('```')[0].trim();
    }

    // Parse CONS JSON
    let consText = consResult.text.trim();
    if (consText.includes('```json')) {
      consText = consText.split('```json')[1].split('```')[0].trim();
    } else if (consText.includes('```')) {
      consText = consText.split('```')[1].split('```')[0].trim();
    }

    let prosData: { pros: Tag[] };
    let consData: { cons: Tag[] };

    try {
      prosData = JSON.parse(prosText);
      consData = JSON.parse(consText);
    } catch (parseError) {
      console.error('JSON parse failed');
      console.error('Pros:', prosText.substring(0, 200));
      console.error('Cons:', consText.substring(0, 200));
      return NextResponse.json(
        {
          error: 'JSON 파싱 실패',
          details: 'LLM 응답을 파싱할 수 없습니다.',
        },
        { status: 500 }
      );
    }

    // Validate tags
    if (!Array.isArray(prosData.pros) || !Array.isArray(consData.cons)) {
      return NextResponse.json(
        {
          error: '잘못된 태그 형식',
          details: 'pros와 cons는 배열이어야 합니다.',
        },
        { status: 500 }
      );
    }

    // Ensure all tags have attributes field (fallback to empty object if missing)
    prosData.pros.forEach(tag => {
      if (!tag.attributes || typeof tag.attributes !== 'object') {
        tag.attributes = {};
        console.warn(`⚠️ Tag "${tag.id}" missing attributes field, initialized as empty`);
      }
    });
    consData.cons.forEach(tag => {
      if (!tag.attributes || typeof tag.attributes !== 'object') {
        tag.attributes = {};
        console.warn(`⚠️ Tag "${tag.id}" missing attributes field, initialized as empty`);
      }
    });

    const tags: GeneratedTags = {
      pros: prosData.pros,
      cons: consData.cons,
    };

    console.log(`✅ Generated ${tags.pros.length} pros and ${tags.cons.length} cons in parallel`);
    console.log(`📊 Attribute mappings: Pros(${tags.pros.filter(t => Object.keys(t.attributes).length > 0).length}/${tags.pros.length}), Cons(${tags.cons.filter(t => Object.keys(t.attributes).length > 0).length}/${tags.cons.length})`);
    console.log(`⏱️  [${Date.now() - startTime}ms] Parsing completed`);

    // Cache the result for 24 hours
    console.log(`⏱️  [${Date.now() - startTime}ms] Caching result...`);
    cache.set(cacheKey, tags, TTL.ONE_DAY);

    const totalTime = Date.now() - startTime;
    console.log(`⏱️  [${totalTime}ms] ✅ TOTAL TIME`);
    console.log(`⏱️  Breakdown: Load(${loadTime}ms) + Analysis(${analysisTime}ms) + Other(${totalTime - loadTime - analysisTime}ms)`);

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
