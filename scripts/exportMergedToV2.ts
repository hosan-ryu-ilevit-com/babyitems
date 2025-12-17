/**
 * Enuri + Danawa 데이터 병합 스크립트
 *
 * 기능:
 * 1. 기존 Danawa spec 파일 로드 (있는 경우)
 * 2. Enuri JSON 파일 로드
 * 3. 두 데이터 병합 (중복 제거, Enuri 우선)
 * 4. attributeScores 생성
 * 5. data/specs/{category}.json 저장
 * 6. data/reviews/{category}.jsonl 저장
 */

import * as fs from 'fs';
import * as path from 'path';

// 카테고리 설정
interface CategoryConfig {
  categoryKey: string;
  categoryName: string;
  enuriJsonPath: string;
  attributes: string[];
}

const CATEGORIES: CategoryConfig[] = [
  {
    categoryKey: 'car_seat',
    categoryName: '카시트',
    enuriJsonPath: '/tmp/enuri_car_seat_full.json',
    attributes: [
      'safety_and_stability',      // 안전성 및 고정력
      'comfort_and_reclining',     // 착석감 및 각도 조절
      'usability_and_rotation',    // 승하차 편의성 (회전)
      'installation_and_portability', // 설치 및 휴대성
      'adjustability_for_growth',  // 성장 맞춤 조절
      'fabric_and_maintenance',    // 소재 및 세탁 편의성
      'additional_features',       // 추가 기능
    ],
  },
  {
    categoryKey: 'stroller',
    categoryName: '유모차',
    enuriJsonPath: '/tmp/enuri_stroller_full.json',
    attributes: [
      'folding_convenience',       // 접이식 편의성
      'weight_portability',        // 무게 및 휴대성
      'suspension_ride',           // 서스펜션 및 승차감
      'canopy_coverage',           // 캐노피 커버리지
      'storage_basket',            // 수납공간
      'handlebar_adjustment',      // 핸들바 조절
      'safety_certification',      // 안전인증
    ],
  },
  {
    categoryKey: 'diaper',
    categoryName: '기저귀',
    enuriJsonPath: '/tmp/enuri_diaper_full.json',
    attributes: [
      'absorbency',                // 흡수력
      'leak_prevention',           // 샘방지
      'skin_gentleness',           // 피부 자극
      'fit_comfort',               // 착용감
      'wetness_indicator',         // 소변선 표시
      'value_per_piece',           // 장당 가격
    ],
  },
  {
    categoryKey: 'baby_formula_dispenser',
    categoryName: '분유제조기',
    enuriJsonPath: '/tmp/enuri_baby_formula_dispenser_full.json',
    attributes: [
      'temperature_accuracy',      // 온도 정확도
      'brewing_speed',             // 제조 속도
      'cleaning_convenience',      // 세척 편의성
      'noise_level',               // 소음
      'capacity',                  // 용량
      'safety_features',           // 안전 기능
    ],
  },
];

// Enuri 제품 인터페이스
interface EnuriProduct {
  modelNo: string;
  title: string;
  brand: string | null;
  lowPrice: number | null;
  highPrice: number | null;
  reviewCount: number;
  ratingValue: number | null;
  imageUrl: string | null;
  detailUrl: string;
  subCategory: string | null;
  categoryPath: string | null;
  features: string[] | null;
  specs: Record<string, string> | null;
  reviews: EnuriReview[];
  mallPrices: any[];
}

interface EnuriReview {
  reviewId: string;
  rating: number;
  content: string;
  mallName: string | null;
  date: string | null;
  images: any[];
}

interface EnuriJson {
  products: EnuriProduct[];
  category?: any;
}

// ProductSpec 인터페이스 (V2용)
interface ProductSpec {
  카테고리: string;
  카테고리키: string;
  브랜드: string;
  제품명: string;
  모델명: string;
  최저가: number | null;
  가격범위: string | null;
  썸네일: string | null;
  픽타입: string;
  총점: number | null;
  순위: number;
  총제품수: number;
  요약: string | null;
  검색어: string;
  productId: number;
  하위카테고리?: string | null;  // Enuri category_path
  특징?: string[] | null;        // Enuri features
  specs: Record<string, string>;
  attributeScores: Record<string, number>;
  dataSource: 'danawa' | 'enuri';
}

// V2 리뷰 형식
interface V2Review {
  content: string;
  custom_metadata: {
    productId: string;
    rating: number;
    source: string | null;
    author?: string;
    date?: string;
  };
}

/**
 * Enuri features에서 attributeScores 생성 (규칙 기반)
 */
