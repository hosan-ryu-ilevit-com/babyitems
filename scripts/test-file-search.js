require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require("@google/genai");
const storeIds = require("../lib/store_ids.json");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("API Key가 없습니다.");

const ai = new GoogleGenAI({ apiKey });

async function testFileSearch() {
  console.log("🔍 File Search API 테스트 시작...\n");

  // Test with milk_powder_port category
  const category = "milk_powder_port";
  const storeId = storeIds[category];
  const testProductId = "7342144886"; // 보르르 분유포트

  console.log(`📦 카테고리: ${category}`);
  console.log(`📦 Store ID: ${storeId}`);
  console.log(`📦 제품 ID: ${testProductId}\n`);

  try {
    // Try different query approaches
    const queries = [
      `custom_metadata.productId가 "${testProductId}"인 리뷰를 찾아주세요`,
      `제품ID "${testProductId}"의 리뷰를 검색해주세요`,
      `productId: ${testProductId}`,
    ];

    for (let i = 0; i < queries.length; i++) {
      console.log(`\n=== 쿼리 ${i + 1} 테스트 ===`);
      console.log(`쿼리: ${queries[i]}`);

      try {
        const result = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: queries[i],
          config: {
            temperature: 0.3,
            tools: [
              {
                fileSearch: {
                  fileSearchStoreNames: [storeId]
                }
              }
            ]
          },
        });

        const text = result.text;

        console.log(`✅ 성공! 응답 길이: ${text.length} chars`);
        console.log(`응답 미리보기:\n${text.substring(0, 200)}...\n`);
      } catch (err) {
        console.error(`❌ 실패:`, err.message);
        if (err.response) {
          console.error(`   상세: ${JSON.stringify(err.response, null, 2)}`);
        }
      }
    }
  } catch (error) {
    console.error("❌ 테스트 실패:", error);
  }
}

testFileSearch().catch(console.error);
