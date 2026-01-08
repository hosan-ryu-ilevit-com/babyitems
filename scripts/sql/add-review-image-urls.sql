-- ============================================================================
-- knowledge_reviews_cache 테이블에 image_urls 컬럼 추가
--
-- 포토 리뷰의 이미지 URL을 저장하기 위한 컬럼
-- 형식: JSONB 배열 (예: ["https://...", "https://..."])
-- ============================================================================

-- 1) image_urls 컬럼 추가
ALTER TABLE knowledge_reviews_cache
ADD COLUMN IF NOT EXISTS image_urls JSONB DEFAULT NULL;

-- 2) 컬럼 설명 추가
COMMENT ON COLUMN knowledge_reviews_cache.image_urls IS '포토 리뷰 이미지 URL 배열 (JSONB)';

-- 3) 포토 리뷰만 조회할 때 사용할 인덱스 (선택적)
-- 포토 리뷰가 있는 경우에만 인덱싱
CREATE INDEX IF NOT EXISTS idx_krc_has_images
ON knowledge_reviews_cache ((image_urls IS NOT NULL AND image_urls != '[]'::jsonb))
WHERE image_urls IS NOT NULL AND image_urls != '[]'::jsonb;

-- ============================================================================
-- 확인 쿼리
-- ============================================================================

-- 테이블 구조 확인
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'knowledge_reviews_cache';

-- 포토 리뷰 개수 확인
-- SELECT COUNT(*) AS photo_reviews
-- FROM knowledge_reviews_cache
-- WHERE image_urls IS NOT NULL AND jsonb_array_length(image_urls) > 0;

-- 포토 리뷰 샘플 조회
-- SELECT pcode, review_id, content, image_urls
-- FROM knowledge_reviews_cache
-- WHERE image_urls IS NOT NULL AND jsonb_array_length(image_urls) > 0
-- LIMIT 10;
