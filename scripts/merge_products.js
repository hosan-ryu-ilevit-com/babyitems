const fs = require('fs');
const path = require('path');

// 카테고리 매핑
const CATEGORY_MAP = {
  'thermometer': { name: '체온계', key: 'thermometer' },
  'baby_bottle': { name: '젖병', key: 'baby_bottle' },
  'milk_powder_port': { name: '분유포트', key: 'milk_powder_port' },
  'baby_play_mat': { name: '놀이매트', key: 'baby_play_mat' },
  'nasal_aspirator': { name: '콧물흡입기', key: 'nasal_aspirator' },
  'car_seat': { name: '카시트', key: 'car_seat' },
  'baby_bottle_sterilizer': { name: '젖병소독기', key: 'baby_bottle_sterilizer' },
  'baby_monitor': { name: '베이비모니터', key: 'baby_monitor' },
  'baby_formula_dispenser': { name: '분유제조기', key: 'baby_formula_dispenser' }
};

// 가격 파싱 (문자열 → 숫자)
function parsePrice(priceStr) {
  if (typeof priceStr === 'number') return priceStr;
  if (!priceStr) return 0;
  return parseInt(priceStr.toString().replace(/[,원]/g, '')) || 0;
}

// 가격범위 계산
function getPriceRange(price) {
  const p = parseInt(price);
  if (p < 10000) return '0~1';
  if (p < 20000) return '1~2';
  if (p < 30000) return '2~3';
  if (p < 40000) return '3~4';
  if (p < 50000) return '4~5';
  if (p < 60000) return '5~6';
  if (p < 70000) return '6~7';
  if (p < 80000) return '7~8';
  if (p < 90000) return '8~9';
  if (p < 100000) return '9~10';
  return '10+';
}

// CSV 제품 → specs JSON 형식 변환
function transformProduct(csvProduct) {
  const categoryKey = csvProduct.category;
  const categoryInfo = CATEGORY_MAP[categoryKey];

  if (!categoryInfo) {
    console.warn(`Unknown category: ${categoryKey}`);
    return null;
  }

  const price = parsePrice(csvProduct.price);

  return {
    "카테고리": categoryInfo.name,
    "카테고리키": categoryInfo.key,
    "브랜드": csvProduct.brand || "-",
    "제품명": csvProduct.title || "-",
    "모델명": csvProduct.title || "-",
    "최저가": price,
    "가격범위": getPriceRange(price),
    "썸네일": csvProduct.thumbnail || "",
    "픽타입": "none",
    "총점": 0,
    "순위": 0,
    "총제품수": 0,
    "요약": null,
    "사이즈": null,
    "소비전력": null,
    "컬러": null,
    "검색어": csvProduct.title || "",
    "productId": parseInt(csvProduct.productId),
    "specs": {}
  };
}