function generateAttributeScores(
  product: EnuriProduct,
  categoryKey: string,
  attributes: string[]
): Record<string, number> {
  const scores: Record<string, number> = {};
  const features = product.features || [];
  const specs = product.specs || {};
  const title = product.title.toLowerCase();
  const categoryPath = product.categoryPath || '';

  // 기본 점수 설정 (50-70 범위)
  for (const attr of attributes) {
    scores[attr] = 60 + Math.floor(Math.random() * 10);
  }

  // 카테고리별 규칙 기반 점수 조정
  if (categoryKey === 'car_seat') {
    // 안전성 관련
    if (features.some(f => f.includes('아이사이즈') || f.includes('i-size'))) {
      scores['safety_and_stability'] = Math.min(100, (scores['safety_and_stability'] || 60) + 20);
    }
    if (features.some(f => f.includes('ISOFIX'))) {
      scores['safety_and_stability'] = Math.min(100, (scores['safety_and_stability'] || 60) + 15);
    }
    if (features.some(f => f.includes('5점식'))) {
      scores['safety_and_stability'] = Math.min(100, (scores['safety_and_stability'] || 60) + 10);
    }

    // 회전 기능
    if (features.some(f => f.includes('360') || f.includes('회전'))) {
      scores['usability_and_rotation'] = Math.min(100, (scores['usability_and_rotation'] || 60) + 25);
    }

    // 휴대용/컴팩트
    if (categoryPath.includes('휴대용') || title.includes('휴대용') || title.includes('폴더블')) {
      scores['installation_and_portability'] = Math.min(100, (scores['installation_and_portability'] || 60) + 25);
    }

    // 일체형 (긴 사용기간)
    if (categoryPath.includes('일체형') || title.includes('올인원')) {
      scores['adjustability_for_growth'] = Math.min(100, (scores['adjustability_for_growth'] || 60) + 20);
    }
  }
  else if (categoryKey === 'stroller') {
    // 접이식
    if (features.some(f => f.includes('원터치') || f.includes('한손'))) {
      scores['folding_convenience'] = Math.min(100, (scores['folding_convenience'] || 60) + 25);
    }
    if (features.some(f => f.includes('자동폴딩') || f.includes('오토폴딩'))) {
      scores['folding_convenience'] = Math.min(100, (scores['folding_convenience'] || 60) + 20);
    }

    // 휴대용/경량
    if (categoryPath.includes('휴대용') || title.includes('휴대') || title.includes('절충형')) {
      scores['weight_portability'] = Math.min(100, (scores['weight_portability'] || 60) + 25);
    }

    // 양대면/디럭스
    if (categoryPath.includes('양대면') || categoryPath.includes('디럭스')) {
      scores['suspension_ride'] = Math.min(100, (scores['suspension_ride'] || 60) + 20);
      scores['canopy_coverage'] = Math.min(100, (scores['canopy_coverage'] || 60) + 15);
    }

    // 서스펜션
    if (features.some(f => f.includes('서스펜션') || f.includes('충격흡수'))) {
      scores['suspension_ride'] = Math.min(100, (scores['suspension_ride'] || 60) + 20);
    }
  }
  else if (categoryKey === 'diaper') {
    // 흡수력
    if (features.some(f => f.includes('흡수') || f.includes('12시간'))) {
      scores['absorbency'] = Math.min(100, (scores['absorbency'] || 60) + 20);
    }

    // 샘방지
    if (features.some(f => f.includes('샘방지') || f.includes('누출방지'))) {
      scores['leak_prevention'] = Math.min(100, (scores['leak_prevention'] || 60) + 20);
    }

    // 피부 자극
    if (features.some(f => f.includes('무향') || f.includes('저자극') || f.includes('순면'))) {
      scores['skin_gentleness'] = Math.min(100, (scores['skin_gentleness'] || 60) + 20);
    }

    // 소변선
    if (features.some(f => f.includes('소변선') || f.includes('인디케이터'))) {
      scores['wetness_indicator'] = Math.min(100, (scores['wetness_indicator'] || 60) + 30);
    }
  }
  else if (categoryKey === 'baby_formula_dispenser') {
    // 온도 정확도
    if (features.some(f => f.includes('정온') || f.includes('온도조절'))) {
      scores['temperature_accuracy'] = Math.min(100, (scores['temperature_accuracy'] || 60) + 20);
    }

    // 세척
    if (features.some(f => f.includes('자동세척') || f.includes('살균'))) {
      scores['cleaning_convenience'] = Math.min(100, (scores['cleaning_convenience'] || 60) + 25);
    }

    // 저소음
    if (features.some(f => f.includes('저소음') || f.includes('무소음'))) {
      scores['noise_level'] = Math.min(100, (scores['noise_level'] || 60) + 25);
    }
  }

  // 리뷰 수에 따른 신뢰도 보정
  if (product.reviewCount > 500) {
    Object.keys(scores).forEach(key => {
      scores[key] = Math.min(100, scores[key] + 5);
    });
  }

  // 평점에 따른 전반적 보정
  if (product.ratingValue && product.ratingValue >= 4.5) {
    Object.keys(scores).forEach(key => {
      scores[key] = Math.min(100, scores[key] + 3);
    });
  }

  return scores;
}

