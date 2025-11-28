import { GoogleGenAI } from '@google/genai';
import { Category } from '@/lib/data';
import { getSpecsByCategory } from '@/lib/data/specLoader';
import { getReviewsForProduct, sampleBalancedBySentiment, formatReviewsForLLM } from '@/lib/review';
import { CATEGORY_ATTRIBUTES, CategoryAttribute } from '@/data/categoryAttributes';
import fs from 'fs';
import path from 'path';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error('GEMINI_API_KEY is required');

const ai = new GoogleGenAI({ apiKey });

interface AttributeScoreResult {
  productId: string;
  attributeScores: Record<string, number | null>; // 0-100 scale, null if insufficient data
}

const ATTRIBUTE_SCORING_PROMPT = `당신은 제품 속성 평가 전문가입니다.
다음은 "{PRODUCT_NAME}" 제품의 실제 사용자 리뷰와 제품 스펙입니다.
이 정보들을 분석하여 각 속성별로 제품의 성능을 0-100 점수로 평가해주세요.

**제품 기본 정보:**
- 브랜드: {BRAND}
- 모델명: {MODEL_NAME}
- 가격: {PRICE}원

**제품 스펙:**
{SPECS}

**리뷰 데이터 (총 {REVIEW_COUNT}개 - 고평점 + 저평점 혼합):**
{REVIEWS}

**평가할 속성 (카테고리: {CATEGORY}):**
{ATTRIBUTES}

**출력 형식 (JSON):**
\`\`\`json
{
  "attributeScores": {
    "attribute_key_1": 85,
    "attribute_key_2": null,
    "attribute_key_3": 42
  },
  "reasoning": {
    "attribute_key_1": "리뷰에서 이 속성에 대한 긍정적 언급이 많음. 구체적 예시...",
    "attribute_key_2": "리뷰에서 이 속성에 대한 언급이 충분하지 않아 평가 불가",
    "attribute_key_3": "중간 수준. 긍정도 있지만 부정 의견도 있음..."
  }
}
\`\`\`

**평가 기준:**
1. **리뷰 기반 평가 (최우선)**: 실제 리뷰에서 해당 속성에 대한 언급을 분석하세요
   - 긍정적 언급이 많으면 높은 점수
   - 부정적 언급이 많으면 낮은 점수
   - **언급이 충분하지 않으면 null 처리** (추측하지 마세요)

2. **스펙 보조 활용**: 스펙은 리뷰를 보완하는 용도로만 사용하세요
   - 리뷰에서 언급된 내용을 스펙으로 확인/검증
   - 객관적 수치 확인 (용량, 크기, 재질 등)
   - **리뷰 없으면 스펙만으로 추측하지 말고 null 처리**

3. **점수 분포 원칙 (매우 중요)**:
   - **0-100 전체 범위를 적극 활용**하세요
   - **모든 속성이 비슷한 점수를 받지 않도록** 차별화하세요
   - 상대적 강점/약점을 명확히 드러내는 점수를 부여하세요

4. **점수 기준 (엄격하게 적용)**:
   - **85-100**: 경쟁 제품 대비 뚜렷한 강점, 리뷰에서 극찬 ("최고", "완벽", "감동")
   - **70-84**: 우수한 수준, 긍정 의견 많고 단점 거의 없음
   - **50-69**: 평균 수준, 특별히 좋거나 나쁘지 않음 (대부분 제품이 이 범위)
   - **30-49**: 개선 필요, 리뷰에서 단점 언급 많음
   - **0-29**: 심각한 결함, 불만이 지배적 ("최악", "환불", "후회")

5. **주의사항**:
   - 90점 이상은 정말 탁월한 경우만 부여하세요
   - 대부분 제품은 40-80 범위에 분포합니다
   - 속성마다 점수가 다르게 나와야 합니다 (모두 70점대 X)

6. **null 처리**:
   - 리뷰에서 해당 속성에 대한 언급이 2개 미만이면 null
   - 언급이 있어도 너무 모호하거나 일반적이면 null

7. **reasoning**: 각 점수의 근거를 1-2문장으로 설명하세요

**중요**: 반드시 JSON 형식만 출력하세요.`;

