/**
 * 다나와 가격/스펙 크롤링 타입 정의
 */

// 다나와 쇼핑몰별 가격 정보
export interface DanawaPriceInfo {
  mall: string;              // 쇼핑몰명 (예: "쿠팡", "11번가")
  price: number;             // 판매가
  delivery: string;          // 배송비 정보 (예: "무료배송", "2,500원")
  seller?: string;           // 판매자명 (optional)
  link?: string;             // 상품 링크 (optional)
}

// 제품 구성 옵션 (예: 기저귀 팩 구성, 물티슈 매수 옵션)
export interface ProductVariant {
  pcode: string;                // 해당 구성의 다나와 상품 코드
  quantity: string;             // 수량/팩 정보 (예: "104매", "200매x2팩")
  price: number | null;         // 가격
  unitPrice: string | null;     // 단가 (예: "534원/1매")
  mallCount: number | null;     // 판매처 수
  rank?: string | null;         // 순위 (예: "1위", "2위")
  isActive: boolean;            // 현재 보고 있는 상품 여부
  productUrl: string;           // 다나와 상품 상세 URL
}

// 다나와 상품 전체 정보
export interface DanawaProductData {
  productCode: string;                    // 다나와 상품 코드
  url: string;                            // 다나와 상품 URL
  name: string;                           // 상품명
  image: string | null;                   // 이미지 URL
  manufacturer: string | null;            // 제조사
  registrationDate: string | null;        // 등록년월
  category: string | null;                // 카테고리 경로
  lowestPrice: number | null;             // 최저가
  lowestMall: string | null;              // 최저가 쇼핑몰
  specs: Record<string, string>;          // 스펙 정보 (키-값 쌍)
  prices: DanawaPriceInfo[];              // 쇼핑몰별 가격 리스트
  variants?: ProductVariant[];            // 다른 구성 옵션 (optional)
}

// 다나와 검색 결과
export interface DanawaSearchResult {
  success: boolean;
  productCode?: string;       // 다나와 상품 코드
  error?: string;
}

// 다나와 크롤링 결과
export interface DanawaCrawlResult {
  success: boolean;
  data?: DanawaProductData;
  error?: string;
  cached?: boolean;           // 캐시에서 가져왔는지 여부
}

// 다나와 캐시 엔트리 (Supabase 저장용)
export interface DanawaCacheEntry {
  product_code: string;       // PK
  product_name: string;
  lowest_price: number | null;
  lowest_mall: string | null;
  specs: Record<string, string>;
  prices: DanawaPriceInfo[];
  image: string | null;
  manufacturer: string | null;
  registration_date: string | null;
  category: string | null;
  created_at: string;
  expires_at: string;
}

// API 요청/응답 타입
export interface DanawaSearchRequest {
  query: string;              // 검색어 (브랜드 + 제품명)
}

export interface DanawaCrawlRequest {
  productCode: string;        // 다나와 상품 코드
  forceRefresh?: boolean;     // 캐시 무시하고 새로 크롤링
}

// 통합 API 응답 (한 번에 검색 + 크롤링)
export interface DanawaIntegratedRequest {
  query: string;              // 검색어
  forceRefresh?: boolean;     // 캐시 무시
}

export interface DanawaIntegratedResponse {
  success: boolean;
  data?: DanawaProductData;
  error?: string;
  cached?: boolean;
}

// ============================================================================
// Knowledge Agent용 검색 결과 타입
// ============================================================================

// 검색 옵션
export interface DanawaSearchOptions {
  query: string;
  limit?: number;           // default: 40
  sort?: 'saveDESC' | 'opinionDESC' | 'priceASC' | 'priceDESC';
  minPrice?: number;
  maxPrice?: number;
}

// 검색 결과 목록의 개별 상품
export interface DanawaSearchListItem {
  pcode: string;            // 다나와 상품 코드
  name: string;             // 상품명
  brand: string | null;     // 브랜드
  price: number | null;     // 가격
  thumbnail: string | null; // 썸네일 URL
  reviewCount: number;      // 리뷰 수
  rating: number | null;    // 평점 (1-5)
  specSummary: string;      // 스펙 요약 (예: "용량: 5L | 소비전력: 1400W")
  productUrl: string;       // 상품 상세 URL
  danawaRank?: number | null; // 다나와 판매 랭킹
}

// 검색 결과 응답
export interface DanawaSearchListResponse {
  success: boolean;
  query: string;
  totalCount: number;
  items: DanawaSearchListItem[];
  searchUrl: string;
  cached?: boolean;
  cachedAt?: string;
  error?: string;
}
