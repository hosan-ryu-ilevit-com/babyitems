-- =====================================================
-- knowledge_products_cache에 variants 컬럼 추가
-- 생성일: 2025-01-22
-- 목적: 제품 구성 옵션 (다른 구성) 저장
-- =====================================================

-- variants 컬럼 추가 (JSONB 타입)
ALTER TABLE knowledge_products_cache
ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT NULL;

-- 컬럼 설명
COMMENT ON COLUMN knowledge_products_cache.variants IS '제품 구성 옵션 (다른 구성) - ProductVariant[] 배열';

-- 예시 데이터 구조:
-- [
--   {
--     "pcode": "29893979",
--     "quantity": "52매",
--     "price": 29990,
--     "unitPrice": "577원/1매",
--     "mallCount": 8,
--     "rank": null,
--     "isActive": false,
--     "productUrl": "https://prod.danawa.com/info/?pcode=29893979"
--   },
--   {
--     "pcode": "30154592",
--     "quantity": "104매",
--     "price": 55500,
--     "unitPrice": "534원/1매",
--     "mallCount": 12,
--     "rank": "1위",
--     "isActive": true,
--     "productUrl": "https://prod.danawa.com/info/?pcode=30154592"
--   }
-- ]

-- =====================================================
-- 완료
-- =====================================================
