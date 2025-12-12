/**
 * v2 추천 플로우 타입 정의
 * - LogicMap: 체감속성 점수 계산 룰
 * - BalanceGame: 밸런스 게임 시나리오
 * - NegativeFilter: 단점 필터 옵션
 */

// =====================================================
// Logic Map (체감속성 점수 계산 엔진)
// =====================================================

export type LogicOperator = 'eq' | 'contains' | 'lt' | 'lte' | 'gt' | 'gte';

export interface LogicRule {
  target: string;           // 대상 필드 (예: "spec.재질", "title", "brand")
  operator: LogicOperator;  // 비교 연산자
  value: string | number;   // 비교 값
  score: number;            // 점수 (+/-)
}

export interface FeelAttribute {
  description: string;      // 사람이 읽을 수 있는 설명
  logic: LogicRule[];       // 점수 계산 룰 배열
}

// 카테고리별 체감속성 맵
export interface CategoryLogicMap {
  category_name: string;
  target_categories: string[];  // 다나와 카테고리 코드 배열
  rules: Record<string, FeelAttribute>;  // rule_key → FeelAttribute
}

// 전체 로직맵 (모든 카테고리)
export type LogicMapData = Record<string, CategoryLogicMap>;

// =====================================================
// Balance Game (밸런스 게임 시나리오)
// =====================================================

export interface BalanceOption {
  text: string;             // 선택지 텍스트
  target_rule_key: string;  // 연결된 체감속성 키
}

export type BalanceQuestionType = 'tradeoff' | 'priority';

export interface BalanceQuestion {
  id: string;               // 질문 ID (예: "bg_bottle_01")
  type?: BalanceQuestionType; // 질문 유형: tradeoff(상반 관계) | priority(우선순위)
  title: string;            // 질문 제목
  option_A: BalanceOption;  // A 선택지
  option_B: BalanceOption;  // B 선택지
}

export interface CategoryBalanceGame {
  category_name: string;
  questions: BalanceQuestion[];
}

// 전체 밸런스 게임 (모든 카테고리)
export interface BalanceGameData {
  scenarios: Record<string, CategoryBalanceGame>;
}

// =====================================================
// Negative Filter (단점 필터)
// =====================================================

export type ExcludeMode = 'drop_if_lacks' | 'drop_if_has';

export interface NegativeFilterOption {
  id: string;               // 필터 ID (예: "neg_bottle_01")
  label: string;            // 표시 텍스트
  target_rule_key: string;  // 연결된 체감속성 키
  exclude_mode: ExcludeMode; // 필터링 방식
}

export interface CategoryNegativeFilter {
  category_name: string;
  options: NegativeFilterOption[];
}

// 전체 단점 필터 (모든 카테고리)
export interface NegativeFilterData {
  filters: Record<string, CategoryNegativeFilter>;
}

// =====================================================
// Category Rules (DB 테이블 타입)
// =====================================================

export interface CategoryRules {
  category_key: string;
  category_name: string;
  target_category_codes: string[];
  logic_map: Record<string, FeelAttribute>;
  ui_balance_game: BalanceQuestion[];
  ui_negative_filter: NegativeFilterOption[];
  intro_message?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// =====================================================
// Scoring Types (점수 계산용)
// =====================================================

export interface ProductScore {
  pcode: string;
  title: string;
  brand?: string;
  price?: number;
  thumbnail?: string;
  rank?: number;
  baseScore: number;           // 기본 점수 (밸런스 게임)
  negativeScore: number;       // 단점 필터 감점
  totalScore: number;          // 최종 점수
  matchedRules: string[];      // 매칭된 룰 키 목록
  spec?: Record<string, unknown>;
}

export interface ScoringResult {
  candidates: ProductScore[];
  totalCount: number;
  filteredCount: number;
  appliedBalanceKeys: string[];
  appliedNegativeKeys: string[];
}

// =====================================================
// API Request/Response Types
// =====================================================

export interface HardFilterRequest {
  categoryKey: string;
  filters?: Record<string, string | number>;  // 하드 필터 조건
  priceMin?: number;
  priceMax?: number;
}

export interface ScoreRequest {
  categoryKey: string;
  productPcodes: string[];           // Step 1에서 필터된 상품 코드 목록
  balanceSelections: string[];       // 선택된 밸런스 게임 rule_key 목록
  negativeSelections: string[];      // 선택된 단점 필터 rule_key 목록
}

export interface RecommendResult {
  top3: ProductScore[];
  reasoning: string[];               // 추천 사유
  userContext: {
    selectedBenefits: string[];
    avoidedIssues: string[];
  };
}
