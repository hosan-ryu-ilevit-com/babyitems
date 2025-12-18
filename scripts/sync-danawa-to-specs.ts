/**
 * 다나와 products 데이터를 로컬 spec 파일 형식으로 변환
 * - filter_attrs 추가 ✅
 * - 필드명 매핑 (pcode → productId, title → 모델명 등)
 * - attributeScores는 기본값 설정 (나중에 분석 스크립트로 업데이트)
 */

import fs from 'fs';
import path from 'path';
import { CATEGORY_CODE_MAP } from '../lib/recommend-v2/categoryUtils';
import { CATEGORY_ATTRIBUTES } from '../data/categoryAttributes';
import type { Category } from '../lib/data';

/**
 * 카테고리별 기본 attributeScores 생성 (모든 속성에 70점 기본값)
 */
function generateDefaultAttributeScores(categoryKey: string): Record<string, number> {
  const attributes = CATEGORY_ATTRIBUTES[categoryKey as Category];
  if (!attributes || attributes.length === 0) {
    return {};
  }

  const scores: Record<string, number> = {};
  attributes.forEach(attr => {
    scores[attr.key] = 70; // 기본 점수
  });

  return scores;
}

// 다나와 category_code만 필터링 (에누리 코드 제외)
const DANAWA_ONLY_CATEGORY_MAP: Record<string, string[]> = {};
for (const [categoryKey, codes] of Object.entries(CATEGORY_CODE_MAP)) {
  // 숫자로만 구성된 코드만 포함 (다나와 코드)
  const danawaCodes = codes.filter(code => /^\d+$/.test(code));
  if (danawaCodes.length > 0) {
    DANAWA_ONLY_CATEGORY_MAP[categoryKey] = danawaCodes;
  }
}

interface DanawaProduct {
  pcode: string;
  title: string;
  price: number;
  brand: string;
  rank?: number;
  thumbnail?: string;
  spec?: Record<string, any>;
  filter_attrs?: Record<string, string>;
  category_code: string;
}

interface SpecProduct {
  카테고리: string;
  카테고리키: string;
  브랜드: string;
  제품명: string;
  모델명: string;
  최저가: number | null;
  가격범위?: string;
  썸네일?: string;
  픽타입: string;
  총점?: number;
  순위?: number;
  총제품수?: number;
  요약?: string | null;
  검색어: string;
  productId: number;
  filter_attrs: Record<string, string>;
  specs: Record<string, any>;
  attributeScores?: Record<string, number>;
}

/**
 * 다나와 제품을 spec 형식으로 변환
 */
function convertToSpecFormat(
  danawaProduct: DanawaProduct,
  categoryKey: string,
  categoryName: string,
  totalProducts: number
): SpecProduct {
  // pcode를 숫자로 변환 (productId)
  const productId = parseInt(danawaProduct.pcode, 10);

  // 브랜드와 제품명 분리 (title에서)
  const title = danawaProduct.title || '';
  const brand = danawaProduct.brand || '';

  // 제품명은 title에서 브랜드명을 제거한 나머지
  let productName = title;
  if (brand && title.startsWith(brand)) {
    productName = title.slice(brand.length).trim();
  }

  // 가격 범위 계산
  const price = danawaProduct.price || 0;
  let priceRange = '-';
  if (price < 50000) priceRange = '0~5만원';
  else if (price < 100000) priceRange = '5~10만원';
  else if (price < 150000) priceRange = '10~15만원';
  else priceRange = '15만원+';

  return {
    카테고리: categoryName,
    카테고리키: categoryKey,
    브랜드: brand,
    제품명: productName,
    모델명: title,
    최저가: danawaProduct.price || null,
    가격범위: priceRange,
    썸네일: danawaProduct.thumbnail,
    픽타입: 'none',
    총점: danawaProduct.rank ? 100 - danawaProduct.rank : undefined,
    순위: danawaProduct.rank,
    총제품수: totalProducts,
    요약: null,
    검색어: `${brand} ${productName}`.trim(),
    productId,
    filter_attrs: danawaProduct.filter_attrs || {},
    specs: danawaProduct.spec || {},
    attributeScores: generateDefaultAttributeScores(categoryKey),
  };
}

/**
 * 카테고리별 다나와 데이터 변환 및 저장
 */
