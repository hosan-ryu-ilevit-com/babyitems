-- =====================================================
-- 카테고리별 추천 룰맵 테이블
-- 생성일: 2024-12-08
-- 용도: v2 추천 플로우를 위한 JSON 룰맵 저장
-- =====================================================

-- category_rules 테이블 생성
CREATE TABLE IF NOT EXISTS category_rules (
  category_key TEXT PRIMARY KEY,                    -- 카테고리 키 (예: baby_bottle, stroller)
  category_name TEXT NOT NULL,                      -- 한글명 (예: 젖병, 유모차)
  target_category_codes TEXT[] DEFAULT '{}',       -- 다나와 카테고리 코드 배열
  
  -- 3가지 핵심 JSON 룰맵
  logic_map JSONB DEFAULT '{}'::jsonb,             -- 체감속성 점수 계산 룰
  ui_balance_game JSONB DEFAULT '[]'::jsonb,       -- 밸런스 게임 시나리오
  ui_negative_filter JSONB DEFAULT '[]'::jsonb,    -- 단점 필터 옵션
  
  -- UI 관련
  intro_message TEXT,                               -- Step 0 가이드 메시지
  is_active BOOLEAN DEFAULT true,                   -- 활성화 여부
  
  -- 메타
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_category_rules_active ON category_rules(is_active);

-- 코멘트
COMMENT ON TABLE category_rules IS 'v2 추천 플로우를 위한 카테고리별 룰맵';
COMMENT ON COLUMN category_rules.category_key IS '카테고리 키 (예: baby_bottle, formula_pot)';
COMMENT ON COLUMN category_rules.target_category_codes IS '다나와 카테고리 코드 배열';
COMMENT ON COLUMN category_rules.logic_map IS '체감속성 점수 계산 룰 (JSON)';
COMMENT ON COLUMN category_rules.ui_balance_game IS '밸런스 게임 시나리오 (JSON 배열)';
COMMENT ON COLUMN category_rules.ui_negative_filter IS '단점 필터 옵션 (JSON 배열)';

-- RLS 활성화
ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

-- 읽기 정책 (공개)
CREATE POLICY "Allow public read on category_rules"
  ON category_rules FOR SELECT USING (true);

-- 쓰기 정책 (서비스 역할만)
CREATE POLICY "Allow service role write on category_rules"
  ON category_rules FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- 완료
-- =====================================================
