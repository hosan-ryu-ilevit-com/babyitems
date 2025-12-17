/**
 * 에누리 크롤링 타입 정의
 */

// =====================================================
// 리뷰 관련 타입
// =====================================================

export interface EnuriReviewImage {
  thumbnail: string;           // 썸네일 URL
  original?: string;           // 원본 URL
  mallName?: string;           // 출처 쇼핑몰 (CJ온스타일, SSG 등)
}

export interface EnuriReview {
  reviewId: string;            // 리뷰 고유 ID (해시)
  rating: number;              // 평점 (1-5)
  content: string;             // 리뷰 내용
  author?: string;             // 작성자
  date?: string;               // 작성일
  images: EnuriReviewImage[];  // 이미지 배열
  mallName?: string;           // 구매 쇼핑몰
}

export interface EnuriReviewResult {
  modelNo: string;
  reviewCount: number;
  averageRating: number | null;
  reviews: EnuriReview[];
  crawledAt: Date;
  success: boolean;
  error?: string;
}

// =====================================================
// 가격 관련 타입
// =====================================================

export interface EnuriMallPrice {
  mallName: string;            // 쇼핑몰명 (11번가, 쿠팡, SSG 등)
  mallLogo?: string;           // 쇼핑몰 로고 URL
  productName: string;         // 상품명 (쇼핑몰별 다를 수 있음)
  price: number;               // 판매가
  cardPrice?: number;          // 카드 할인가
  deliveryFee: number;         // 배송비 (0 = 무료)
  totalPrice: number;          // 총 결제 금액 (가격 + 배송비)
  productUrl: string;          // 상품 링크
  earn?: number;               // 적립금
}

export interface EnuriPriceResult {
  modelNo: string;
  lowestPrice: number | null;
  lowestMall: string | null;
  lowestDelivery: string | null;
  lowestLink: string | null;
  mallPrices: EnuriMallPrice[];
  mallCount: number;
  priceMin: number | null;
  priceMax: number | null;
  crawledAt: Date;
  success: boolean;
  error?: string;
}

// =====================================================
// 상품 관련 타입
// =====================================================

export interface EnuriProduct {
  modelNo: string;             // 에누리 상품 번호
  title: string;               // 제품명
  brand: string | null;        // 브랜드
  price: number | null;        // 최저가
  highPrice: number | null;    // 최고가
  categoryCode: string;        // 카테고리 코드
  rank: number | null;         // 인기 순위
  detailUrl: string;           // 에누리 상세 URL
  thumbnail: string | null;    // 썸네일 URL
  imageUrl: string | null;     // 대표 이미지 URL
  regDate: string | null;      // 등록일
  specRaw: string | null;      // 스펙 원본
  spec: Record<string, string>;// 파싱된 스펙
  filterAttrs: Record<string, unknown>; // 필터 속성
  averageRating: number | null;// 평균 평점
  reviewCount: number;         // 리뷰 수
  danawaPcode?: string;        // 매칭된 다나와 pcode
}

export interface EnuriProductWithDetails extends EnuriProduct {
  reviews: EnuriReview[];
  mallPrices: EnuriMallPrice[];
}

// =====================================================
// 카테고리 관련 타입
// =====================================================

export interface EnuriCategory {
  categoryCode: string;        // 에누리 카테고리 코드
  categoryName: string;        // 카테고리명
  categoryPath?: string;       // 카테고리 경로
  groupId?: string;            // 통합 그룹 ID (다나와 공유)
  totalProductCount: number;
  crawledProductCount: number;
}

// =====================================================
// 크롤링 결과 타입
// =====================================================

export interface EnuriCrawlResult {
  category: EnuriCategory;
  products: EnuriProductWithDetails[];
  crawledAt: Date;
  success: boolean;
  error?: string;
}

// =====================================================
// Supabase 저장용 타입 (snake_case)
// =====================================================

export interface EnuriProductRow {
  model_no: string;
  title: string;
  brand: string | null;
  price: number | null;
  high_price: number | null;
  category_code: string;
  category_path?: string | null;   // 카테고리 경로 (e.g., "카시트/일체형") - DB 컬럼 추가 후 사용
  features?: string[] | null;      // [특징] 배열 (e.g., ["5점식벨트", "ISOFIX"]) - DB 컬럼 추가 후 사용
  rank: number | null;
  detail_url: string;
  thumbnail: string | null;
  image_url: string | null;
  reg_date: string | null;
  spec_raw: string | null;
  spec: Record<string, string>;
  filter_attrs: Record<string, unknown>;
  average_rating: number | null;
  review_count: number;
  danawa_pcode: string | null;
  crawled_at: string;
}

export interface EnuriReviewRow {
  model_no: string;
  review_id: string;
  source: string | null;
  rating: number;
  content: string;
  author: string | null;
  review_date: string | null;
  images: EnuriReviewImage[];
  helpful_count: number;
  crawled_at: string;
}

export interface EnuriPriceRow {
  model_no: string;
  lowest_price: number | null;
  lowest_mall: string | null;
  lowest_delivery: string | null;
  lowest_link: string | null;
  mall_prices: EnuriMallPrice[];
  mall_count: number;
  price_min: number | null;
  price_max: number | null;
  price_updated_at: string;
}

export interface EnuriCategoryRow {
  category_code: string;
  category_name: string;
  category_path: string | null;
  group_id: string | null;
  total_product_count: number;
  crawled_product_count: number;
  crawled_at: string | null;
}

export interface ProductMappingRow {
  danawa_pcode: string;
  enuri_model_no: string;
  match_confidence: number;
  match_method: string;
  verified: boolean;
}

// =====================================================
// API 요청/응답 타입
// =====================================================

export interface EnuriCrawlRequest {
  categoryCode: string;        // 에누리 카테고리 코드 (예: 100402)
  maxProducts?: number;        // 최대 크롤링 제품 수 (기본: 50)
  includeReviews?: boolean;    // 리뷰 크롤링 여부 (기본: true)
  includePrices?: boolean;     // 가격 크롤링 여부 (기본: true)
  reviewTopN?: number;         // 리뷰 크롤링 대상 (상위 N개 제품)
}

export interface EnuriSearchResult {
  success: boolean;
  modelNo?: string;
  error?: string;
}

// =====================================================
// 에누리 카테고리 코드 매핑
// =====================================================

export const ENURI_CATEGORY_CODES = {
  // 출산/유아동
  car_seat: '100402',          // 카시트
  stroller: '100401',          // 유모차 (예상)
  baby_bottle: '100403',       // 젖병 (예상)
  diaper: '100501',            // 기저귀 (예상)
} as const;

export type EnuriCategoryKey = keyof typeof ENURI_CATEGORY_CODES;
