import { GoogleGenAI } from '@google/genai';
import { Category } from '@/lib/data';
import { getSpecsByCategory, getTopByPopularity } from '@/lib/data/specLoader';
import { getReviewsForMultipleProducts, sampleBalancedBySentiment, formatReviewsForLLM } from '@/lib/review';
import fs from 'fs';
import path from 'path';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

interface CategoryAttribute {
  key: string;
  name: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  examples: string[];
}

const ATTRIBUTE_EXTRACTION_PROMPT = `당신은 제품 카테고리 분석 전문가입니다.
다음은 {CATEGORY} 카테고리의 인기 제품 20개에 대한 실제 사용자 리뷰 70개입니다.
이 리뷰들을 종합적으로 분석하여 이 카테고리 제품을 평가할 때
**가장 중요한 핵심 속성 5-9개**를 추출해주세요.

**리뷰 데이터 (고평점 40개 + 저평점 30개):**
{REVIEWS}

**추출 기준:**
1. **빈도수 분석**: 리뷰에서 자주 언급되는 특징
2. **만족도 영향**: 사용자 만족도에 큰 영향을 미치는 요소
3. **공통 평가 기준**: 장점/단점 모두에서 공통적으로 평가되는 기준
4. **범주적이지만 구체적**:
   - ✅ 좋은 예: "온도 조절", "주행성", "안전성", "세척 편의성"
   - ❌ 나쁜 예: "편리함", "품질", "디자인" (너무 추상적)
5. **측정/비교 가능**: 다른 제품과 비교할 수 있는 특성

**출력 형식 (JSON):**
\`\`\`json
{
  "attributes": [
    {
      "key": "temperature_control",
      "name": "온도 조절",
      "description": "물 온도를 정확하게 설정하고 유지하는 능력 (정밀도, 속도, 안정성 포함)",
      "importance": "high",
      "examples": ["1도 단위 조절", "빠른 냉각", "24시간 보온", "자동 분유모드"]
    },
    {
      "key": "hygiene",
      "name": "위생/세척",
      "description": "청소와 위생 관리의 용이성 (입구 크기, 분리 가능 여부, 재질)",
      "importance": "high",
      "examples": ["넓은 입구", "분리형 뚜껑", "스테인리스 소재", "이음새 없는 구조"]
    }
  ]
}
\`\`\`

**중요 규칙:**
- 속성 5-9개 추출 (카테고리 특성에 따라 유연하게)
  - importance: high (3-5개), medium (2-4개), low (0-1개)
- key는 영문 snake_case (예: temperature_control, ease_of_use)
- description에는 하위 평가 요소를 구체적으로 명시
- examples에는 리뷰에서 자주 언급된 구체적 특징 4-6개
- 반드시 JSON 형식만 출력`;

async function extractCategoryAttributes(category: Category): Promise<CategoryAttribute[]> {
  console.log(`\n🔍 Extracting attributes for category: ${category}`);

  // 1. Top 20 제품 선택 (랭킹 + 리뷰 많은 순)
  const allSpecs = await getSpecsByCategory(category);
  const topProducts = getTopByPopularity(allSpecs, 20);
  console.log(`  ✓ Selected top 20 products`);

  // 2. 리뷰 로드 및 샘플링 (고평점 40 + 저평점 30)
  const productIds = topProducts.map(p => String(p.productId));
  const reviewsMap = await getReviewsForMultipleProducts(category, productIds);
  // Flatten Map<string, Review[]> to Review[]
  const allReviews = Array.from(reviewsMap.values()).flat();
  const { high, low } = sampleBalancedBySentiment(allReviews, 40, 30);
  console.log(`  ✓ Sampled ${high.length} high + ${low.length} low reviews from 20 products`);

  // 3. 리뷰 포맷팅
  const reviewsText = formatReviewsForLLM([...high, ...low], 60000);
  console.log(`  ✓ Formatted reviews: ${reviewsText.length} chars`);

  // 4. LLM 호출
  console.log(`  🤖 Calling Gemini 3 Pro Preview...`);
  const prompt = ATTRIBUTE_EXTRACTION_PROMPT
    .replace('{CATEGORY}', category)
    .replace('{REVIEWS}', reviewsText);

  const result = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: { temperature: 0.2 },
  });

  if (!result.text) {
    throw new Error('No text returned from LLM');
  }

  // 5. JSON 파싱
  let text = result.text.trim();
  if (text.includes('```json')) {
    text = text.split('```json')[1].split('```')[0].trim();
  } else if (text.includes('```')) {
    text = text.split('```')[1].split('```')[0].trim();
  }

  const parsed = JSON.parse(text) as { attributes: CategoryAttribute[] };
  console.log(`  ✓ Extracted ${parsed.attributes.length} attributes`);

  return parsed.attributes;
}

async function main() {
  const categories: Category[] = [
    'baby_bottle',
    'baby_bottle_sterilizer',
    'baby_formula_dispenser',
    'baby_monitor',
    'baby_play_mat',
    'nasal_aspirator',
    'thermometer'
  ];
  const results: Record<Category, CategoryAttribute[]> = {} as any;

  console.log('🚀 Starting category attribute extraction...\n');
  console.log(`Categories to process: ${categories.join(', ')}\n`);

  for (const category of categories) {
    try {
      const startTime = Date.now();
      const attributes = await extractCategoryAttributes(category);
      results[category] = attributes;
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(`\n📊 Attributes for ${category} (${duration}s):`);
      attributes.forEach(attr => {
        console.log(`  - ${attr.name} (${attr.key}) [${attr.importance}]`);
        console.log(`    ${attr.description}`);
        console.log(`    Examples: ${attr.examples.join(', ')}`);
      });

      // 2초 대기 (rate limit 방지)
      if (categories.indexOf(category) < categories.length - 1) {
        console.log('\n⏳ Waiting 2 seconds before next category...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`\n❌ Failed to extract attributes for ${category}:`, error);
      // 실패해도 계속 진행
    }
  }

  // 6. 파일로 저장
  const outputPath = path.join(process.cwd(), 'data', 'categoryAttributes.ts');
  const content = `// Auto-generated by scripts/extractCategoryAttributes.ts
// Generated at: ${new Date().toISOString()}
// Do not edit manually

import { Category } from '@/lib/data';

export interface CategoryAttribute {
  key: string;
  name: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  examples: string[];
}

export const CATEGORY_ATTRIBUTES: Record<Category, CategoryAttribute[]> = ${JSON.stringify(results, null, 2)} as const;
`;

  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(`\n✅ Saved to: ${outputPath}`);
  console.log('\n🎉 All categories processed successfully!');
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
