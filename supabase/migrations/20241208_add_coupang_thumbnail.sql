-- coupang_thumbnail 컬럼 추가
ALTER TABLE danawa_products 
ADD COLUMN IF NOT EXISTS coupang_thumbnail TEXT;

COMMENT ON COLUMN danawa_products.coupang_thumbnail IS '쿠팡 상품 썸네일 URL';
