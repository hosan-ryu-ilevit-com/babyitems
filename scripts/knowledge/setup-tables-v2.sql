-- Knowledge Agent Tables v2 (Manus 아키텍처 강화)
-- 실행: Supabase Dashboard > SQL Editor
-- 변경점: LLM 전처리 컬럼 강화, 리뷰 인사이트 통합

-- 1. 카테고리별 트렌드/지식 (Cold Storage)
DROP TABLE IF EXISTS knowledge_categories_v2 CASCADE;
CREATE TABLE knowledge_categories_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key VARCHAR(100) UNIQUE NOT NULL,
  category_name VARCHAR(200) NOT NULL,
  danawa_code VARCHAR(50),

  -- [Stable Prefix] LLM이 사전 생성한 도메인 지식
  market_trend TEXT,                              -- 시장 트렌드 (2-3문장)
  buying_guide TEXT,                              -- 구매 가이드 (2-3문장)
  common_tradeoffs JSONB DEFAULT '[]'::jsonb,     -- [{a, b, insight}]
  price_segments JSONB DEFAULT '{}'::jsonb,       -- {entry: {min, max, desc}, mid: {...}, premium: {...}}
  key_specs TEXT[],                               -- 이 카테고리에서 중요한 스펙 키 목록
  common_cons TEXT[],                             -- 카테고리 공통 단점 목록 (단점 필터 UI용)

  -- 브랜드 정보
  top_brands JSONB DEFAULT '[]'::jsonb,           -- [{brand, count, avg_price, avg_rating}]

  -- 메타
  product_count INT DEFAULT 0,
  review_count INT DEFAULT 0,
  last_crawled_at TIMESTAMPTZ,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kc_v2_key ON knowledge_categories_v2(category_key);

-- 2. 상품별 정제 데이터 (Cold Storage with LLM Pre-processing)
DROP TABLE IF EXISTS knowledge_products_v2 CASCADE;
CREATE TABLE knowledge_products_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key VARCHAR(100) NOT NULL,
  pcode VARCHAR(50) NOT NULL,
  danawa_category_code VARCHAR(50),

  -- 기본 정보 (Raw)
  name VARCHAR(500) NOT NULL,
  brand VARCHAR(100),
  maker VARCHAR(100),
  price INT,
  thumbnail TEXT,
  product_url TEXT,

  -- 스펙 정보 (Raw)
  specs_text TEXT,                                -- 원본 슬래시 구분 텍스트
  specs_summary JSONB DEFAULT '{}'::jsonb,        -- 파싱된 간단 스펙 {key: value}
  specs_detail JSONB DEFAULT '{}'::jsonb,         -- 상세 스펙표 {key: value}

  -- ===== LLM 전처리 핵심 컬럼 (Manus Cold Storage) =====
  spec_summary_text TEXT,                         -- "12L 대용량, 1700W, 스텐 내부" (한 줄 요약)
  buying_point TEXT,                              -- "이 가격대 유일 올스텐 내부" (구매 포인트)

  -- 리뷰 기반 LLM 분석
  review_summary TEXT,                            -- "바삭함 좋음, 소음 약간 있음" (리뷰 종합)
  pros TEXT[] DEFAULT '{}',                       -- ["대용량", "가성비", "세척 편함"]
  cons TEXT[] DEFAULT '{}',                       -- ["소음", "무거움"]
  target_persona TEXT[] DEFAULT '{}',             -- ["3-4인 가족", "치킨 자주 하는 분"]

  -- 추천 스코어 (LLM이 0-100으로 사전 계산)
  value_score INT,                                -- 가성비 점수
  quality_score INT,                              -- 품질/내구성 점수
  ease_score INT,                                 -- 사용 편의성 점수

  -- 리뷰 통계
  rating DECIMAL(2,1),
  review_count INT DEFAULT 0,
  opinion_count INT DEFAULT 0,

  -- 정렬/필터용
  popularity_rank INT,

  -- 메타
  last_crawled_at TIMESTAMPTZ,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(pcode)
);

CREATE INDEX idx_kp_v2_category ON knowledge_products_v2(category_key);
CREATE INDEX idx_kp_v2_pcode ON knowledge_products_v2(pcode);
CREATE INDEX idx_kp_v2_brand ON knowledge_products_v2(brand);
CREATE INDEX idx_kp_v2_price ON knowledge_products_v2(price);
CREATE INDEX idx_kp_v2_rank ON knowledge_products_v2(popularity_rank);
CREATE INDEX idx_kp_v2_scores ON knowledge_products_v2(value_score, quality_score, ease_score);

