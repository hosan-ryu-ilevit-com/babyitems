// Client-safe constants (no Node.js dependencies)

export type Category =
  | 'baby_bottle'
  | 'baby_bottle_sterilizer'
  | 'baby_formula_dispenser'
  | 'baby_monitor'
  | 'baby_play_mat'
  | 'car_seat'
  | 'diaper'
  | 'formula'
  | 'milk_powder_port'
  | 'nasal_aspirator'
  | 'stroller'
  | 'thermometer';

export const CATEGORIES: Category[] = [
  'baby_bottle',
  'baby_bottle_sterilizer',
  'baby_formula_dispenser',
  'baby_monitor',
  'baby_play_mat',
  'car_seat',
  'diaper',
  'formula',
  'milk_powder_port',
  'nasal_aspirator',
  'stroller',
  'thermometer',
];

export const CATEGORY_NAMES: Record<Category, string> = {
  baby_bottle: '젖병',
  baby_bottle_sterilizer: '젖병소독기',
  baby_formula_dispenser: '분유제조기',
  baby_monitor: '홈카메라',
  baby_play_mat: '놀이매트',
  car_seat: '카시트',
  diaper: '기저귀',
  formula: '분유',
  milk_powder_port: '분유포트',
  nasal_aspirator: '콧물흡입기',
  stroller: '유모차',
  thermometer: '체온계',
};

// 각 카테고리의 랭킹 1위 제품 ID (썸네일 표시용)
export const CATEGORY_TOP_PRODUCTS: Record<Category, string | null> = {
  baby_bottle: '8590005724', // 스펙트라 PA 160ml 젖병 젖꼭지 (랭킹 1위)
  baby_bottle_sterilizer: '8438035154', // 유팡 UP920A (랭킹 1위)
  baby_formula_dispenser: '4795877375', // 분유제조기 랭킹 1위
  baby_monitor: '8083010877', // 헤이홈 GKW-MC059 (랭킹 1위)
  baby_play_mat: '4928070388', // 놀이매트 랭킹 1위
  car_seat: '7368344482', // 카시트 랭킹 1위
  diaper: null, // Enuri 데이터로 추후 업데이트
  formula: null, // 분유 랭킹 1위 (추후 업데이트)
  milk_powder_port: '6962086794', // 보르르 B17-505 (랭킹 1위)
  nasal_aspirator: '8212428751', // 노시부 프로 (랭킹 1위)
  stroller: null, // Enuri 데이터로 추후 업데이트
  thermometer: '8308688637', // 브라운 IRT6030 (랭킹 1위)
};

// 각 카테고리의 랭킹 1위 제품 썸네일 URL
export const CATEGORY_THUMBNAILS: Record<Category, string | null> = {
  baby_bottle: 'https://crawl-cdn.nosearch.com/image/withoutBgRemove/2023/PA 160ml ì ë³ ì ê¼­ì§ (2ê°)_1687313858363.png',
  baby_bottle_sterilizer: 'https://crawl-cdn.nosearch.com/image/withBgRemove/2024/1723770438477_ì í¡_1723770441158.png',
  baby_formula_dispenser: 'https://crawl-cdn.nosearch.com/image/withoutBgRemove/2023/BRZFRP-1A_1687315181649.png',
  baby_monitor: 'https://ns-curation.s3.ap-northeast-2.amazonaws.com/watermark/홈캠_고퀄_GKW-MC059.png',
  baby_play_mat: 'https://d21x3meyyr2jva.cloudfront.net/backoffice/image/티지오매트_방방 놀이매트_놀이방매트.jpg',
  car_seat: 'https://crawl-cdn.nosearch.com/image/withBgRemove/2025/500000_309_468_img_26468309_1_k5.jpg',
  diaper: null, // Enuri 데이터로 추후 업데이트
  formula: null, // 분유 썸네일 (추후 업데이트)
  milk_powder_port: 'https://crawl-cdn.nosearch.com/image/withoutBgRemove/2023/ë³´ë¥´ë¥´_1687235909109.png',
  nasal_aspirator: 'https://crawl-cdn.nosearch.com/image/withoutBgRemove/2023/ë¸ìë¶íë¡_1687164059407.png',
  stroller: null, // Enuri 데이터로 추후 업데이트
  thermometer: 'https://ns-curation.s3.ap-northeast-2.amazonaws.com/watermark/체온계_브라운_IRT6030|0.png',
};

// 예산 옵션 인터페이스
export interface BudgetOption {
  label: string;
  value: string;
  desc: string;
  popular?: boolean;
}

