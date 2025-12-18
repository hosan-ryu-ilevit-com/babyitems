import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { Category } from '@/lib/data';
import { CATEGORY_ATTRIBUTES } from '@/data/categoryAttributes';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

/**
 * POST /api/analyze-custom-tag
 *
 * 사용자가 직접 입력한 커스텀 태그 텍스트를 AI로 분석하여
 * 카테고리별 속성(attributes)과 가중치(weight)를 자동으로 추출합니다.
 *
 * Request Body:
 * {
 *   tagText: string;         // 사용자가 입력한 태그 텍스트
 *   tagType: 'pros' | 'cons'; // 장점/단점 구분
 *   category: Category;       // 제품 카테고리
 * }
 *
 * Response:
 * {
 *   attributes: Record<string, number>; // attribute_key → weight (0.3-1.0)
 *   reasoning?: string;
 * }
 */

const ANALYZE_TAG_PROMPT = `당신은 제품 속성 분석 전문가입니다.
사용자가 입력한 태그를 분석하여 카테고리의 속성들과 매칭해주세요.

**카테고리**: {CATEGORY}

**카테고리 속성 목록**:
{ATTRIBUTES}

**사용자 입력 태그**: "{TAG_TEXT}"
**태그 유형**: {TAG_TYPE}

**분석 기준**:
1. 태그 내용이 어떤 속성과 관련있는지 분석
2. 주요 속성(primary)에는 1.0 가중치
3. 부수적 속성(secondary)에는 0.3-0.5 가중치
4. 관련 없는 속성은 포함하지 마세요
5. **매칭이 불가능하면 빈 객체 {{}} 반환**

**출력 형식 (JSON만)**:
\`\`\`json
{
  "attributes": {
    "primary_attribute_key": 1.0,
    "secondary_attribute_key": 0.3
  },
  "reasoning": "이 태그는 주로 X 속성과 관련있으며, 부수적으로 Y 속성에도 영향을 줍니다."
}
\`\`\`

**중요**:
- 매칭이 확실하지 않으면 포함하지 마세요
- 억지로 매칭하지 마세요
- JSON 형식만 출력하세요`;

export async function POST(req: NextRequest) {
  try {
    const { tagText, tagType, category } = await req.json();

    if (!tagText || !tagType || !category) {
      return NextResponse.json(
        { error: 'tagText, tagType, category가 필요합니다.' },
        { status: 400 }
      );
    }

    if (tagType !== 'pros' && tagType !== 'cons') {
      return NextResponse.json(
        { error: 'tagType은 "pros" 또는 "cons"이어야 합니다.' },
        { status: 400 }
      );
    }

    // Get category attributes
    const categoryAttributes = CATEGORY_ATTRIBUTES[category as Category];
    if (!categoryAttributes || categoryAttributes.length === 0) {
      console.warn(`⚠️ No attributes found for category: ${category}`);
      // Return empty attributes - tag will still be usable in natural language analysis
      return NextResponse.json({
        attributes: {},
        reasoning: 'No attributes defined for this category'
      });
    }

    // Build attributes section for prompt
    const attributesSection = categoryAttributes
      .map(
        (attr) =>
          `- **${attr.key}** (${attr.name}): ${attr.description}\n  예시: ${attr.examples.join(', ')}`
      )
      .join('\n');

    // Build prompt
    const prompt = ANALYZE_TAG_PROMPT
      .replace('{CATEGORY}', category)
      .replace('{ATTRIBUTES}', attributesSection)
      .replace('{TAG_TEXT}', tagText)
      .replace('{TAG_TYPE}', tagType === 'pros' ? '장점' : '단점');

    // Call Gemini
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { temperature: 0.3 }, // Low temperature for classification
    });

    if (!result.text) {
      throw new Error('No response from LLM');
    }

    // Parse JSON response
    let text = result.text.trim();
    if (text.includes('```json')) {
      text = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      text = text.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(text) as {
      attributes: Record<string, number>;
      reasoning?: string;
    };

    // Validate weights (0-1 range)
    const validatedAttributes: Record<string, number> = {};
    const validAttributeKeys = categoryAttributes.map(attr => attr.key);

    Object.entries(parsed.attributes || {}).forEach(([key, weight]) => {
      // Check if attribute exists in category
      if (!validAttributeKeys.includes(key)) {
        console.warn(`⚠️ Invalid attribute key for ${category}: ${key}`);
        return;
      }

      // Validate weight range
      if (weight >= 0 && weight <= 1) {
        validatedAttributes[key] = weight;
      } else {
        console.warn(`⚠️ Invalid weight for ${key}: ${weight}, clamping to 0-1`);
        validatedAttributes[key] = Math.max(0, Math.min(1, weight));
      }
    });

    console.log(`✅ Analyzed custom tag: "${tagText}" (${category}, ${tagType}) → ${Object.keys(validatedAttributes).length} attributes`);

    return NextResponse.json({
      attributes: validatedAttributes,
      reasoning: parsed.reasoning
    });

  } catch (error) {
    console.error('❌ Error analyzing custom tag:', error);

    // Return empty attributes instead of error - tag can still be used in natural language
    return NextResponse.json({
      attributes: {},
      reasoning: 'Failed to analyze tag - will be used in natural language analysis only'
    });
  }
}
