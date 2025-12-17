-- =====================================================
-- 에누리 제품 데이터 테이블 마이그레이션
-- 생성일: 2024-12-16
-- 목적: 에누리 크롤링 데이터 저장, 다나와와 통합 연동
-- =====================================================

-- =====================================================
-- 1. enuri_categories (에누리 카테고리)
-- =====================================================
CREATE TABLE IF NOT EXISTS enuri_categories (
  category_code TEXT PRIMARY KEY,               -- 에누리 카테고리 코드 (예: 100402)
  category_name TEXT NOT NULL,                  -- 카테고리명 (예: 카시트)
  category_path TEXT,                           -- 카테고리 경로 (예: 출산/유아동 > 카시트)
  group_id TEXT REFERENCES danawa_category_groups(id), -- 소속 통합 그룹 (다나와와 공유)
  total_product_count INT DEFAULT 0,            -- 전체 제품 수
  crawled_product_count INT DEFAULT 0,          -- 크롤링된 제품 수
  crawled_at TIMESTAMPTZ,                       -- 마지막 크롤링 시점
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_enuri_categories_group_id ON enuri_categories(group_id);

COMMENT ON TABLE enuri_categories IS '에누리 카테고리 (에누리 사이트 기준)';
COMMENT ON COLUMN enuri_categories.category_code IS '에누리 카테고리 코드 (예: 100402 = 카시트)';
COMMENT ON COLUMN enuri_categories.group_id IS '통합 카테고리 그룹 FK (다나와와 공유)';

-- =====================================================
-- 2. enuri_products (에누리 제품)
-- =====================================================
CREATE TABLE IF NOT EXISTS enuri_products (
  model_no TEXT PRIMARY KEY,                    -- 에누리 상품 번호 (modelNo)
  title TEXT NOT NULL,                          -- 제품명
  brand TEXT,                                   -- 브랜드
  price INT,                                    -- 최저가 (대표가)
  high_price INT,                               -- 최고가
  category_code TEXT REFERENCES enuri_categories(category_code), -- 카테고리 코드
  rank INT,                                     -- 카테고리 내 순위 (인기순)
  detail_url TEXT,                              -- 에누리 상세 URL
  thumbnail TEXT,                               -- 썸네일 URL
  image_url TEXT,                               -- 대표 이미지 URL
  reg_date TEXT,                                -- 등록일 (원본 형식)

  -- 스펙 정보
  spec_raw TEXT,                                -- 스펙 원본 (JSON-LD에서 추출)
  spec JSONB DEFAULT '{}'::jsonb,               -- 파싱된 스펙 (key-value)

  -- 필터 속성 (다나와와 동일 구조)
  filter_attrs JSONB DEFAULT '{}'::jsonb,       -- 필터 속성값

  -- 리뷰 관련
  average_rating DECIMAL(2,1),                  -- 평균 평점 (예: 4.5)
  review_count INT DEFAULT 0,                   -- 총 리뷰 수

  -- 다나와 연동용
  danawa_pcode TEXT,                            -- 매칭된 다나와 pcode (있으면)

  -- 메타
  crawled_at TIMESTAMPTZ,                       -- 크롤링 시점
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_enuri_products_category_code ON enuri_products(category_code);
CREATE INDEX IF NOT EXISTS idx_enuri_products_brand ON enuri_products(brand);
CREATE INDEX IF NOT EXISTS idx_enuri_products_price ON enuri_products(price);
CREATE INDEX IF NOT EXISTS idx_enuri_products_rank ON enuri_products(rank);
CREATE INDEX IF NOT EXISTS idx_enuri_products_danawa_pcode ON enuri_products(danawa_pcode);
CREATE INDEX IF NOT EXISTS idx_enuri_products_review_count ON enuri_products(review_count);

-- 제품명 검색용 GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_enuri_products_title_gin ON enuri_products USING gin(to_tsvector('simple', title));

COMMENT ON TABLE enuri_products IS '에누리 크롤링 제품 데이터';
COMMENT ON COLUMN enuri_products.model_no IS '에누리 상품 번호 (PK)';
COMMENT ON COLUMN enuri_products.spec IS '파싱된 스펙 (JSON)';
COMMENT ON COLUMN enuri_products.danawa_pcode IS '매칭된 다나와 pcode (제품 통합용)';

-- =====================================================
-- 3. enuri_reviews (에누리 리뷰)
-- =====================================================
CREATE TABLE IF NOT EXISTS enuri_reviews (
  id SERIAL PRIMARY KEY,
  model_no TEXT NOT NULL REFERENCES enuri_products(model_no) ON DELETE CASCADE,
  review_id TEXT,                               -- 리뷰 고유 ID (해시 생성)
  source TEXT,                                  -- 출처 쇼핑몰 (11번가, 쿠팡, SSG 등)
  rating INT CHECK (rating >= 1 AND rating <= 5), -- 평점 (1-5)
  content TEXT,                                 -- 리뷰 내용
  author TEXT,                                  -- 작성자 (익명)
  review_date TEXT,                             -- 작성일 (원본 형식)

  -- 이미지 정보
  images JSONB DEFAULT '[]'::jsonb,             -- 이미지 배열 [{thumbnail, original, mallName}]

  -- 메타
  helpful_count INT DEFAULT 0,                  -- 도움됨 수
  crawled_at TIMESTAMPTZ,                       -- 크롤링 시점
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- 중복 방지
  UNIQUE(model_no, review_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_enuri_reviews_model_no ON enuri_reviews(model_no);
CREATE INDEX IF NOT EXISTS idx_enuri_reviews_source ON enuri_reviews(source);
CREATE INDEX IF NOT EXISTS idx_enuri_reviews_rating ON enuri_reviews(rating);
CREATE INDEX IF NOT EXISTS idx_enuri_reviews_images_gin ON enuri_reviews USING gin(images);

COMMENT ON TABLE enuri_reviews IS '에누리 리뷰 데이터 (쇼핑몰 통합 리뷰)';
COMMENT ON COLUMN enuri_reviews.images IS '리뷰 이미지 배열 [{thumbnail, original, mallName}]';
COMMENT ON COLUMN enuri_reviews.source IS '출처 쇼핑몰 (CJ온스타일, SSG, 현대몰 등)';

-- =====================================================
-- 4. enuri_prices (에누리 가격 정보)
-- =====================================================
CREATE TABLE IF NOT EXISTS enuri_prices (
  model_no TEXT PRIMARY KEY REFERENCES enuri_products(model_no) ON DELETE CASCADE,

  -- 최저가 정보 (요약)
  lowest_price INT,                             -- 최저가
  lowest_mall TEXT,                             -- 최저가 쇼핑몰명
  lowest_delivery TEXT,                         -- 최저가 배송비 (예: "무료", "3,000원")
  lowest_link TEXT,                             -- 최저가 상품 링크

  -- 쇼핑몰별 가격 리스트 (상세)
  -- 구조: [{ mall, mallLogo, productName, price, cardPrice, deliveryFee, totalPrice, productUrl, earn }, ...]
  mall_prices JSONB DEFAULT '[]'::jsonb,

  -- 통계
  mall_count INT DEFAULT 0,                     -- 판매 쇼핑몰 수
  price_min INT,                                -- 가격 범위 (최소)
  price_max INT,                                -- 가격 범위 (최대)

  -- 메타
  price_updated_at TIMESTAMPTZ DEFAULT NOW(),   -- 가격 업데이트 시점
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_enuri_prices_lowest_price ON enuri_prices(lowest_price);
CREATE INDEX IF NOT EXISTS idx_enuri_prices_updated_at ON enuri_prices(price_updated_at);
CREATE INDEX IF NOT EXISTS idx_enuri_prices_mall_prices ON enuri_prices USING gin(mall_prices);
CREATE INDEX IF NOT EXISTS idx_enuri_prices_lowest_mall ON enuri_prices(lowest_mall);

COMMENT ON TABLE enuri_prices IS '에누리 가격 정보 (쇼핑몰별 상세)';
COMMENT ON COLUMN enuri_prices.mall_prices IS '쇼핑몰별 가격 리스트 (JSON 배열) - cardPrice, earn 포함';

-- =====================================================
-- 5. product_mappings (다나와-에누리 제품 매핑)
-- =====================================================
CREATE TABLE IF NOT EXISTS product_mappings (
  id SERIAL PRIMARY KEY,
  danawa_pcode TEXT REFERENCES danawa_products(pcode) ON DELETE CASCADE,
  enuri_model_no TEXT REFERENCES enuri_products(model_no) ON DELETE CASCADE,

  -- 매핑 신뢰도
  match_confidence DECIMAL(3,2) DEFAULT 1.0,    -- 매핑 신뢰도 (0.0-1.0)
  match_method TEXT DEFAULT 'manual',           -- 매핑 방법 (manual, title, barcode, etc.)

  -- 메타
  verified BOOLEAN DEFAULT false,               -- 수동 검증 여부
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 유니크 제약
  UNIQUE(danawa_pcode, enuri_model_no)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_product_mappings_danawa_pcode ON product_mappings(danawa_pcode);
CREATE INDEX IF NOT EXISTS idx_product_mappings_enuri_model_no ON product_mappings(enuri_model_no);

COMMENT ON TABLE product_mappings IS '다나와-에누리 제품 매핑 (같은 실제 상품 연결)';
COMMENT ON COLUMN product_mappings.match_confidence IS '매핑 신뢰도 (1.0 = 확실, 0.8 = 높음, 0.5 = 추정)';
COMMENT ON COLUMN product_mappings.match_method IS '매핑 방법 (manual=수동, title=제목유사도, barcode=바코드)';

-- =====================================================
-- RLS (Row Level Security) 설정
-- =====================================================

-- 모든 테이블 RLS 활성화
ALTER TABLE enuri_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE enuri_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE enuri_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE enuri_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_mappings ENABLE ROW LEVEL SECURITY;

-- 읽기 정책 (공개 데이터)
CREATE POLICY "Allow public read on enuri_categories"
  ON enuri_categories FOR SELECT USING (true);

CREATE POLICY "Allow public read on enuri_products"
  ON enuri_products FOR SELECT USING (true);

CREATE POLICY "Allow public read on enuri_reviews"
  ON enuri_reviews FOR SELECT USING (true);

CREATE POLICY "Allow public read on enuri_prices"
  ON enuri_prices FOR SELECT USING (true);

CREATE POLICY "Allow public read on product_mappings"
  ON product_mappings FOR SELECT USING (true);

-- 쓰기 정책 (서비스 역할만)
CREATE POLICY "Allow service role write on enuri_categories"
  ON enuri_categories FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role write on enuri_products"
  ON enuri_products FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role write on enuri_reviews"
  ON enuri_reviews FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role write on enuri_prices"
  ON enuri_prices FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role write on product_mappings"
  ON product_mappings FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 유용한 뷰: 통합 제품 정보
-- =====================================================

-- 다나와 + 에누리 통합 제품 뷰
CREATE OR REPLACE VIEW unified_products AS
SELECT
  'danawa' as source,
  dp.pcode as product_id,
  dp.title,
  dp.brand,
  dp.price,
  dp.thumbnail,
  dp.average_rating,
  dp.review_count,
  dc.category_code,
  dc.category_name,
  dcg.id as group_id,
  dcg.name as group_name,
  pm.enuri_model_no as linked_enuri_id
FROM danawa_products dp
LEFT JOIN danawa_categories dc ON dp.category_code = dc.category_code
LEFT JOIN danawa_category_groups dcg ON dc.group_id = dcg.id
LEFT JOIN product_mappings pm ON dp.pcode = pm.danawa_pcode

UNION ALL

SELECT
  'enuri' as source,
  ep.model_no as product_id,
  ep.title,
  ep.brand,
  ep.price,
  ep.thumbnail,
  ep.average_rating,
  ep.review_count,
  ec.category_code,
  ec.category_name,
  dcg.id as group_id,
  dcg.name as group_name,
  pm.danawa_pcode as linked_danawa_id
FROM enuri_products ep
LEFT JOIN enuri_categories ec ON ep.category_code = ec.category_code
LEFT JOIN danawa_category_groups dcg ON ec.group_id = dcg.id
LEFT JOIN product_mappings pm ON ep.model_no = pm.enuri_model_no;

COMMENT ON VIEW unified_products IS '다나와 + 에누리 통합 제품 뷰 (source 컬럼으로 구분)';

-- =====================================================
-- 완료
-- =====================================================
