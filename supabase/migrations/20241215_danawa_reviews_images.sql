-- =====================================================
-- 다나와 리뷰 테이블 이미지 컬럼 추가 마이그레이션
-- 생성일: 2024-12-15
-- =====================================================

-- 기존 danawa_reviews 테이블에 이미지 컬럼 추가
ALTER TABLE danawa_reviews
ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;

-- 구매처(쇼핑몰) 컬럼 추가
ALTER TABLE danawa_reviews
ADD COLUMN IF NOT EXISTS mall_name TEXT;

-- 리뷰 고유 ID (다나와에서 제공하는 ID)
ALTER TABLE danawa_reviews
ADD COLUMN IF NOT EXISTS external_review_id TEXT;

-- 중복 방지를 위한 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_danawa_reviews_pcode_external_id
ON danawa_reviews(pcode, external_review_id)
WHERE external_review_id IS NOT NULL;

-- 이미지 GIN 인덱스 (JSONB 검색용)
CREATE INDEX IF NOT EXISTS idx_danawa_reviews_images_gin
ON danawa_reviews USING gin(images);

COMMENT ON COLUMN danawa_reviews.images IS '리뷰 이미지 배열 [{thumbnail: string, original: string}]';
COMMENT ON COLUMN danawa_reviews.mall_name IS '구매처 (11번가, G마켓, 옥션 등)';
COMMENT ON COLUMN danawa_reviews.external_review_id IS '다나와 리뷰 고유 ID (중복 방지용)';

-- =====================================================
-- 완료
-- =====================================================
