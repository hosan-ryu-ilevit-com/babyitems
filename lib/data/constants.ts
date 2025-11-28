// Client-safe constants (no Node.js dependencies)

export type Category =
  | 'baby_bottle'
  | 'baby_bottle_sterilizer'
  | 'baby_formula_dispenser'
  | 'baby_monitor'
  | 'baby_play_mat'
  | 'car_seat'
  | 'milk_powder_port'
  | 'nasal_aspirator'
  | 'thermometer';

export const CATEGORIES: Category[] = [
  'baby_bottle',
  'baby_bottle_sterilizer',
  'baby_formula_dispenser',
  'baby_monitor',
  'baby_play_mat',
  'car_seat',
  'milk_powder_port',
  'nasal_aspirator',
  'thermometer',
];

export const CATEGORY_NAMES: Record<Category, string> = {
  baby_bottle: '젖병',
  baby_bottle_sterilizer: '젖병소독기',
  baby_formula_dispenser: '분유제조기',
  baby_monitor: '홈카메라',
  baby_play_mat: '놀이매트',
  car_seat: '카시트',
  milk_powder_port: '분유포트',
  nasal_aspirator: '콧물흡입기',
  thermometer: '체온계',
};

// 각 카테고리의 랭킹 1위 제품 ID (썸네일 표시용)
export const CATEGORY_TOP_PRODUCTS: Record<Category, string | null> = {
  baby_bottle: '8590005724', // 올뉴 젖병 젖꼭지 세트
  baby_bottle_sterilizer: '9053463293', // 폴레드 픽셀 (순위 2위)
  baby_formula_dispenser: '4795877375', // 분유제조기 랭킹 1위
  baby_monitor: '8163417199', // 홈카메라 랭킹 1위
  baby_play_mat: '4928070388', // 놀이매트 랭킹 1위
  car_seat: '7368344482', // 카시트 랭킹 1위
  milk_powder_port: '7716649665', // 베베보다 분유포트 (랭킹 1위)
  nasal_aspirator: '8375044116', // 콧물흡입기 랭킹 1위
  thermometer: '6653231366', // 귀 적외선 체온계 (랭킹 1위)
};

// 각 카테고리의 랭킹 1위 제품 썸네일 URL
export const CATEGORY_THUMBNAILS: Record<Category, string | null> = {
  baby_bottle: 'https://crawl-cdn.nosearch.com/image/withoutBgRemove/2023/500000_310_656_img_7656310_1.jpg',
  baby_bottle_sterilizer: 'https://ns-curation.s3.ap-northeast-2.amazonaws.com/watermark/젖병소독기_폴레드_PXUVS01.png',
  baby_formula_dispenser: 'https://crawl-cdn.nosearch.com/image/withoutBgRemove/2023/BRZFRP-1A_1687315181649.png',
  baby_monitor: 'https://crawl-cdn.nosearch.com/image/withBgRemove/2023/500000_792_483_img_29483792_1_jpg',
  baby_play_mat: 'https://d21x3meyyr2jva.cloudfront.net/backoffice/image/티지오매트_방방 놀이매트_놀이방매트.jpg',
  car_seat: 'https://crawl-cdn.nosearch.com/image/withBgRemove/2025/500000_309_468_img_26468309_1_k5.jpg',
  milk_powder_port: 'https://crawl-cdn.nosearch.com/image/withBgRemove/2023/500000_948_098_img_30098948_1_jpg',
  nasal_aspirator: 'https://ns-curation.s3.ap-northeast-2.amazonaws.com/watermark/콧물흡입기_조인메디칼_미니돌핀.png',
  thermometer: 'https://ns-curation.s3.ap-northeast-2.amazonaws.com/watermark/체온계_붐케어_BC-05.png',
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
    { label: '1만원 이하', value: '0-10000', desc: '기본형' },
    { label: '1~3만원', value: '10000-30000', desc: '인기 제품', popular: true },
    { label: '3~5만원', value: '30000-50000', desc: '프리미엄' },
    { label: '5만원 이상', value: '50000+', desc: '최고급' },
  ],
  baby_bottle_sterilizer: [
    { label: '15만원 이하', value: '0-150000', desc: '기본 기능' },
    { label: '15~25만원', value: '150000-250000', desc: '더 좋은 기능', popular: true },
    { label: '25~35만원', value: '250000-350000', desc: '프리미엄' },
    { label: '35만원 이상', value: '350000+', desc: '최고급' },
  ],
  baby_formula_dispenser: [
    { label: '30만원 이하', value: '0-300000', desc: '기본 기능' },
    { label: '30~45만원', value: '300000-450000', desc: '더 좋은 기능', popular: true },
    { label: '45~60만원', value: '450000-600000', desc: '프리미엄' },
    { label: '60만원 이상', value: '600000+', desc: '최고급' },
  ],
  baby_monitor: [
    { label: '3만원 이하', value: '0-30000', desc: '기본 기능' },
    { label: '3~5만원', value: '30000-50000', desc: '인기 제품', popular: true },
    { label: '5~7만원', value: '50000-70000', desc: '프리미엄' },
    { label: '7만원 이상', value: '70000+', desc: '최고급' },
  ],
  baby_play_mat: [
    { label: '5만원 이하', value: '0-50000', desc: '기본형' },
    { label: '5~15만원', value: '50000-150000', desc: '인기 제품', popular: true },
    { label: '15~30만원', value: '150000-300000', desc: '프리미엄' },
    { label: '30만원 이상', value: '300000+', desc: '최고급' },
  ],
  car_seat: [
    { label: '15만원 이하', value: '0-150000', desc: '기본 기능' },
    { label: '15~40만원', value: '150000-400000', desc: '인기 제품', popular: true },
    { label: '40~70만원', value: '400000-700000', desc: '프리미엄' },
    { label: '70만원 이상', value: '700000+', desc: '최고급' },
  ],
  milk_powder_port: [
    { label: '5만원 이하', value: '0-50000', desc: '기본 기능' },
    { label: '5~10만원', value: '50000-100000', desc: '더 좋은 소재+편의 기능', popular: true },
    { label: '10~15만원', value: '100000-150000', desc: '프리미엄 기능' },
    { label: '15만원 이상', value: '150000+', desc: '최고급' },
  ],
  nasal_aspirator: [
    { label: '3만원 이하', value: '0-30000', desc: '기본 기능' },
    { label: '3~5만원', value: '30000-50000', desc: '인기 제품', popular: true },
    { label: '5~10만원', value: '50000-100000', desc: '프리미엄' },
    { label: '10만원 이상', value: '100000+', desc: '최고급' },
  ],
  thermometer: [
    { label: '4만원 이하', value: '0-40000', desc: '기본 기능' },
    { label: '4~7만원', value: '40000-70000', desc: '인기 제품', popular: true },
    { label: '7~10만원', value: '70000-100000', desc: '프리미엄' },
    { label: '10만원 이상', value: '100000+', desc: '최고급' },
  ],
};
