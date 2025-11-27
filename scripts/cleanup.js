require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require("@google/genai");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("API Key가 없습니다. .env.local을 확인하세요.");

const ai = new GoogleGenAI({ apiKey });

async function cleanupAll() {
  console.log("🔥 [Gemini File Search] 전체 초기화 시작...\n");

  // 1단계: Store 삭제 (상자 부수기)
  await deleteStores();

  console.log("\n------------------------------------------------\n");

  // 2단계: File 삭제 (알맹이 버리기)
  await deleteFiles();

  console.log("\n✨ 초기화 완료! 이제 깨끗한 상태에서 다시 업로드하세요.");
}

// ---------------------------------------------------------
// Helper 1: 모든 Store 삭제
async function deleteStores() {
  console.log("📦 1. Store 삭제 중...");
  try {
    const listResp = await ai.fileSearchStores.list();
    const stores = listResp.fileSearchStores || [];

    if (stores.length === 0) {
      console.log("   - 삭제할 Store가 없습니다.");
      return;
    }

    console.log(`   - 총 ${stores.length}개의 Store 발견. 삭제 시작!`);

    // 병렬 삭제
    const promises = stores.map(store => 
      ai.fileSearchStores.delete({ name: store.name })
        .then(() => console.log(`   🗑️ Store 삭제됨: ${store.displayName || '이름없음'}`))
        .catch(e => console.error(`   ⚠️ Store 삭제 실패 (${store.displayName}):`, e.message))
    );

    await Promise.all(promises);

  } catch (e) {
    console.error("   ❌ Store 목록 조회 실패:", e.message);
  }
}

// Helper 2: 모든 File 삭제
async function deleteFiles() {
  console.log("📄 2. File 삭제 중...");
  try {
    const listResp = await ai.files.list();
    const files = listResp.files || [];

    if (files.length === 0) {
      console.log("   - 삭제할 File이 없습니다.");
      return;
    }

    console.log(`   - 총 ${files.length}개의 File 발견. 삭제 시작!`);

    // 병렬 삭제
    const promises = files.map(file => 
      ai.files.delete({ name: file.name })
        .then(() => console.log(`   🗑️ File 삭제됨: ${file.displayName}`))
        .catch(e => console.error(`   ⚠️ File 삭제 실패 (${file.displayName}):`, e.message))
    );

    await Promise.all(promises);

  } catch (e) {
    console.error("   ❌ File 목록 조회 실패:", e.message);
  }
}

cleanupAll();