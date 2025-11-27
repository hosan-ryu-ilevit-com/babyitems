require('dotenv').config({ path: '.env.local' });
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("API Key가 없습니다.");

const ai = new GoogleGenAI({ apiKey });

const SPLIT_DIR = path.join(__dirname, "../data/reviews/split");
const OUTPUT_FILE = path.join(__dirname, "../lib/store_ids.json");

// Split files configuration
const splitFilesConfig = {
  'baby_bottle': ['baby_bottle_part1.jsonl', 'baby_bottle_part2.jsonl', 'baby_bottle_part3.jsonl'],
  'baby_play_mat': ['baby_play_mat_part1.jsonl', 'baby_play_mat_part2.jsonl']
};

async function main() {
  // Load existing store_ids.json
  let storeMap = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    storeMap = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    console.log(`📂 기존 Store ID ${Object.keys(storeMap).length}개 로드됨\n`);
  }

  console.log(`🚀 Split 파일 업로드 시작 (2개 카테고리)\n`);

  for (const [category, files] of Object.entries(splitFilesConfig)) {
    console.log(`\n▶️ 카테고리: ${category}`);
    console.log(`   파일: ${files.length}개 파트`);

    try {
      // 1. Create one Store for the category
      console.log(`   🏗️  Store 생성 중...`);
      const store = await ai.fileSearchStores.create({
        config: { displayName: `Store_${category}` }
      });
      console.log(`   ✅ Store 생성 완료: ${store.name}\n`);

      // 2. Upload all parts to the same Store
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filePath = path.join(SPLIT_DIR, file);
        const fileSizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);

        console.log(`   📤 Part ${i + 1}/${files.length}: ${file} (${fileSizeMB} MB)`);

        const uploadStart = Date.now();
        let op = await ai.fileSearchStores.uploadToFileSearchStore({
          file: filePath,
          fileSearchStoreName: store.name,
          config: {
            displayName: file.replace('.jsonl', ''),
            mimeType: "application/json"
          }
        });

        // 3. Poll for completion (1-second interval, 20-minute timeout)
        let pollCount = 0;
        const maxPolls = 1200; // 20분 (1초 × 1200)

        while (!op.done) {
          pollCount++;
          const elapsed = ((Date.now() - uploadStart) / 1000).toFixed(0);

          if (pollCount % 10 === 0) { // 10초마다 로깅
            console.log(`      ⏳ 인덱싱 중... (${elapsed}초 경과)`);
          }

          if (pollCount >= maxPolls) {
            throw new Error(`타임아웃: Part ${i + 1} (20분 초과)`);
          }

          await new Promise(r => setTimeout(r, 1000)); // 1초 대기 (expert recommendation)
          op = await ai.operations.get({ operation: op });
        }

        const totalTime = ((Date.now() - uploadStart) / 1000).toFixed(1);
        console.log(`      ✅ Part ${i + 1} 완료 (${totalTime}초)\n`);
      }

      // 4. Save Store ID after all parts uploaded
      storeMap[category] = store.name;
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(storeMap, null, 2));
      console.log(`   💾 ${category} Store ID 저장 완료!\n`);

    } catch (e) {
      console.error(`❌ 실패: ${category}`, e.message);
      if (e.response) console.error("   Details:", JSON.stringify(e.response, null, 2));
    }
  }

  console.log(`\n🎉 모든 split 파일 업로드 완료!`);
  console.log(`📋 최종 Store 개수: ${Object.keys(storeMap).length}개`);
}

main().catch(console.error);
