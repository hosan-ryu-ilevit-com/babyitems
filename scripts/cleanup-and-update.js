require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("API Key가 없습니다.");

const ai = new GoogleGenAI({ apiKey });
const OUTPUT_FILE = path.join(__dirname, "../lib/store_ids.json");

async function cleanupAndUpdate() {
  console.log("📋 File Search Store 정리 시작...\n");

  const storesList = await ai.fileSearchStores.list();
  const allStores = [];
  const validStores = [];
  const emptyStores = [];

  // 모든 Store 수집
  for await (const store of storesList) {
    allStores.push(store);
    const docCount = parseInt(store.activeDocumentsCount || 0);

    if (docCount > 0) {
      validStores.push(store);
      console.log(`✅ 유효: ${store.displayName} (문서: ${docCount})`);
    } else {
      emptyStores.push(store);
    }
  }

  console.log(`\n총 ${allStores.length}개 Store 발견`);
  console.log(`✅ 문서 있음: ${validStores.length}개`);
  console.log(`❌ 빈 Store: ${emptyStores.length}개\n`);

  // 빈 Store 삭제
  console.log("🗑️  빈 Store 삭제 중...");
  let deleted = 0;
  for (const store of emptyStores) {
    try {
      await ai.fileSearchStores.delete({
        name: store.name,
        config: { force: true }
      });
      deleted++;
      if (deleted % 10 === 0) {
        console.log(`  진행 중: ${deleted}/${emptyStores.length}...`);
      }
    } catch (e) {
      console.error(`  ⚠️  삭제 실패: ${store.name}`, e.message);
    }
  }
  console.log(`✅ ${deleted}개 Store 삭제 완료\n`);

  // store_ids.json 업데이트
  console.log("📝 store_ids.json 업데이트 중...");
  const storeMap = {};

  // 카테고리 이름 추출 (Store_baby_bottle → baby_bottle)
  validStores.forEach(store => {
    const categoryKey = store.displayName.replace('Store_', '');
    storeMap[categoryKey] = store.name;
    console.log(`  ${categoryKey}: ${store.name}`);
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(storeMap, null, 2));
  console.log(`\n✅ ${Object.keys(storeMap).length}개 Store ID 저장됨: ${OUTPUT_FILE}`);
}

cleanupAndUpdate().catch(console.error);