// 카테고리별 예산 범위 (가격 분포 기반)
export const CATEGORY_BUDGET_OPTIONS: Record<Category, BudgetOption[]> = {
  baby_bottle: [
    { label: '최대 1만원', value: '0-10000', desc: '기본형' },
    { label: '최대 3만원', value: '0-30000', desc: '인기 제품', popular: true },
    { label: '최대 5만원', value: '0-50000', desc: '프리미엄' },
    { label: '5만원+', value: '50000+', desc: '최고급' },
  ],
  baby_bottle_sterilizer: [
    { label: '최대 15만원', value: '0-150000', desc: '기본 기능' },
    { label: '최대 25만원', value: '0-250000', desc: '더 좋은 기능', popular: true },
    { label: '최대 35만원', value: '0-350000', desc: '프리미엄' },
    { label: '35만원+', value: '350000+', desc: '최고급' },
  ],
  baby_formula_dispenser: [
    { label: '최대 30만원', value: '0-300000', desc: '기본 기능' },
    { label: '최대 45만원', value: '0-450000', desc: '더 좋은 기능', popular: true },
    { label: '최대 60만원', value: '0-600000', desc: '프리미엄' },
    { label: '60만원+', value: '600000+', desc: '최고급' },
  ],
  baby_monitor: [
    { label: '최대 3만원', value: '0-30000', desc: '기본 기능' },
    { label: '최대 5만원', value: '0-50000', desc: '인기 제품', popular: true },
    { label: '최대 7만원', value: '0-70000', desc: '프리미엄' },
    { label: '7만원+', value: '70000+', desc: '최고급' },
  ],
  baby_play_mat: [
    { label: '최대 5만원', value: '0-50000', desc: '기본형' },
    { label: '최대 15만원', value: '0-150000', desc: '인기 제품', popular: true },
    { label: '최대 30만원', value: '0-300000', desc: '프리미엄' },
    { label: '30만원+', value: '300000+', desc: '최고급' },
  ],
  car_seat: [
    { label: '최대 15만원', value: '0-150000', desc: '기본 기능' },
    { label: '최대 40만원', value: '0-400000', desc: '인기 제품', popular: true },
    { label: '최대 70만원', value: '0-700000', desc: '프리미엄' },
    { label: '70만원+', value: '700000+', desc: '최고급' },
  ],
  milk_powder_port: [
    { label: '최대 5만원', value: '0-50000', desc: '기본 기능' },
    { label: '최대 10만원', value: '0-100000', desc: '더 좋은 소재+편의 기능', popular: true },
    { label: '최대 15만원', value: '0-150000', desc: '프리미엄 기능' },
    { label: '15만원+', value: '150000+', desc: '최고급' },
  ],
  nasal_aspirator: [
    { label: '최대 3만원', value: '0-30000', desc: '기본 기능' },
    { label: '최대 5만원', value: '0-50000', desc: '인기 제품', popular: true },
    { label: '최대 10만원', value: '0-100000', desc: '프리미엄' },
    { label: '10만원+', value: '100000+', desc: '최고급' },
  ],
  stroller: [
    { label: '최대 30만원', value: '0-300000', desc: '휴대용' },
    { label: '최대 70만원', value: '0-700000', desc: '절충형', popular: true },
    { label: '최대 120만원', value: '0-1200000', desc: '디럭스' },
    { label: '120만원+', value: '1200000+', desc: '프리미엄' },
  ],
  diaper: [
    { label: '최대 2만원', value: '0-20000', desc: '기본' },
    { label: '최대 4만원', value: '0-40000', desc: '인기', popular: true },
    { label: '최대 6만원', value: '0-60000', desc: '프리미엄' },
    { label: '6만원+', value: '60000+', desc: '최고급' },
  ],
  formula: [
    { label: '최대 2만원', value: '0-20000', desc: '기본' },
    { label: '최대 3만원', value: '0-30000', desc: '인기', popular: true },
    { label: '최대 5만원', value: '0-50000', desc: '프리미엄' },
    { label: '5만원+', value: '50000+', desc: '고급/수입' },
  ],
  thermometer: [
    { label: '최대 4만원', value: '0-40000', desc: '기본 기능' },
    { label: '최대 7만원', value: '0-70000', desc: '인기 제품', popular: true },
    { label: '최대 10만원', value: '0-100000', desc: '프리미엄' },
    { label: '10만원+', value: '100000+', desc: '최고급' },
  ],
};