// 메인 함수
function processProducts(dryRun = true) {
  console.log('🔄 제품 병합 스크립트 시작...\n');
  console.log('모드:', dryRun ? '드라이런 (실제 파일 수정 안 함)' : '실제 병합');
  console.log('='.repeat(70));

  // 1. 새 제품 JSONL 로드
  const newProductsPath = '/Users/levit/Desktop/babyitem_MVP/제품추가 최종 1202.jsonl';
  const newLines = fs.readFileSync(newProductsPath, 'utf8').trim().split('\n');

  console.log('\n📥 새 제품 파일 로드:');
  console.log(`  파일: ${path.basename(newProductsPath)}`);
  console.log(`  총 라인: ${newLines.length}개`);

  // 2. 카테고리별 그룹핑
  const categoryProducts = new Map();
  const stats = {
    total: newLines.length,
    transformed: 0,
    skipped: 0,
    byCategory: {}
  };

  for (const line of newLines) {
    const csvProduct = JSON.parse(line);
    const transformed = transformProduct(csvProduct);

    if (!transformed) {
      stats.skipped++;
      continue;
    }

    const categoryKey = transformed['카테고리키'];

    if (!categoryProducts.has(categoryKey)) {
      categoryProducts.set(categoryKey, []);
      stats.byCategory[categoryKey] = { new: 0, existing: 0, overlap: 0 };
    }

    categoryProducts.get(categoryKey).push(transformed);
    stats.byCategory[categoryKey].new++;
    stats.transformed++;
  }

  console.log('\n✅ 변환 완료:');
  console.log(`  변환된 제품: ${stats.transformed}개`);
  console.log(`  스킵된 제품: ${stats.skipped}개`);

  // 3. 기존 제품과 비교
  console.log('\n📊 카테고리별 분석:\n');

  const mergeResults = new Map();

  for (const [categoryKey, newProducts] of categoryProducts) {
    const specsPath = `/Users/levit/Desktop/babyitem_MVP/data/specs/${categoryKey}.json`;

    let existingProducts = [];
    if (fs.existsSync(specsPath)) {
      existingProducts = JSON.parse(fs.readFileSync(specsPath, 'utf8'));
    }

    const existingIds = new Set(existingProducts.map(p => p.productId));
    const newIds = new Set(newProducts.map(p => p.productId));
    const overlapIds = new Set([...newIds].filter(id => existingIds.has(id)));

    stats.byCategory[categoryKey].existing = existingProducts.length;
    stats.byCategory[categoryKey].overlap = overlapIds.size;

    // 중복 제거: 기존에 없는 제품만
    const toAdd = newProducts.filter(p => !existingIds.has(p.productId));

    console.log(`[${categoryKey}]`);
    console.log(`  기존 제품: ${existingProducts.length}개`);
    console.log(`  새 제품: ${newProducts.length}개`);
    console.log(`  겹치는 제품: ${overlapIds.size}개`);
    console.log(`  추가할 제품: ${toAdd.length}개`);

    if (overlapIds.size > 0) {
      const sampleIds = [...overlapIds].slice(0, 3);
      console.log(`  겹치는 ID 샘플: ${sampleIds.join(', ')}`);
    }

    // 병합된 결과
    const merged = [...existingProducts, ...toAdd];
    mergeResults.set(categoryKey, {
      existing: existingProducts,
      toAdd: toAdd,
      merged: merged,
      specsPath: specsPath
    });

    console.log('');
  }

  // 4. 변환 샘플 출력
  console.log('='.repeat(70));
  console.log('\n📝 변환된 제품 샘플 (처음 3개):\n');

  let sampleCount = 0;
  for (const [categoryKey, products] of categoryProducts) {
    if (sampleCount >= 3) break;

    for (const product of products.slice(0, 1)) {
      sampleCount++;
      console.log(`[샘플 ${sampleCount}] ${product['카테고리']} - ${product['제품명']}`);
      console.log(JSON.stringify(product, null, 2).split('\n').slice(0, 15).join('\n'));
      console.log('  ...');
      console.log('');
      if (sampleCount >= 3) break;
    }
  }

  // 5. 저장 (드라이런이 아닐 때만)
  if (!dryRun) {
    console.log('='.repeat(70));
    console.log('\n💾 파일 저장 중...\n');

    for (const [categoryKey, result] of mergeResults) {
      // 백업
      if (fs.existsSync(result.specsPath)) {
        const backupPath = result.specsPath.replace('.json', '_backup_20251202.json');
        fs.copyFileSync(result.specsPath, backupPath);
        console.log(`  백업: ${path.basename(backupPath)}`);
      }

      // 저장
      fs.writeFileSync(result.specsPath, JSON.stringify(result.merged, null, 2));
      console.log(`  저장: ${path.basename(result.specsPath)} (${result.merged.length}개 제품)`);
    }

    console.log('\n✅ 병합 완료!');
  } else {
    console.log('='.repeat(70));
    console.log('\n⚠️  드라이런 모드: 파일이 수정되지 않았습니다.');
    console.log('실제 병합을 원하시면 dryRun=false로 실행하세요.\n');
  }

  // 6. 최종 통계
  console.log('='.repeat(70));
  console.log('\n📈 최종 통계:\n');

  let totalAdded = 0;
  let totalOverlap = 0;

  for (const [categoryKey, stat] of Object.entries(stats.byCategory)) {
    totalAdded += (stat.new - stat.overlap);
    totalOverlap += stat.overlap;
  }

  console.log(`  총 새 제품: ${stats.transformed}개`);
  console.log(`  추가될 제품: ${totalAdded}개`);
  console.log(`  중복 제품: ${totalOverlap}개`);
  console.log(`  스킵된 제품: ${stats.skipped}개`);

  console.log('\n' + '='.repeat(70));

  return mergeResults;
}

// 실행
const dryRun = process.argv[2] !== '--execute';
processProducts(dryRun);
