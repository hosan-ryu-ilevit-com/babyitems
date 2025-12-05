-- 다나와 캐시 테이블 생성
-- TTL: 24시간 (expires_at 필드 사용)

CREATE TABLE IF NOT EXISTS danawa_cache (
  product_code VARCHAR(50) PRIMARY KEY,
  product_name TEXT NOT NULL,
  lowest_price INT,
  lowest_mall VARCHAR(100),
  specs JSONB DEFAULT '{}'::jsonb,
  prices JSONB DEFAULT '[]'::jsonb,
  image TEXT,
  manufacturer VARCHAR(255),
  registration_date VARCHAR(50),
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- 인덱스 생성 (만료 시간 기준 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_danawa_cache_expires_at ON danawa_cache(expires_at);

-- 인덱스 생성 (상품명 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_danawa_cache_product_name ON danawa_cache USING gin(to_tsvector('simple', product_name));

-- RLS (Row Level Security) 활성화
ALTER TABLE danawa_cache ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽기 가능 (캐시는 공개 데이터)
CREATE POLICY "Allow public read access on danawa_cache"
ON danawa_cache FOR SELECT
USING (true);

-- 서비스 역할만 쓰기 가능
CREATE POLICY "Allow service role to insert/update/delete danawa_cache"
ON danawa_cache FOR ALL
USING (auth.role() = 'service_role');

-- 설명 추가
COMMENT ON TABLE danawa_cache IS '다나와 상품 정보 캐시 (TTL: 24시간)';
COMMENT ON COLUMN danawa_cache.product_code IS '다나와 상품 코드 (PK)';
COMMENT ON COLUMN danawa_cache.product_name IS '상품명';
COMMENT ON COLUMN danawa_cache.lowest_price IS '최저가';
COMMENT ON COLUMN danawa_cache.lowest_mall IS '최저가 쇼핑몰';
COMMENT ON COLUMN danawa_cache.specs IS '스펙 정보 (JSON)';
COMMENT ON COLUMN danawa_cache.prices IS '쇼핑몰별 가격 리스트 (JSON)';
COMMENT ON COLUMN danawa_cache.created_at IS '생성 시간';
COMMENT ON COLUMN danawa_cache.expires_at IS '만료 시간 (생성 시간 + 24시간)';