/**
 * 가격 범위 문자열 생성
 */
function formatPriceRange(lowPrice: number | null, highPrice: number | null): string | null {
  if (!lowPrice) return null;
  const lowWon = Math.round(lowPrice / 10000);
  const highWon = highPrice ? Math.round(highPrice / 10000) : lowWon;
  if (lowWon === highWon) return `${lowWon}`;
  return `${lowWon}~${highWon}`;
}

/**
 * Enuri 제품을 V2 ProductSpec으로 변환
 */
function convertEnuriToSpec(
  product: EnuriProduct,
  config: CategoryConfig,
  rank: number,
  total: number
): ProductSpec {
  const attributeScores = generateAttributeScores(product, config.categoryKey, config.attributes);

  return {
    카테고리: config.categoryName,
    카테고리키: config.categoryKey,
    브랜드: product.brand || '미상',
    제품명: '-',
    모델명: product.title,
    최저가: product.lowPrice,
    가격범위: formatPriceRange(product.lowPrice, product.highPrice),
    썸네일: product.imageUrl,
    픽타입: 'none',
    총점: product.ratingValue ? product.ratingValue * 20 : null, // 5점 → 100점 변환
    순위: rank,
    총제품수: total,
    요약: null,
    검색어: `${product.brand || ''} ${product.title}`.trim(),
    productId: parseInt(product.modelNo, 10),
    하위카테고리: product.categoryPath || product.subCategory,
    특징: product.features,
    specs: product.specs || {},
    attributeScores,
    dataSource: 'enuri',
  };
}

/**
 * Enuri 리뷰를 V2 형식으로 변환
 */
function convertEnuriReviews(product: EnuriProduct): V2Review[] {
  return product.reviews.map(review => ({
    content: review.content,
    custom_metadata: {
      productId: product.modelNo,
      rating: review.rating,
      source: review.mallName,
      date: review.date || undefined,
    },
  }));
}

/**
 * 기존 Danawa spec 파일 로드
 */