async function syncDanawaToSpecs() {
  console.log('🔄 다나와 데이터 → Spec 파일 동기화 시작...\n');

  // 다나와 products 파일 로드
  const danawaProductsPath = path.join(
    process.cwd(),
    'danawaproduct_1208',
    'danawa_products_20251209_025019.json'
  );

  if (!fs.existsSync(danawaProductsPath)) {
    console.error('❌ 다나와 products 파일을 찾을 수 없습니다:', danawaProductsPath);
    return;
  }

  console.log('📂 다나와 products 파일 로드 중...');
  const danawaProducts: DanawaProduct[] = JSON.parse(
    fs.readFileSync(danawaProductsPath, 'utf-8')
  );
  console.log(`   총 ${danawaProducts.length}개 제품 로드됨\n`);

  // 카테고리 이름 매핑 (한글)
  const categoryNameMap: Record<string, string> = {
    stroller: '유모차',
    car_seat: '카시트',
    formula: '분유',
    formula_maker: '분유제조기',
    baby_formula_dispenser: '분유제조기',
    formula_pot: '분유포트',
    milk_powder_port: '분유포트',
    baby_bottle: '젖병',
    pacifier: '쪽쪽이/노리개',
    diaper: '기저귀',
    baby_wipes: '아기물티슈',
    thermometer: '체온계',
    nasal_aspirator: '코흡입기',
    ip_camera: '홈캠/IP카메라',
    baby_monitor: '베이비모니터',
    baby_bed: '유아침대',
    high_chair: '유아의자/식탁의자',
    baby_sofa: '유아소파',
    baby_desk: '유아책상',
    baby_play_mat: '놀이매트',
    baby_bottle_sterilizer: '젖병소독기',
  };

  // 카테고리별로 변환 (다나와 코드만)
  for (const [categoryKey, categoryCodes] of Object.entries(DANAWA_ONLY_CATEGORY_MAP)) {
    console.log(`📦 ${categoryKey} 변환 중...`);

    // 해당 카테고리 제품 필터링
    const categoryProducts = danawaProducts.filter((p) =>
      categoryCodes.includes(p.category_code?.toString())
    );

    if (categoryProducts.length === 0) {
      console.log(`   ⚠️  제품 없음 - 건너뜀\n`);
      continue;
    }

    console.log(`   ${categoryProducts.length}개 제품 발견`);

    const categoryName = categoryNameMap[categoryKey] || categoryKey;

    // Spec 형식으로 변환
    const specProducts = categoryProducts.map((p) =>
      convertToSpecFormat(p, categoryKey, categoryName, categoryProducts.length)
    );

    // 순위 순으로 정렬
    specProducts.sort((a, b) => (a.순위 || 999) - (b.순위 || 999));

    // 파일 저장 (백업 먼저 생성)
    const specPath = path.join(process.cwd(), 'data', 'specs', `${categoryKey}.json`);

    // 기존 파일 백업
    if (fs.existsSync(specPath)) {
      const backupPath = path.join(
        process.cwd(),
        'data',
        'specs',
        `${categoryKey}.backup_${Date.now()}.json`
      );
      fs.copyFileSync(specPath, backupPath);
      console.log(`   💾 기존 파일 백업: ${path.basename(backupPath)}`);
    }

    // 새 파일 저장
    fs.writeFileSync(specPath, JSON.stringify(specProducts, null, 2), 'utf-8');
    console.log(`   ✅ ${specProducts.length}개 제품 저장 완료: ${categoryKey}.json`);
    console.log(`   📊 filter_attrs: ${specProducts.filter(p => Object.keys(p.filter_attrs).length > 0).length}개 제품`);
    console.log('');
  }

  console.log('✅ 동기화 완료!\n');
  console.log('📊 요약:');
  console.log(`   - 처리된 카테고리: ${Object.keys(DANAWA_ONLY_CATEGORY_MAP).length}개`);
  console.log(`   - 전체 카테고리: ${Object.keys(CATEGORY_CODE_MAP).length}개 (다나와 + 에누리)`);
  console.log(`   - 다나와만: ${Object.keys(DANAWA_ONLY_CATEGORY_MAP).join(', ')}\n`);
  console.log('⚠️  다음 단계:');
  console.log('   1. attributeScores 분석 스크립트 실행하여 체감속성 점수 업데이트');
  console.log('   2. 실제 추천 테스트하여 정상 작동 확인');
  console.log('   3. v2 추천 플로우에서 filter_attrs 정상 작동하는지 확인');
}

// 실행
syncDanawaToSpecs().catch(console.error);
