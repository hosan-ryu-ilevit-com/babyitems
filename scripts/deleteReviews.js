const fs = require("fs");
const path = require("path");

const specsDir = "./data/specs/";
const files = fs.readdirSync(specsDir).filter(f => f.endsWith(".json") && !f.includes("backup"));

let totalDeleted = 0;
let results = [];

files.forEach(file => {
  const filePath = path.join(specsDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const originalCount = data.length;
  const filtered = data.filter(p => p.reviewCount === undefined || p.reviewCount > 9);
  const deletedCount = originalCount - filtered.length;

  if (deletedCount > 0) {
    fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2), "utf8");
    results.push({ file, originalCount, newCount: filtered.length, deletedCount });
    totalDeleted += deletedCount;
  }
});

console.log("=== 삭제 완료 ===\n");
results.forEach(r => {
  console.log(`✅ ${r.file}`);
  console.log(`   ${r.originalCount}개 → ${r.newCount}개 (삭제: ${r.deletedCount}개)\n`);
});

console.log(`총 ${totalDeleted}개 제품이 삭제되었습니다.`);