function loadExistingSpec(categoryKey: string): ProductSpec[] {
  const specPath = path.join(process.cwd(), 'data', 'specs', `${categoryKey}.json`);
  if (fs.existsSync(specPath)) {
    try {
      const data = fs.readFileSync(specPath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.log(`⚠️ 기존 spec 파일 로드 실패: ${specPath}`);
      return [];
    }
  }
  return [];
}

/**
 * 기존 리뷰 JSONL 파일 로드
 */
function loadExistingReviews(categoryKey: string): V2Review[] {
  const reviewPath = path.join(process.cwd(), 'data', 'reviews', `${categoryKey}.jsonl`);
  if (fs.existsSync(reviewPath)) {
    try {
      const lines = fs.readFileSync(reviewPath, 'utf-8').trim().split('\n');
      return lines.filter(line => line.trim()).map(line => JSON.parse(line));
    } catch (e) {
      console.log(`⚠️ 기존 리뷰 파일 로드 실패: ${reviewPath}`);
      return [];
    }
  }
  return [];
}

/**
 * 메인 처리 함수
 */
async function processCategory(config: CategoryConfig): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 처리 중: ${config.categoryName} (${config.categoryKey})`);
  console.log('='.repeat(60));

  // 1. Enuri JSON 로드
  if (!fs.existsSync(config.enuriJsonPath)) {
    console.log(`❌ Enuri 파일 없음: ${config.enuriJsonPath}`);
    return;
  }

  const enuriData: EnuriJson = JSON.parse(fs.readFileSync(config.enuriJsonPath, 'utf-8'));
  console.log(`✅ Enuri 제품 로드: ${enuriData.products.length}개`);

  // 2. 기존 Danawa spec 로드
  const existingSpecs = loadExistingSpec(config.categoryKey);
  console.log(`✅ 기존 Danawa 스펙 로드: ${existingSpecs.length}개`);

  // 3. 기존 리뷰 로드
  const existingReviews = loadExistingReviews(config.categoryKey);
  console.log(`✅ 기존 리뷰 로드: ${existingReviews.length}개`);

  // 4. Enuri → ProductSpec 변환
  const enuriSpecs: ProductSpec[] = enuriData.products
    .filter(p => p.reviewCount > 0) // 리뷰 있는 제품만
    .sort((a, b) => b.reviewCount - a.reviewCount) // 리뷰 수 내림차순
    .map((product, index) =>
      convertEnuriToSpec(product, config, index + 1, enuriData.products.length)
    );
  console.log(`✅ Enuri → ProductSpec 변환: ${enuriSpecs.length}개`);

  // 5. 병합 (Enuri productId와 Danawa productId 중복 체크)
  const enuriProductIds = new Set(enuriSpecs.map(s => s.productId));
  const danawaOnlySpecs = existingSpecs.filter(s => !enuriProductIds.has(s.productId));

  // Danawa 스펙에 dataSource 추가
  danawaOnlySpecs.forEach(s => {
    if (!s.dataSource) s.dataSource = 'danawa';
  });

  const mergedSpecs = [...enuriSpecs, ...danawaOnlySpecs];

  // 순위 재정렬 (리뷰 수 기준 - Enuri 우선)
  mergedSpecs.sort((a, b) => {
    // Enuri 먼저
    if (a.dataSource === 'enuri' && b.dataSource !== 'enuri') return -1;
    if (a.dataSource !== 'enuri' && b.dataSource === 'enuri') return 1;
    // 같은 소스면 기존 순위
    return a.순위 - b.순위;
  });

  // 순위 재할당
  mergedSpecs.forEach((spec, index) => {
    spec.순위 = index + 1;
    spec.총제품수 = mergedSpecs.length;
  });

  console.log(`✅ 병합 완료: ${mergedSpecs.length}개 (Enuri: ${enuriSpecs.length}, Danawa: ${danawaOnlySpecs.length})`);

  // 6. Enuri 리뷰 변환
  const enuriReviews: V2Review[] = [];
  for (const product of enuriData.products) {
    if (product.reviews && product.reviews.length > 0) {
      enuriReviews.push(...convertEnuriReviews(product));
    }
  }
  console.log(`✅ Enuri 리뷰 변환: ${enuriReviews.length}개`);

  // 7. 리뷰 병합 (중복 제거)
  const existingReviewContents = new Set(
    existingReviews
      .filter(r => r.content)
      .map(r => r.content.substring(0, 100))
  );
  const newReviews = enuriReviews.filter(r =>
    r.content && !existingReviewContents.has(r.content.substring(0, 100))
  );
  const mergedReviews = [...existingReviews, ...newReviews];
  console.log(`✅ 리뷰 병합: ${mergedReviews.length}개 (신규: ${newReviews.length})`);

  // 8. 저장
  const specPath = path.join(process.cwd(), 'data', 'specs', `${config.categoryKey}.json`);
  const reviewPath = path.join(process.cwd(), 'data', 'reviews', `${config.categoryKey}.jsonl`);

  // 백업 (기존 파일이 있으면)
  if (fs.existsSync(specPath)) {
    const backupPath = specPath.replace('.json', `_backup_${Date.now()}.json`);
    fs.copyFileSync(specPath, backupPath);
    console.log(`📁 백업: ${backupPath}`);
  }

  // spec 저장
  fs.writeFileSync(specPath, JSON.stringify(mergedSpecs, null, 2));
  console.log(`💾 저장: ${specPath}`);

  // 리뷰 저장
  const reviewLines = mergedReviews.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(reviewPath, reviewLines);
  console.log(`💾 저장: ${reviewPath}`);

  // 9. 통계 출력
  console.log('\n📊 하위 카테고리 분포:');
  const subCategoryStats: Record<string, number> = {};
  for (const spec of mergedSpecs) {
    const subCat = (spec as any).하위카테고리 || '미분류';
    subCategoryStats[subCat] = (subCategoryStats[subCat] || 0) + 1;
  }
  Object.entries(subCategoryStats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  - ${cat}: ${count}개`);
    });
}

/**
 * 메인 실행
 */
async function main(): Promise<void> {
  console.log('🚀 Enuri + Danawa 데이터 병합 시작\n');

  const targetCategory = process.argv[2]; // 특정 카테고리만 처리 가능

  for (const config of CATEGORIES) {
    if (targetCategory && config.categoryKey !== targetCategory) {
      continue;
    }

    try {
      await processCategory(config);
    } catch (error) {
      console.error(`❌ 오류 발생 (${config.categoryKey}):`, error);
    }
  }

  console.log('\n✅ 병합 완료!');
}

main().catch(console.error);
