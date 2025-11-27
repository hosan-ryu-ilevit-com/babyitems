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
