-- =====================================================
-- 다나와 제품 데이터 테이블 마이그레이션
-- 생성일: 2024-12-08
-- =====================================================

-- =====================================================
-- 1. danawa_category_groups (통합 카테고리 그룹)
-- =====================================================
CREATE TABLE IF NOT EXISTS danawa_category_groups (
  id TEXT PRIMARY KEY,                          -- 그룹 키 (예: stroller, car_seat)
  name TEXT NOT NULL,                           -- 한글명 (예: 유모차, 카시트)
  display_order INT DEFAULT 0,                  -- 표시 순서
  is_active BOOLEAN DEFAULT true,               -- 활성화 여부
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE danawa_category_groups IS '다나와 통합 카테고리 그룹 (유모차, 카시트 등 여러 하위 카테고리를 묶음)';
COMMENT ON COLUMN danawa_category_groups.id IS '그룹 키 (예: stroller, car_seat, diaper)';
COMMENT ON COLUMN danawa_category_groups.name IS '한글 표시명';

-- =====================================================
-- 2. danawa_categories (다나와 원본 카테고리)
-- =====================================================
CREATE TABLE IF NOT EXISTS danawa_categories (
  category_code TEXT PRIMARY KEY,               -- 다나와 카테고리 코드
  category_name TEXT NOT NULL,                  -- 다나와 카테고리명
  group_id TEXT REFERENCES danawa_category_groups(id), -- 소속 그룹
  total_product_count INT DEFAULT 0,            -- 전체 제품 수
  crawled_product_count INT DEFAULT 0,          -- 크롤링된 제품 수
  crawled_at TIMESTAMPTZ,                       -- 마지막 크롤링 시점
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_danawa_categories_group_id ON danawa_categories(group_id);

COMMENT ON TABLE danawa_categories IS '다나와 원본 카테고리 (다나와 사이트 기준)';
COMMENT ON COLUMN danawa_categories.category_code IS '다나와 카테고리 코드 (PK)';
COMMENT ON COLUMN danawa_categories.group_id IS '소속 통합 그룹 (FK)';

-- =====================================================
-- 3. danawa_filters (카테고리별 필터)
-- =====================================================
CREATE TABLE IF NOT EXISTS danawa_filters (
  id SERIAL PRIMARY KEY,
  category_code TEXT NOT NULL REFERENCES danawa_categories(category_code) ON DELETE CASCADE,
  filter_name TEXT NOT NULL,                    -- 필터명 (예: 브랜드별, 재질)
  options JSONB DEFAULT '[]'::jsonb,            -- 옵션 배열
  option_count INT DEFAULT 0,                   -- 옵션 수
  crawled_at TIMESTAMPTZ,                       -- 크롤링 시점
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(category_code, filter_name)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_danawa_filters_category_code ON danawa_filters(category_code);

COMMENT ON TABLE danawa_filters IS '카테고리별 하드 필터 (브랜드, 재질 등)';
COMMENT ON COLUMN danawa_filters.options IS '필터 옵션 배열 (JSON)';

-- =====================================================
-- 4. danawa_products (제품)
-- =====================================================
CREATE TABLE IF NOT EXISTS danawa_products (
  pcode TEXT PRIMARY KEY,                       -- 다나와 제품 코드
  title TEXT NOT NULL,                          -- 제품명
  brand TEXT,                                   -- 브랜드
  price INT,                                    -- 최저가 (대표가)
  category_code TEXT REFERENCES danawa_categories(category_code), -- 카테고리 코드
  rank INT,                                     -- 카테고리 내 순위
  detail_url TEXT,                              -- 다나와 상세 URL
  thumbnail TEXT,                               -- 썸네일 URL
  reg_date TEXT,                                -- 등록일 (원본 형식)
  spec_raw TEXT,                                -- 스펙 원본 (기록용)
  spec JSONB DEFAULT '{}'::jsonb,               -- 파싱된 스펙
  filter_attrs JSONB DEFAULT '{}'::jsonb,       -- 필터 속성값
  
  -- 리뷰 관련 (미래용)
  average_rating DECIMAL(2,1),                  -- 평균 평점 (예: 4.5)
  review_count INT DEFAULT 0,                   -- 리뷰 수
  
  -- 외부 연동용
  coupang_pcode TEXT,                           -- 쿠팡 제품 코드 (미래용)
  
  -- 메타
  crawled_at TIMESTAMPTZ,                       -- 크롤링 시점
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_danawa_products_category_code ON danawa_products(category_code);
CREATE INDEX IF NOT EXISTS idx_danawa_products_brand ON danawa_products(brand);
CREATE INDEX IF NOT EXISTS idx_danawa_products_price ON danawa_products(price);
CREATE INDEX IF NOT EXISTS idx_danawa_products_rank ON danawa_products(rank);
CREATE INDEX IF NOT EXISTS idx_danawa_products_coupang_pcode ON danawa_products(coupang_pcode);

-- 제품명 검색용 GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_danawa_products_title_gin ON danawa_products USING gin(to_tsvector('simple', title));

COMMENT ON TABLE danawa_products IS '다나와 크롤링 제품 데이터';
COMMENT ON COLUMN danawa_products.pcode IS '다나와 제품 코드 (PK)';
COMMENT ON COLUMN danawa_products.spec_raw IS '스펙 원본 문자열 (기록용)';
COMMENT ON COLUMN danawa_products.spec IS '파싱된 스펙 (JSON)';
COMMENT ON COLUMN danawa_products.filter_attrs IS '필터 속성값 (JSON)';
COMMENT ON COLUMN danawa_products.coupang_pcode IS '쿠팡 제품 코드 (외부 연동용)';

-- =====================================================
-- 5. danawa_reviews (리뷰) - 미래용
-- =====================================================
CREATE TABLE IF NOT EXISTS danawa_reviews (
  id SERIAL PRIMARY KEY,
  pcode TEXT NOT NULL REFERENCES danawa_products(pcode) ON DELETE CASCADE,
  source TEXT,                                  -- 출처 (쿠팡, 네이버 등)
  rating INT CHECK (rating >= 1 AND rating <= 5), -- 평점 (1-5)
  content TEXT,                                 -- 리뷰 내용
  author TEXT,                                  -- 작성자 (익명)
  review_date DATE,                             -- 작성일
  helpful_count INT DEFAULT 0,                  -- 도움됨 수
  crawled_at TIMESTAMPTZ,                       -- 크롤링 시점
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_danawa_reviews_pcode ON danawa_reviews(pcode);
CREATE INDEX IF NOT EXISTS idx_danawa_reviews_source ON danawa_reviews(source);
CREATE INDEX IF NOT EXISTS idx_danawa_reviews_rating ON danawa_reviews(rating);

COMMENT ON TABLE danawa_reviews IS '제품 리뷰 데이터 (미래용)';

-- =====================================================
-- RLS (Row Level Security) 설정
-- =====================================================

-- 모든 테이블 RLS 활성화
ALTER TABLE danawa_category_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE danawa_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE danawa_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE danawa_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE danawa_reviews ENABLE ROW LEVEL SECURITY;

-- 읽기 정책 (공개 데이터)
CREATE POLICY "Allow public read on danawa_category_groups"
  ON danawa_category_groups FOR SELECT USING (true);

CREATE POLICY "Allow public read on danawa_categories"
  ON danawa_categories FOR SELECT USING (true);

CREATE POLICY "Allow public read on danawa_filters"
  ON danawa_filters FOR SELECT USING (true);

CREATE POLICY "Allow public read on danawa_products"
  ON danawa_products FOR SELECT USING (true);

CREATE POLICY "Allow public read on danawa_reviews"
  ON danawa_reviews FOR SELECT USING (true);

-- 쓰기 정책 (서비스 역할만)
CREATE POLICY "Allow service role write on danawa_category_groups"
  ON danawa_category_groups FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role write on danawa_categories"
  ON danawa_categories FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role write on danawa_filters"
  ON danawa_filters FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role write on danawa_products"
  ON danawa_products FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role write on danawa_reviews"
  ON danawa_reviews FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 완료
-- =====================================================
