require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("API Key가 없습니다.");

const ai = new GoogleGenAI({ apiKey });

async function listAndCleanup() {
  console.log("📋 모든 File Search Store 목록 조회 중...\n");

  const storesList = await ai.fileSearchStores.list();
  const stores = [];

  for await (const store of storesList) {
    stores.push(store);
    console.log(`- ${store.displayName || 'Unnamed'}`);
    console.log(`  ID: ${store.name}`);
    console.log(`  생성일: ${store.createTime}`);
    console.log(`  문서 수: ${store.activeDocumentsCount || 0}\n`);
  }

  console.log(`\n총 ${stores.length}개 Store 발견`);

  // 중복 Store 찾기 (같은 displayName)
  const nameMap = new Map();
  stores.forEach(store => {
    const name = store.displayName || 'Unnamed';
    if (!nameMap.has(name)) {
      nameMap.set(name, []);
    }
    nameMap.get(name).push(store);
  });

  console.log("\n⚠️  중복 Store 분석:");
  for (const [name, storeList] of nameMap.entries()) {
    if (storeList.length > 1) {
      console.log(`\n"${name}": ${storeList.length}개 중복 발견`);
      storeList.forEach((s, idx) => {
        console.log(`  ${idx + 1}. ${s.name} (생성: ${s.createTime})`);
      });
    }
  }

  // 삭제 여부는 수동으로 결정하도록 주석 처리
  // 필요시 아래 코드 활성화
  /*
  console.log("\n🗑️  중복 Store 삭제 중...");
  for (const [name, storeList] of nameMap.entries()) {
    if (storeList.length > 1) {
      // 가장 오래된 것만 남기고 나머지 삭제
      const sorted = storeList.sort((a, b) => new Date(a.createTime) - new Date(b.createTime));
      for (let i = 1; i < sorted.length; i++) {
        try {
          await ai.fileSearchStores.delete({
            name: sorted[i].name,
            config: { force: true }
          });
          console.log(`✅ 삭제됨: ${sorted[i].name}`);
        } catch (e) {
          console.error(`❌ 삭제 실패: ${sorted[i].name}`, e.message);
        }
      }
    }
  }
  */
}

listAndCleanup().catch(console.error);
