const fs = require('fs');
const path = require('path');
const readline = require('readline');

const REVIEWS_DIR = path.join(__dirname, "../data/reviews");
const MAX_SIZE_MB = 5; // 5MB per chunk
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

async function splitFile(inputPath) {
  const fileSize = fs.statSync(inputPath).size;
  const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);

  console.log(`\n📄 ${path.basename(inputPath)} (${fileSizeMB} MB)`);

  if (fileSize <= MAX_SIZE_BYTES) {
    console.log(`   ✅ 분할 불필요 (5MB 이하)`);
    return;
  }

  const basename = path.basename(inputPath, '.jsonl');
  const outputDir = path.join(REVIEWS_DIR, 'split');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let partNum = 1;
  let currentSize = 0;
  let lines = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const lineSize = Buffer.byteLength(line + '\n', 'utf8');

    if (currentSize + lineSize > MAX_SIZE_BYTES && lines.length > 0) {
      // Write current chunk
      const outputPath = path.join(outputDir, `${basename}_part${partNum}.jsonl`);
      fs.writeFileSync(outputPath, lines.join('\n') + '\n');
      console.log(`   ✅ Part ${partNum}: ${(currentSize / (1024 * 1024)).toFixed(2)} MB (${lines.length} lines)`);

      partNum++;
      currentSize = 0;
      lines = [];
    }

    lines.push(line);
    currentSize += lineSize;
  }

  // Write remaining lines
  if (lines.length > 0) {
    const outputPath = path.join(outputDir, `${basename}_part${partNum}.jsonl`);
    fs.writeFileSync(outputPath, lines.join('\n') + '\n');
    console.log(`   ✅ Part ${partNum}: ${(currentSize / (1024 * 1024)).toFixed(2)} MB (${lines.length} lines)`);
  }

  console.log(`   📦 총 ${partNum}개 파일로 분할 완료`);
}

async function main() {
  console.log("🔪 대용량 JSONL 파일 분할 시작...");

  const files = [
    'baby_bottle.jsonl',
    'baby_play_mat.jsonl'
  ];

  for (const file of files) {
    const filePath = path.join(REVIEWS_DIR, file);
    if (fs.existsSync(filePath)) {
      await splitFile(filePath);
    } else {
      console.log(`⚠️  파일 없음: ${file}`);
    }
  }

  console.log("\n🎉 분할 완료!");
}

main().catch(console.error);