/**
 * Calculate attribute scores for a single product
 */
async function calculateProductAttributeScores(
  category: Category,
  productId: string,
  attributes: CategoryAttribute[]
): Promise<AttributeScoreResult | null> {
  try {
    // Load product spec
    const allSpecs = await getSpecsByCategory(category);
    const productSpec = allSpecs.find(p => String(p.productId) === String(productId));

    if (!productSpec) {
      console.error(`  ❌ Product ${productId} not found in specs`);
      return null;
    }

    // Load reviews
    const allReviews = await getReviewsForProduct(category, String(productId));

    if (allReviews.length === 0) {
      console.warn(`  ⚠️ Product ${productId} has no reviews - setting all scores to null`);
      // No reviews: All attributes get null (cannot evaluate)
      const attributeScores: Record<string, number | null> = {};
      attributes.forEach(attr => {
        attributeScores[attr.key] = null;
      });
      return { productId, attributeScores };
    }

    // Sample reviews (high + low for balanced view)
    const sampleSize = Math.min(allReviews.length, 50);
    const highCount = Math.ceil(sampleSize * 0.6); // 60% high-rating
    const lowCount = sampleSize - highCount; // 40% low-rating
    const { high, low } = sampleBalancedBySentiment(allReviews, highCount, lowCount);
    const sampledReviews = [...high, ...low];
    const reviewsText = formatReviewsForLLM(sampledReviews, 40000);

    // Build specs section
    const specsSection = Object.entries(productSpec)
      .filter(([key, value]) =>
        value !== null &&
        value !== undefined &&
        !['productId', '브랜드', '모델명', '최저가', '총점', 'popularityScore', 'attributeScores'].includes(key)
      )
      .map(([key, value]) => `- ${key}: ${value}`)
      .join('\n');

    // Build attributes section
    const attributesSection = attributes.map(attr => `
**${attr.name} (${attr.key})**
- 설명: ${attr.description}
- 중요도: ${attr.importance}
- 예시: ${attr.examples.join(', ')}`).join('\n');

    // Build prompt
    const prompt = ATTRIBUTE_SCORING_PROMPT
      .replace('{PRODUCT_NAME}', productSpec.모델명 || 'Unknown')
      .replace('{BRAND}', productSpec.브랜드 || 'Unknown')
      .replace('{MODEL_NAME}', productSpec.모델명 || 'Unknown')
      .replace('{PRICE}', productSpec.최저가?.toLocaleString() || 'N/A')
      .replace('{SPECS}', specsSection || '(스펙 정보 없음)')
      .replace('{REVIEW_COUNT}', sampledReviews.length.toString())
      .replace('{REVIEWS}', reviewsText)
      .replace('{CATEGORY}', category)
      .replace('{ATTRIBUTES}', attributesSection);

    // Call Gemini
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite', // Fast and cheap for bulk scoring
      contents: prompt,
      config: { temperature: 0.2 }, // Low temperature for consistency
    });

    if (!result.text) {
      throw new Error('No text returned from LLM');
    }

    // Parse JSON
    let text = result.text.trim();
    if (text.includes('```json')) {
      text = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      text = text.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(text) as {
      attributeScores: Record<string, number | null>;
      reasoning: Record<string, string>;
    };

    // Validate scores (0-100 range or null)
    Object.keys(parsed.attributeScores).forEach(key => {
      const score = parsed.attributeScores[key];
      if (score !== null) {
        if (score < 0 || score > 100) {
          console.warn(`  ⚠️ Invalid score for ${key}: ${score}, clamping to 0-100`);
          parsed.attributeScores[key] = Math.max(0, Math.min(100, score));
        }
      }
    });

    // Ensure all attributes have scores (number or null)
    attributes.forEach(attr => {
      if (parsed.attributeScores[attr.key] === undefined) {
        console.warn(`  ⚠️ Missing score for ${attr.key}, defaulting to null`);
        parsed.attributeScores[attr.key] = null;
      }
    });

    console.log(`  ✓ Scored: ${Object.entries(parsed.attributeScores).map(([k, v]) => `${k}:${v}`).join(', ')}`);

    return {
      productId,
      attributeScores: parsed.attributeScores,
    };
  } catch (error) {
    console.error(`  ❌ Failed to score product ${productId}:`, error);
    return null;
  }
}

