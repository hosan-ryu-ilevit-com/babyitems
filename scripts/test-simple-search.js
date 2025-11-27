require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require("@google/genai");
const storeIds = require("../lib/store_ids.json");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("API Key가 없습니다.");

const ai = new GoogleGenAI({ apiKey });

async function testSimpleSearch() {
  const category = "milk_powder_port";
  const storeId = storeIds[category];

  console.log(`🔍 Testing File Search Store: ${storeId}\n`);

  const queries = [
    "Tell me about the reviews in your knowledge base",
    "What reviews do you have access to?",
    "분유포트 리뷰가 있나요?",
    "보르르 분유포트에 대한 리뷰를 보여주세요"
  ];

  for (const query of queries) {
    console.log(`\n📝 Query: ${query}`);
    try {
      const result = await ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: query,
        config: {
          temperature: 0.1,
          fileSearchStores: [storeId],
        },
      });

      const text = result.text;
      console.log(`✅ Response (${text.length} chars):`);
      console.log(text.substring(0, 300) + '...\n');
    } catch (err) {
      console.error(`❌ Error:`, err.message);
    }
  }
}

testSimpleSearch().catch(console.error);
