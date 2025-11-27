require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require("@google/genai");
const storeIds = require("../lib/store_ids.json");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("API Key가 없습니다.");

const ai = new GoogleGenAI({ apiKey });

async function verifyFileSearch() {
  console.log("🔍 File Search Store 검증 시작...\n");

  // 1. Store에 문서가 있는지 확인
  const category = "milk_powder_port";
  const storeId = storeIds[category];

  console.log(`📦 Store ID: ${storeId}`);

  try {
    // Store 정보 가져오기
    console.log("\n=== Store 정보 확인 ===");
    const store = await ai.fileSearchStores.get(storeId);
    console.log("Store name:", store.name);
    console.log("Display name:", store.config?.displayName);
    console.log("Document count:", store.documentCount);

    // 2. File Search API 응답의 전체 구조 확인
    console.log("\n=== API 응답 구조 확인 ===");
    const result = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: '보르르 분유포트 리뷰를 보여주세요',
      config: {
        temperature: 0.1,
        fileSearchStores: [storeId],
      },
    });

    console.log("\n📄 Response object keys:");
    console.log(Object.keys(result));

    console.log("\n📄 Full response object:");
    console.log(JSON.stringify(result, null, 2));

    // 3. Grounding metadata 확인
    if (result.response) {
      console.log("\n📄 Response.candidates:");
      console.log(JSON.stringify(result.response.candidates, null, 2));
    }

    // 4. File Search 없이 비교
    console.log("\n=== File Search 없이 동일한 쿼리 ===");
    const resultNoFS = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: '보르르 분유포트 리뷰를 보여주세요',
      config: {
        temperature: 0.1,
      },
    });

    console.log("응답 (File Search 없음):");
    console.log(resultNoFS.text.substring(0, 300));

    console.log("\n응답 (File Search 있음):");
    console.log(result.text.substring(0, 300));

    console.log("\n=== 두 응답이 같은가? ===");
    console.log(resultNoFS.text === result.text ? "❌ 동일함 (File Search가 작동하지 않음)" : "✅ 다름 (File Search가 작동함)");

  } catch (error) {
    console.error("❌ 에러:", error);
    console.error("Stack:", error.stack);
  }
}

verifyFileSearch().catch(console.error);
