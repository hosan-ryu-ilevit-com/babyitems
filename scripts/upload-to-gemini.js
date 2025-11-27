require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("API Key가 없습니다.");

const ai = new GoogleGenAI({ apiKey });

const REVIEWS_DIR = path.join(__dirname, "../data/reviews");
const OUTPUT_FILE = path.join(__dirname, "../lib/store_ids.json");

async function main() {
  const files = fs.readdirSync(REVIEWS_DIR).filter(f => f.endsWith('.jsonl'));

  // 기존 store_ids.json 로드 (있으면)
  let storeMap = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    storeMap = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    console.log(`📂 기존 Store ID ${Object.keys(storeMap).length}개 로드됨\n`);
  }

  // 이미 완료된 파일 제외
  const pendingFiles = files.filter(f => !storeMap[f.replace('.jsonl', '')]);
  const skippedCount = files.length - pendingFiles.length;

  if (skippedCount > 0) {
    console.log(`⏭️  이미 완료된 ${skippedCount}개 파일 스킵\n`);
  }

  console.log(`🚀 총 ${pendingFiles.length}개 파일 순차 업로드 시작...\n`);

  // 순차 실행으로 변경 (API rate limit 방지)
  for (const file of pendingFiles) {
    const categoryKey = file.replace('.jsonl', '');
    const safeName = categoryKey.replace(/_/g, '-');

    const filePath = path.join(REVIEWS_DIR, file);
    const fileSizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);

    console.log(`▶️ 시작: ${categoryKey} (${fileSizeMB} MB)`);

    try {
      // 1. Store 생성
      const store = await ai.fileSearchStores.create({
        config: { displayName: `Store_${categoryKey}` }
      });

      // 2. 파일 업로드 + Import
      const uploadStart = Date.now();
      let op = await ai.fileSearchStores.uploadToFileSearchStore({
        file: filePath,
        fileSearchStoreName: store.name,
        config: {
            displayName: `file-${safeName}`,
            mimeType: "application/json"
        }
      });

      // 3. 인덱싱 대기 (Polling)
      let pollCount = 0;
      const maxPolls = 300; // 10분 타임아웃 (2초 × 300)

      while (!op.done) {
        pollCount++;
        const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(0);

        if (pollCount % 5 === 0) { // 10초마다 로깅
          console.log(`   ⏳ ${categoryKey}: 인덱싱 중... (${elapsed}초 경과, ${fileSizeMB} MB)`);
        }

        if (pollCount >= maxPolls) {
          throw new Error(`타임아웃: ${categoryKey} (10분 초과)`);
        }

        await new Promise(r => setTimeout(r, 2000)); // 2초 대기
        op = await ai.operations.get({ operation: op });
      }

      const totalTime = ((Date.now() - uploadStart) / 1000).toFixed(1);
      console.log(`✅ 완료: ${categoryKey} (${totalTime}초, ${fileSizeMB} MB, Store ID: ${store.name})\n`);

      // 즉시 파일에 저장 (다른 파일 실패해도 이건 보존됨)
      storeMap[categoryKey] = store.name;
      if (!fs.existsSync(path.dirname(OUTPUT_FILE))) {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
      }
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(storeMap, null, 2));

    } catch (e) {
      console.error(`❌ 실패: ${categoryKey}`, e.message);
      // 에러 상세 정보 출력
      if(e.response) console.error("   Details:", JSON.stringify(e.response, null, 2));
      console.log(''); // 빈 줄
    }
  }

  console.log(`🎉 최종 완료! ID 맵 저장됨: ${OUTPUT_FILE}`);
}

main();