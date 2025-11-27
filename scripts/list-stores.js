require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require("@google/genai");
const storeIds = require("../lib/store_ids.json");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("API Key가 없습니다.");

const ai = new GoogleGenAI({ apiKey });

async function listStores() {
  console.log("📋 File Search Stores 목록 확인...\n");

  try {
    // 모든 Store 목록 가져오기
    const stores = await ai.fileSearchStores.list();

    console.log(`총 ${stores.length || 0}개의 Store 발견\n`);

    // store_ids.json의 각 카테고리별로 확인
    for (const [category, storeId] of Object.entries(storeIds)) {
      console.log(`\n📦 ${category}:`);
      console.log(`   Store ID: ${storeId}`);

      // 해당 Store가 목록에 있는지 확인
      const found = stores?.find?.(s => s.name === storeId);
      if (found) {
        console.log(`   ✅ 발견됨`);
        console.log(`   Display Name: ${found.config?.displayName || 'N/A'}`);
        console.log(`   Document Count: ${found.documentCount || 0}`);
        console.log(`   Created: ${found.createTime || 'N/A'}`);
      } else {
        console.log(`   ❌ 목록에서 찾을 수 없음`);
      }
    }

    // 전체 Store 목록 출력
    console.log("\n\n=== 전체 Store 목록 ===");
    if (stores && stores.length > 0) {
      for await (const store of stores) {
        console.log(`\n- ${store.name}`);
        console.log(`  Display: ${store.config?.displayName || 'N/A'}`);
        console.log(`  Documents: ${store.documentCount || 0}`);
      }
    }

  } catch (error) {
    console.error("❌ 에러:", error.message);
    console.error("Stack:", error.stack);
  }
}

listStores().catch(console.error);
