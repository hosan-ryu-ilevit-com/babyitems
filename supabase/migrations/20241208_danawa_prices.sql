-- =====================================================
-- 다나와 가격 정보 테이블
-- 생성일: 2024-12-08
-- 목적: 실시간 가격 정보만 저장 (메타데이터는 danawa_products에)
-- 업데이트 주기: 주 1회 배치
-- =====================================================

-- =====================================================
-- 1. danawa_prices (가격 정보 전용)
-- =====================================================
CREATE TABLE IF NOT EXISTS danawa_prices (
  -- PK & FK
  pcode TEXT PRIMARY KEY REFERENCES danawa_products(pcode) ON DELETE CASCADE,
  
  -- 최저가 정보 (요약)
  lowest_price INT,                              -- 최저가
  lowest_mall TEXT,                              -- 최저가 쇼핑몰명
  lowest_delivery TEXT,                          -- 최저가 배송비
  lowest_link TEXT,                              -- 최저가 상품 링크
  
  -- 쇼핑몰별 가격 리스트 (상세)
  -- 구조: [{ mall, price, delivery, seller, link }, ...]
  mall_prices JSONB DEFAULT '[]'::jsonb,
  
  -- 통계
  mall_count INT DEFAULT 0,                      -- 판매 쇼핑몰 수
  price_min INT,                                 -- 가격 범위 (최소)
  price_max INT,                                 -- 가격 범위 (최대)
  
  -- 메타
  price_updated_at TIMESTAMPTZ DEFAULT NOW(),    -- 가격 업데이트 시점
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. 인덱스
-- =====================================================

-- 최저가 기준 정렬/필터용
CREATE INDEX IF NOT EXISTS idx_danawa_prices_lowest_price 
  ON danawa_prices(lowest_price);

-- 업데이트 시점 기준 (오래된 데이터 찾기)
CREATE INDEX IF NOT EXISTS idx_danawa_prices_updated_at 
  ON danawa_prices(price_updated_at);

-- 쇼핑몰별 가격 검색용 (GIN)
CREATE INDEX IF NOT EXISTS idx_danawa_prices_mall_prices 
  ON danawa_prices USING gin(mall_prices);

-- 최저가 쇼핑몰별 필터용
CREATE INDEX IF NOT EXISTS idx_danawa_prices_lowest_mall 
  ON danawa_prices(lowest_mall);

-- =====================================================
-- 3. RLS (Row Level Security)
-- =====================================================

ALTER TABLE danawa_prices ENABLE ROW LEVEL SECURITY;

-- 읽기: 모든 사용자 허용 (공개 데이터)
CREATE POLICY "Allow public read on danawa_prices"
  ON danawa_prices FOR SELECT USING (true);

-- 쓰기: 서비스 역할만 허용
CREATE POLICY "Allow service role write on danawa_prices"
  ON danawa_prices FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 4. 코멘트
-- =====================================================

COMMENT ON TABLE danawa_prices IS '다나와 가격 정보 (주 1회 배치 업데이트)';
COMMENT ON COLUMN danawa_prices.pcode IS '다나와 상품 코드 (FK → danawa_products)';
COMMENT ON COLUMN danawa_prices.lowest_price IS '최저가 (원)';
COMMENT ON COLUMN danawa_prices.lowest_mall IS '최저가 판매 쇼핑몰명';
COMMENT ON COLUMN danawa_prices.lowest_delivery IS '최저가 상품 배송비';
COMMENT ON COLUMN danawa_prices.lowest_link IS '최저가 상품 구매 링크';
COMMENT ON COLUMN danawa_prices.mall_prices IS '쇼핑몰별 가격 리스트 (JSONB 배열)';
COMMENT ON COLUMN danawa_prices.mall_count IS '판매 쇼핑몰 수';
COMMENT ON COLUMN danawa_prices.price_min IS '가격 범위 최소값';
COMMENT ON COLUMN danawa_prices.price_max IS '가격 범위 최대값';
COMMENT ON COLUMN danawa_prices.price_updated_at IS '가격 정보 마지막 업데이트 시점';

-- =====================================================
-- 5. 샘플 데이터 구조 (참고용, 실행 안 함)
-- =====================================================
/*
INSERT INTO danawa_prices (pcode, lowest_price, lowest_mall, lowest_delivery, lowest_link, mall_prices, mall_count, price_min, price_max) 
VALUES (
  '12345678',
  25030,
  '쿠팡',
  '무료배송',
  'https://link.danawa.com/...',
  '[
    {"mall": "쿠팡", "price": 25030, "delivery": "무료배송", "seller": "쿠팡", "link": "https://..."},
    {"mall": "11번가", "price": 26500, "delivery": "2,500원", "seller": "베이비샵", "link": "https://..."},
    {"mall": "G마켓", "price": 27000, "delivery": "무료배송", "seller": "공식스토어", "link": "https://..."}
  ]'::jsonb,
  3,
  25030,
  27000
);
*/

-- =====================================================
-- 완료
-- =====================================================
