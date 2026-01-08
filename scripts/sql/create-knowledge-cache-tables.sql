-- ============================================================================
-- Knowledge Agent 캐시 테이블 생성
--
-- 목적: 실시간 크롤링 대신 미리 저장된 데이터 사용으로 속도 개선
-- 갱신: 3일마다 수동 스크립트 실행
-- ============================================================================

-- 1) 제품 메타데이터 캐시 (검색 결과)
-- 특정 키워드로 검색한 제품 목록 저장
CREATE TABLE IF NOT EXISTS knowledge_products_cache (
  id SERIAL PRIMARY KEY,
  query TEXT NOT NULL,                    -- 검색 키워드 (예: "가습기", "전기면도기")
  pcode TEXT NOT NULL,                    -- 다나와 제품 코드
  name TEXT NOT NULL,                     -- 제품명
  brand TEXT,                             -- 브랜드
  price INTEGER,                          -- 가격 (원)
  thumbnail TEXT,                         -- 썸네일 URL
  review_count INTEGER DEFAULT 0,         -- 리뷰 수
  rating DECIMAL(2,1),                    -- 평점 (0.0 ~ 5.0)
  spec_summary TEXT,                      -- 스펙 요약 (원본 텍스트)
  product_url TEXT,                       -- 다나와 상품 페이지 URL
  rank INTEGER,                           -- 검색 결과 내 순위 (1부터 시작)
  crawled_at TIMESTAMPTZ DEFAULT NOW(),   -- 크롤링 시점

  UNIQUE(query, pcode)
);

-- 검색 속도 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_kpc_query ON knowledge_products_cache(query);
CREATE INDEX IF NOT EXISTS idx_kpc_pcode ON knowledge_products_cache(pcode);
CREATE INDEX IF NOT EXISTS idx_kpc_crawled ON knowledge_products_cache(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpc_query_rank ON knowledge_products_cache(query, rank);


-- 2) 리뷰 캐시
-- 제품별 리뷰 저장 (상위 50개 정도)
CREATE TABLE IF NOT EXISTS knowledge_reviews_cache (
  id SERIAL PRIMARY KEY,
  pcode TEXT NOT NULL,                    -- 다나와 제품 코드
  review_id TEXT,                         -- 리뷰 ID (다나와 내부 ID)
  rating INTEGER,                         -- 별점 (1~5)
  content TEXT,                           -- 리뷰 내용
  author TEXT,                            -- 작성자
  review_date TEXT,                       -- 작성 날짜 (문자열)
  mall_name TEXT,                         -- 쇼핑몰명
  crawled_at TIMESTAMPTZ DEFAULT NOW(),   -- 크롤링 시점

  UNIQUE(pcode, review_id)
);

-- 검색 속도 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_krc_pcode ON knowledge_reviews_cache(pcode);
CREATE INDEX IF NOT EXISTS idx_krc_crawled ON knowledge_reviews_cache(crawled_at DESC);


-- 3) 가격 캐시
-- 제품별 가격 정보 저장 (쇼핑몰별 가격 포함)
CREATE TABLE IF NOT EXISTS knowledge_prices_cache (
  id SERIAL PRIMARY KEY,
  pcode TEXT UNIQUE NOT NULL,             -- 다나와 제품 코드
  lowest_price INTEGER,                   -- 최저가
  lowest_mall TEXT,                       -- 최저가 판매처
  lowest_delivery TEXT,                   -- 최저가 배송정보
  lowest_link TEXT,                       -- 최저가 구매 링크
  mall_prices JSONB,                      -- 쇼핑몰별 가격 목록 [{ mall, price, delivery, link }]
  mall_count INTEGER DEFAULT 0,           -- 판매 쇼핑몰 수
  crawled_at TIMESTAMPTZ DEFAULT NOW()    -- 크롤링 시점
);

-- 검색 속도 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_kprc_pcode ON knowledge_prices_cache(pcode);
CREATE INDEX IF NOT EXISTS idx_kprc_crawled ON knowledge_prices_cache(crawled_at DESC);


-- ============================================================================
-- 유틸리티 함수
-- ============================================================================

-- 특정 쿼리의 캐시 삭제 (갱신 전 정리용)
CREATE OR REPLACE FUNCTION clear_knowledge_cache_by_query(target_query TEXT)
RETURNS void AS $$
BEGIN
  -- 해당 쿼리의 제품들 pcode 수집
  WITH target_pcodes AS (
    SELECT DISTINCT pcode FROM knowledge_products_cache WHERE query = target_query
  )
  -- 리뷰 삭제
  DELETE FROM knowledge_reviews_cache WHERE pcode IN (SELECT pcode FROM target_pcodes);

  -- 가격 삭제
  DELETE FROM knowledge_prices_cache WHERE pcode IN (SELECT pcode FROM target_pcodes);

  -- 제품 삭제
  DELETE FROM knowledge_products_cache WHERE query = target_query;
END;
$$ LANGUAGE plpgsql;


-- 캐시 통계 조회
CREATE OR REPLACE FUNCTION get_knowledge_cache_stats()
RETURNS TABLE (
  query TEXT,
  product_count BIGINT,
  review_count BIGINT,
  price_count BIGINT,
  last_crawled TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.query,
    COUNT(DISTINCT p.pcode) AS product_count,
    COUNT(DISTINCT r.id) AS review_count,
    COUNT(DISTINCT pr.id) AS price_count,
    MAX(p.crawled_at) AS last_crawled
  FROM knowledge_products_cache p
  LEFT JOIN knowledge_reviews_cache r ON r.pcode = p.pcode
  LEFT JOIN knowledge_prices_cache pr ON pr.pcode = p.pcode
  GROUP BY p.query
  ORDER BY last_crawled DESC;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- RLS (Row Level Security) - 필요시 활성화
-- ============================================================================

-- 읽기 전용 정책 (anon 키로 조회만 허용)
-- ALTER TABLE knowledge_products_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE knowledge_reviews_cache ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE knowledge_prices_cache ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Allow read access" ON knowledge_products_cache FOR SELECT USING (true);
-- CREATE POLICY "Allow read access" ON knowledge_reviews_cache FOR SELECT USING (true);
-- CREATE POLICY "Allow read access" ON knowledge_prices_cache FOR SELECT USING (true);