-- 3. 리뷰 원본 + LLM 분석
DROP TABLE IF EXISTS knowledge_reviews_v2 CASCADE;
CREATE TABLE knowledge_reviews_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pcode VARCHAR(50) NOT NULL,

  -- 원본
  source VARCHAR(20) NOT NULL,                    -- 'danawa', 'coupang', 'naver'
  review_id VARCHAR(100),                         -- 원본 리뷰 ID (중복 방지)
  author VARCHAR(100),
  content TEXT NOT NULL,
  rating DECIMAL(2,1),
  helpful_count INT DEFAULT 0,
  review_date DATE,

  -- LLM 분석 (크롤링 시점에 처리)
  sentiment VARCHAR(20),                          -- 'positive', 'negative', 'neutral'
  mentioned_pros TEXT[],                          -- 이 리뷰에서 언급된 장점
  mentioned_cons TEXT[],                          -- 이 리뷰에서 언급된 단점
  key_phrase TEXT,                                -- 핵심 문장 (하이라이트용)

  -- 메타
  crawled_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ,

  UNIQUE(pcode, review_id, source)
);

CREATE INDEX idx_kr_v2_pcode ON knowledge_reviews_v2(pcode);
CREATE INDEX idx_kr_v2_sentiment ON knowledge_reviews_v2(sentiment);
CREATE INDEX idx_kr_v2_source ON knowledge_reviews_v2(source);

-- 4. 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at_v2()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kc_v2_updated ON knowledge_categories_v2;
CREATE TRIGGER kc_v2_updated
  BEFORE UPDATE ON knowledge_categories_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_v2();

DROP TRIGGER IF EXISTS kp_v2_updated ON knowledge_products_v2;
CREATE TRIGGER kp_v2_updated
  BEFORE UPDATE ON knowledge_products_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_v2();

-- 5. 테스트용 샘플 데이터
INSERT INTO knowledge_categories_v2 (
  category_key,
  category_name,
  danawa_code,
  market_trend,
  buying_guide,
  common_tradeoffs,
  price_segments,
  key_specs,
  common_cons,
  top_brands
)
VALUES (
  'airfryer',
  '에어프라이어',
  '10252979',
  '2025년 현재 대용량(16L 이상) + 올스텐 내부 + 스팀 복합기능이 트렌드. 터치식 디스플레이와 내부 투시창이 기본 사양.',
  '용량(가족 수 기준: 1-2인 6L, 3-4인 12L, 5인+ 16L), 내부 소재(올스텐 vs 코팅), 조작 방식(터치 vs 다이얼)을 체크하세요.',
  '[
    {"a": "올스텐 내부", "b": "일반 코팅", "insight": "올스텐은 위생적이고 내구성 좋지만 비쌈. 코팅은 저렴하나 2-3년 후 교체 필요."},
    {"a": "대용량(15L+)", "b": "콤팩트(8L-)", "insight": "대용량은 한 번에 많이, 공간 많이 차지. 콤팩트는 공간절약, 소량 자주."},
    {"a": "스팀 기능 포함", "b": "일반 에어프라이어", "insight": "스팀은 촉촉한 요리 가능, 가격 높음. 일반형은 바삭함 특화."}
  ]'::jsonb,
  '{
    "entry": {"min": 50000, "max": 120000, "desc": "6-8L 기본형, 다이얼 조작"},
    "mid": {"min": 120000, "max": 200000, "desc": "12-16L 대용량, 터치 조작, 투시창"},
    "premium": {"min": 200000, "max": 500000, "desc": "20L+ 초대용량, 스팀 복합, 올스텐"}
  }'::jsonb,
  ARRAY['용량', '소비전력', '내부재질', '조작방식', '타이머'],
  ARRAY['소음이 큼', '세척 어려움', '전기세 부담', '공간 많이 차지', '무거움', '예열 오래 걸림'],
  '[
    {"brand": "아이닉", "count": 5, "avg_price": 150000, "avg_rating": 4.5},
    {"brand": "풀무원건강생활", "count": 4, "avg_price": 180000, "avg_rating": 4.6},
    {"brand": "쿠쿠전자", "count": 3, "avg_price": 200000, "avg_rating": 4.7}
  ]'::jsonb
)
ON CONFLICT (category_key) DO UPDATE SET
  market_trend = EXCLUDED.market_trend,
  buying_guide = EXCLUDED.buying_guide,
  common_tradeoffs = EXCLUDED.common_tradeoffs,
  price_segments = EXCLUDED.price_segments,
  key_specs = EXCLUDED.key_specs,
  common_cons = EXCLUDED.common_cons,
  top_brands = EXCLUDED.top_brands,
  updated_at = NOW();

SELECT 'Knowledge Tables v2 created successfully!' as result;