/**
 * Update product spec JSON file with attribute scores
 */
async function updateProductSpecFile(
  category: Category,
  productId: string,
  attributeScores: Record<string, number | null>
): Promise<void> {
  try {
    const specFilePath = path.join(
      process.cwd(),
      'data',
      'specs',
      `${category}.json`
    );

    if (!fs.existsSync(specFilePath)) {
      console.error(`  ❌ Spec JSON file not found: ${specFilePath}`);
      return;
    }

    // Read JSON file
    const content = fs.readFileSync(specFilePath, 'utf-8');
    const products = JSON.parse(content);

    // Find product and update attributeScores
    const productIndex = products.findIndex((p: any) => String(p.productId) === String(productId));

    if (productIndex === -1) {
      console.warn(`  ⚠️ Product ${productId} not found in ${category}.json`);
      return;
    }

    products[productIndex].attributeScores = attributeScores;

    // Write back to JSON file
    fs.writeFileSync(specFilePath, JSON.stringify(products, null, 2), 'utf-8');
    console.log(`  ✓ Updated ${category}.json for product ${productId}`);
  } catch (error) {
    console.error(`  ❌ Failed to update spec file for ${productId}:`, error);
  }
}

/**
 * Calculate attribute scores for all products in a category
 */
async function calculateCategoryScores(category: Category): Promise<void> {
  console.log(`\n🔍 Processing category: ${category}`);

  // Get category attributes
  const attributes = CATEGORY_ATTRIBUTES[category];
  if (!attributes || attributes.length === 0) {
    console.error(`  ❌ No attributes defined for ${category} - run extractCategoryAttributes first!`);
    return;
  }

  console.log(`  ✓ Found ${attributes.length} attributes: ${attributes.map(a => a.key).join(', ')}`);

  // Get all products
  const allSpecs = await getSpecsByCategory(category);
  console.log(`  ✓ Found ${allSpecs.length} products`);

  // Process products in batches to avoid rate limits
  const batchSize = 5;
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < allSpecs.length; i += batchSize) {
    const batch = allSpecs.slice(i, i + batchSize);
    console.log(`\n  📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allSpecs.length / batchSize)} (${batch.length} products):`);

    const results = await Promise.all(
      batch.map(product =>
        calculateProductAttributeScores(category, String(product.productId), attributes)
      )
    );

    // Update spec files
    for (const result of results) {
      if (result) {
        await updateProductSpecFile(category, result.productId, result.attributeScores);
        successCount++;
      } else {
        failCount++;
      }
    }

    // Rate limit delay (2 seconds between batches)
    if (i + batchSize < allSpecs.length) {
      console.log(`\n  ⏳ Waiting 2 seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`\n  ✅ Category ${category} completed: ${successCount} success, ${failCount} failed`);
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

  console.log('🚀 Starting attribute score calculation...\n');
  console.log(`Categories to process: ${categories.join(', ')}\n`);

  for (const category of categories) {
    try {
      const startTime = Date.now();
      await calculateCategoryScores(category);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n⏱️  ${category} completed in ${duration}s`);

      // Delay between categories (5 seconds)
      if (categories.indexOf(category) < categories.length - 1) {
        console.log('\n⏳ Waiting 5 seconds before next category...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`\n❌ Failed to process category ${category}:`, error);
      // Continue to next category
    }
  }

  console.log('\n🎉 All categories processed successfully!');
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
