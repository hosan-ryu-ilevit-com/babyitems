import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

interface Review {
  text: string;
  custom_metadata: {
    productId: string;
    category: string;
    rating: number;
  };
}

async function getReviewsForProduct(category: string, productId: string): Promise<Review[]> {
  const reviewsPath = path.join(process.cwd(), 'data', 'reviews', `${category}.jsonl`);

  if (!fs.existsSync(reviewsPath)) {
    throw new Error(`Reviews file not found: ${category}.jsonl`);
  }

  const reviews: Review[] = [];
  const fileStream = fs.createReadStream(reviewsPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const review = JSON.parse(line) as Review;
        if (review.custom_metadata?.productId === productId) {
          reviews.push(review);
        }
      } catch (e) {
        console.error('Failed to parse review line:', e);
      }
    }
  }

  return reviews;
}

export async function POST(req: NextRequest) {
  try {
    const { productId, productTitle, category } = await req.json();

    if (!productId || !productTitle || !category) {
      return NextResponse.json(
        { error: 'productId, productTitle, and category are required' },
        { status: 400 }
      );
    }

    console.log(`🔍 Analyzing reviews for: ${productTitle} (ID: ${productId})`);
    console.log(`📦 Category: ${category}`);

    // Get reviews from JSONL file
    const startTime = Date.now();
    const reviews = await getReviewsForProduct(category, productId);
    const loadTime = Date.now() - startTime;

    console.log(`📄 Found ${reviews.length} reviews in ${loadTime}ms`);

    if (reviews.length === 0) {
      return NextResponse.json(
        {
          error: '리뷰 없음',
          details: '해당 제품의 리뷰를 찾을 수 없습니다.',
          productId,
          reviewCount: 0
        },
        { status: 404 }
      );
    }

    // Prepare reviews text for LLM
    const reviewsText = reviews.map((r, idx) =>
      `[리뷰 ${idx + 1}] (별점: ${r.custom_metadata.rating}점)\n${r.text}`
    ).join('\n\n---\n\n');

    // Truncate if too long (limit to ~50 reviews or 100k chars)
    const maxChars = 100000;
    const finalReviewsText = reviewsText.length > maxChars
      ? reviewsText.substring(0, maxChars) + '\n\n...(리뷰가 너무 많아 일부만 표시됨)'
      : reviewsText;

    console.log(`📝 Sending ${finalReviewsText.length} chars to LLM`);

    // Analyze with LLM
    const query = `다음은 "${productTitle}" 제품의 실제 고객 리뷰입니다. 이 리뷰들을 분석해서 장단점을 JSON 형식으로 요약해주세요.

**리뷰 데이터 (총 ${reviews.length}개):**

${finalReviewsText}

**출력 형식 (반드시 JSON만 출력):**

\`\`\`json
{
  "pros": [
    {
      "text": "구체적인 장점 설명",
      "citation": "원본 리뷰에서 발췌한 핵심 문장 (20-30자)",
      "reviewIndex": 1
    }
  ],
  "cons": [
    {
      "text": "구체적인 단점 설명",
      "citation": "원본 리뷰에서 발췌한 핵심 문장 (20-30자)",
      "reviewIndex": 2
    }
  ]
}
\`\`\`

**중요 규칙:**
- 장점 3-5개, 단점 3-5개
- **reviewIndex는 반드시 [리뷰 N]의 N 숫자를 입력** (출처 추적용)
- citation은 해당 리뷰에서 직접 발췌한 원문
- 별점 4-5점은 주로 장점, 1-2점은 주로 단점
- 반드시 JSON 형식만 출력`;

    const analysisStart = Date.now();
    const result = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: query,
      config: {
        temperature: 0.3,
      },
    });
    const analysisTime = Date.now() - analysisStart;

    if (!result.text) {
      throw new Error('No text returned from LLM');
    }

    let summaryText = result.text.trim();
    console.log(`🤖 LLM analysis completed in ${analysisTime}ms`);

    // Parse JSON
    if (summaryText.includes('```json')) {
      summaryText = summaryText.split('```json')[1].split('```')[0].trim();
    } else if (summaryText.includes('```')) {
      summaryText = summaryText.split('```')[1].split('```')[0].trim();
    }

    let summary;
    try {
      summary = JSON.parse(summaryText) as {
        pros: Array<{ text: string; citation: string }>;
        cons: Array<{ text: string; citation: string }>;
      };
    } catch (parseError) {
      console.error('JSON parse failed:', summaryText.substring(0, 200));
      return NextResponse.json(
        {
          error: 'JSON 파싱 실패',
          details: 'LLM 응답을 파싱할 수 없습니다.',
          rawResponse: summaryText.substring(0, 500)
        },
        { status: 500 }
      );
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Total processing time: ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      productId,
      productTitle,
      category,
      reviewCount: reviews.length,
      summary,
      processingTime: {
        load: loadTime,
        analysis: analysisTime,
        total: totalTime
      }
    });

  } catch (error) {
    console.error('Analyze reviews API error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze reviews', details: String(error) },
      { status: 500 }
    );
  }
}
