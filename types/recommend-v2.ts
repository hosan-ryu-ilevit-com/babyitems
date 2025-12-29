// V2 추천 플로우 타입 정의

// ===================================================
// 채팅 메시지 타입
// ===================================================

export type ComponentType =
  | 'scan-animation'     // 스캔 애니메이션
  | 'guide-cards'        // 가이드 카드들
  | 'sub-category'       // 세부 카테고리 선택 (유모차/카시트/기저귀)
  | 'hard-filter'        // 하드 필터 질문
  | 'checkpoint'         // 중간 점검 시각화
  | 'natural-input'      // 자연어 수정 입력
  | 'balance-game'       // 밸런스 게임 A vs B (deprecated)
  | 'balance-carousel'   // 밸런스 게임 캐러셀
  | 'negative-filter'    // 단점 필터 체크박스
  | 'budget-slider'      // 예산 슬라이더
  | 'result-cards'       // 추천 결과
  | 'loading-text';      // 로딩 텍스트 (shimmer 효과)

export interface ChatMessage {
  id: string;
  role: 'assistant' | 'system';
  content: string;
  componentType?: ComponentType;
  componentData?: unknown;
  typing?: boolean;
  speed?: number;           // 타이핑 속도 (ms, 낮을수록 빠름)
  stepTag?: string;         // "0/5", "1/5" 등
  timestamp?: number;
  onTypingComplete?: () => void;  // 타이핑 완료 시 호출될 콜백
}

// ===================================================
// 플로우 Step 타입
// ===================================================

export type FlowStep = -1 | 0 | 1 | 2 | 3 | 4 | 5;

export const STEP_LABELS: Record<FlowStep, string> = {
  '-1': '상황 입력',
  0: '트렌드 브리핑',
  1: '환경 체크',
  2: '후보 분석',
  3: '취향 선택',
  4: '단점 필터',
  5: '예산 & 추천',
};

// ===================================================
// 하드 필터 관련 타입
// ===================================================

export interface HardFilterOption {
  label: string;
  displayLabel?: string;  // 결과 페이지용 레이블 (맥락 포함)
  value: string;
  filter?: Record<string, unknown>;
  category_code?: string;
  aliases?: string[];     // 정규화 전 원본 값들 (필터링 시 모두 매칭)
  // review_priorities 타입 전용 필드
  mentionCount?: number;      // 리뷰 언급 횟수
  sentiment?: 'positive' | 'negative' | 'neutral';  // 리뷰 감정
  sampleReview?: string;      // 대표 리뷰 샘플
  reviewKeywords?: string[];  // 관련 키워드
}

export type HardFilterQuestionType = 'single' | 'multi' | 'review_priorities';

export interface HardFilterQuestion {
  id: string;
  type: HardFilterQuestionType;
  question: string;
  tip?: string;  // 질문에 대한 도움말 (사용자 이해를 돕는 짧은 설명)
  source?: 'review_analysis' | 'spec' | 'manual';  // 질문 출처
  options: HardFilterOption[];
}

export interface HardFilterConfig {
  category_name?: string;
  guide?: {
    title: string;
    points: string[];
    trend: string;
  };
  sub_categories?: Array<{ label: string; code: string }>;
  questions?: HardFilterQuestion[];  // optional - hard_filters.json에서 제거됨
}

// ===================================================
// 밸런스 게임 관련 타입
// ===================================================

export interface BalanceOption {
  text: string;
  target_rule_key: string;
}

export type BalanceQuestionType = 'tradeoff' | 'priority';

export interface BalanceQuestion {
  id: string;
  type?: BalanceQuestionType; // 질문 유형: tradeoff(상반 관계) | priority(우선순위)
  title: string;
  option_A: BalanceOption;
  option_B: BalanceOption;
}

// ===================================================
// 단점 필터 관련 타입
// ===================================================

export interface NegativeFilterOption {
  id: string;
  label: string;
  target_rule_key: string;
  exclude_mode: 'drop_if_lacks' | 'drop_if_has';
}

// ===================================================
// Logic Map 관련 타입
// ===================================================

export interface RuleLogic {
  target: string;           // "spec.재질", "title", "brand" 등
  operator: 'eq' | 'contains' | 'lt' | 'lte' | 'gt' | 'gte';
  value: string | number;
  score: number;
}

export interface RuleDefinition {
  description: string;
  logic: RuleLogic[];
}

export interface CategoryRules {
  category_name: string;
  target_categories: string[];
  rules: Record<string, RuleDefinition>;
}

// ===================================================
// 상품 관련 타입
// ===================================================

export interface ProductItem {
  pcode: string;
  title: string;
  brand: string | null;
  price: number | null;
  lowestPrice?: number | null;  // 다나와/에누리 최저가
  lowestMall?: string | null;   // 최저가 판매처
  lowestLink?: string | null;   // 최저가 링크
  rank: number | null;
  thumbnail: string | null;
  spec: Record<string, unknown>;
  category_code?: string;
  filter_attrs?: Record<string, unknown>;
  averageRating?: number | null;  // 평균 별점 (5점 만점)
  reviewCount?: number | null;    // 리뷰 개수
  dataSource?: string;            // 'danawa' | 'enuri' | 'local'
}

export interface ScoredProduct extends ProductItem {
  baseScore: number;
  negativeScore: number;
  hardFilterScore: number;
  budgetScore: number;
  directInputScore: number;
  totalScore: number;
  matchedRules: string[];
  // Budget-related fields
  isOverBudget: boolean;
  overBudgetAmount: number;
  overBudgetPercent: number;
  // LLM evaluation fields (from /api/recommend-v2)
  fitScore?: number;
  reasoning?: string;
  selectedTagsEvaluation?: Array<{
    userTag: string;
    tagType: 'pros' | 'cons';
    priority: number;
    status: '충족' | '부분충족' | '불충족' | '회피됨' | '부분회피' | '회피안됨';
    evidence: string;
    citations: number[];
    tradeoff?: string;
  }>;
  additionalPros?: Array<{ text: string; citations: number[] }>;
  cons?: Array<{ text: string; citations: number[] }>;
  purchaseTip?: Array<{ text: string; citations: number[] }>;
  citedReviews?: Array<{ index: number; text: string; rating: number }>;
  // Optional fields for enhanced display
  recommendationReason?: string;  // Short reason for recommendation
}

// ===================================================
// 전체 상태 타입
// ===================================================

export interface RecommendV2State {
  // 플로우 상태
  currentStep: FlowStep;
  messages: ChatMessage[];
  typingMessageId: string | null;

  // 데이터
  categoryKey: string;
  categoryName: string;
  products: ProductItem[];
  filteredProducts: ProductItem[];

  // 규칙 데이터
  hardFilterConfig: HardFilterConfig | null;
  logicMap: Record<string, RuleDefinition>;
  balanceQuestions: BalanceQuestion[];
  negativeOptions: NegativeFilterOption[];

  // 동적 생성 데이터
  dynamicBalanceQuestions: BalanceQuestion[];
  dynamicNegativeOptions: NegativeFilterOption[];
  relevantRuleKeys: string[];

  // 사용자 선택
  hardFilterAnswers: Record<string, string>;
  balanceSelections: Set<string>;  // 중복 방지를 위해 Set 사용
  negativeSelections: string[];
  budget: { min: number; max: number };

  // 추천 결과
  scoredProducts: ScoredProduct[];
  top3Products: ScoredProduct[];

  // UI 상태
  isLoading: boolean;
  isCalculating: boolean;
  error: string | null;
}

// ===================================================
// 컴포넌트 Props 타입
// ===================================================

// 가이드 카드용 장점/단점 아이템
export interface GuideProConItem {
  text: string;
  mentionRate?: number;  // 리뷰 언급률 (%)
  dealBreakerFor?: string;  // 단점의 경우: 누구에게 치명적인지
}

// 가이드 카드용 트레이드오프
export interface GuideTradeoff {
  title: string;
  optionA: string;
  optionB: string;
}

export interface GuideCardsData {
  // 기존 (fallback용)
  title: string;
  summary?: string;
  points: string[];
  trend: string;
  // 새로운 구조 (초보 부모 친화적)
  topPros?: GuideProConItem[];      // "이건 꼭 확인하세요!" - 실구매자 top 장점
  topCons?: GuideProConItem[];      // "이건 피하세요!" - deal_breaker 단점
  keyTradeoff?: GuideTradeoff;      // "고민되시죠?" - 핵심 트레이드오프
  // 리뷰 분석 시각화용
  productThumbnails?: string[];     // 상위 제품 썸네일 URL (최대 5개)
  analyzedReviewCount?: number;     // 분석된 리뷰 개수
}

export interface HardFilterData {
  question: HardFilterQuestion;
  currentIndex: number;
  totalCount: number;
  selectedValue?: string;           // deprecated: use selectedValues for multi-select
  selectedValues?: string[];        // 다중 선택 지원
  onNext?: () => void;              // 다음 버튼 클릭 핸들러
  dynamicTip?: string;              // LLM이 생성한 동적 팁 (question.tip보다 우선)
}

export interface CheckpointData {
  totalProducts: number;
  filteredCount: number;
  conditions: Array<{ label: string; value: string }>;
  productThumbnails?: string[];  // 필터링된 상품 썸네일 (최대 5개)
}

export interface BalanceGameData {
  question: BalanceQuestion;
  currentIndex: number;
  totalCount: number;
}

export interface NegativeFilterData {
  options: NegativeFilterOption[];
  selectedKeys: string[];
}

export interface BudgetSliderData {
  min: number;
  max: number;
  currentMin: number;
  currentMax: number;
  step: number;
}

export interface ResultCardsData {
  products: ScoredProduct[];
  categoryName: string;
}

// ===================================================
// API 응답 타입
// ===================================================

export interface RulesApiResponse {
  success: boolean;
  data: {
    category_key: string;
    category_name: string;
    target_categories: string[];
    logic_map: Record<string, RuleDefinition>;
    balance_game: BalanceQuestion[];
    negative_filter: NegativeFilterOption[];
  };
}

export interface ProductsApiResponse {
  success: boolean;
  data: {
    categoryKey: string;
    categoryName: string;
    targetCategories: string[];
    products: ProductItem[];
    count: number;
  };
}

export interface ScoreApiResponse {
  success: boolean;
  data: {
    categoryKey: string;
    categoryName: string;
    scoredProducts: ScoredProduct[];
    top3: ScoredProduct[];
    stats: {
      totalCount: number;
      filteredCount: number;
      appliedBalanceKeys: string[];
      appliedNegativeKeys: string[];
    };
  };
}

export interface ParseConditionsApiResponse {
  success: boolean;
  data: {
    parsedConditions: Record<string, string>;
    confidence: number;
    message: string;
  };
}

// ===================================================
// 카테고리별 예산 범위
// ===================================================

export const CATEGORY_BUDGET_RANGES: Record<string, { min: number; max: number; step: number }> = {
  baby_bottle: { min: 5000, max: 100000, step: 5000 },
  formula_pot: { min: 30000, max: 300000, step: 10000 },
  stroller: { min: 100000, max: 2000000, step: 50000 },
  car_seat: { min: 100000, max: 1500000, step: 50000 },
  diaper: { min: 10000, max: 100000, step: 5000 },
  high_chair: { min: 50000, max: 500000, step: 10000 },
  baby_bed: { min: 100000, max: 1000000, step: 50000 },
  thermometer: { min: 10000, max: 100000, step: 5000 },
  baby_wipes: { min: 5000, max: 50000, step: 1000 },
  formula: { min: 20000, max: 100000, step: 5000 },
  formula_maker: { min: 100000, max: 500000, step: 10000 },
  pacifier: { min: 5000, max: 50000, step: 1000 },
  baby_sofa: { min: 50000, max: 300000, step: 10000 },
  baby_desk: { min: 50000, max: 500000, step: 10000 },
  nasal_aspirator: { min: 10000, max: 200000, step: 10000 },
  ip_camera: { min: 30000, max: 300000, step: 10000 },
};

// ===================================================
// 카테고리별 기본 밸런스 질문 ID (최소 보장용)
// ===================================================

export const DEFAULT_BALANCE_QUESTIONS: Record<string, string[]> = {
  baby_bottle: ['bg_bottle_01', 'bg_bottle_03'],      // 가벼움 vs 안전, 배앓이 vs 모유실감
  formula_pot: ['bg_pot_01', 'bg_pot_02'],            // 보온 vs 냉각, 편의 vs 위생
  stroller: ['bg_stroller_01', 'bg_stroller_02'],     // 무게 vs 안정, 폴딩
  car_seat: ['bg_carseat_01', 'bg_carseat_02'],       // 회전 vs 바구니, 안전기준
  diaper: ['bg_diaper_01', 'bg_diaper_03'],           // 통기성 vs 흡수력, 성분 vs 가성비
  baby_wipes: ['bg_wipes_01', 'bg_wipes_02'],         // 두께 vs 휴대, 성분
  formula: ['bg_formula_01', 'bg_formula_03'],        // 소화 vs 영양, 외출
  thermometer: ['bg_therm_01', 'bg_therm_02'],        // 비접촉 vs 정확, 빠름
  high_chair: ['bg_highchair_01', 'bg_highchair_02'], // 발받침, 청소
};

// ===================================================
// V2 결과 페이지 관련 타입
// ===================================================

export interface DanawaPriceData {
  pcode: string;
  lowest_price: number | null;
  lowest_mall: string | null;
  lowest_link: string | null;
  mall_prices: Array<{
    mall: string;
    price: number;
    delivery: string;
    seller: string;
    link: string;
  }>;
}

export interface V2ResultProduct extends ScoredProduct {
  // 다나와 가격 정보
  danawaPrice?: DanawaPriceData | null;
  // 매칭된 하드 필터 조건 (표시용)
  matchedHardFilters?: Array<{
    label: string;
    value: string;
  }>;
  // LLM 생성 추천 이유 (선택적)
  recommendationReason?: string;
}

export interface V2ResultPageState {
  products: V2ResultProduct[];
  categoryKey: string;
  categoryName: string;
  conditions: Array<{ label: string; value: string }>;
  budget: { min: number; max: number };
  isLoading: boolean;
  error: string | null;
}

export interface V2ResultApiResponse {
  success: boolean;
  data: {
    prices: DanawaPriceData[];
    specs: Array<{
      pcode: string;
      spec: Record<string, unknown>;
      filter_attrs: Record<string, unknown>;
    }>;
  };
}

// ===================================================
// V2 최종 추천 API 관련 타입 (LLM 기반)
// ===================================================

export interface RecommendedProduct extends ScoredProduct {
  recommendationReason: string;  // LLM이 생성한 개인화된 추천 이유
  matchedPreferences: string[];  // 매칭된 사용자 선호 항목들
}

export interface RecommendFinalApiRequest {
  categoryKey: string;
  candidateProducts: ScoredProduct[];
  userContext?: {
    hardFilterAnswers?: Record<string, string[]>;
    balanceSelections?: string[];   // 선택한 밸런스 게임 rule_key
    negativeSelections?: string[];  // 선택한 단점 필터 rule_key
  };
  budget?: { min: number; max: number };
}

export interface RecommendFinalApiResponse {
  success: boolean;
  data?: {
    categoryKey: string;
    categoryName: string;
    top3Products: RecommendedProduct[];
    selectionReason: string;      // 전체 선정 기준 설명
    generated_by: 'llm' | 'fallback';
    totalCandidates: number;
  };
  error?: string;
}

// ===================================================
// V2 동적 질문 생성 API 관련 타입
// ===================================================

export interface GenerateQuestionsApiRequest {
  categoryKey: string;
  hardFilterAnswers?: Record<string, string[]>;
  filteredProductCount?: number;
}

export interface GenerateQuestionsApiResponse {
  success: boolean;
  data?: {
    category_key: string;
    category_name: string;
    guide: {
      title: string;
      summary: string;
      key_points: string[];
      trend: string;
    };
    balance_questions: BalanceQuestion[];
    negative_filter_options: NegativeFilterOption[];
    generated_by: 'llm' | 'fallback';
  };
  error?: string;
}

// ===================================================
// 제품 옵션/변형 관련 타입 (그룹핑용)
// ===================================================

/**
 * 제품 변형 (옵션) 정보
 * 같은 제품의 다른 용량/개수/연도 버전
 */
export interface ProductVariant {
  pcode: string;
  title: string;
  optionLabel: string;  // "150ml", "2개입", "2024년" 등
  price: number | null;
  rank: number | null;
}

/**
 * 옵션 정보가 포함된 추천 제품
 */
export interface RecommendedProductWithVariants extends RecommendedProduct {
  variants: ProductVariant[];  // 같은 그룹의 다른 옵션들 (가격 오름차순)
  optionCount: number;         // 총 옵션 수 (1이면 옵션 없음)
  priceRange: {
    min: number | null;
    max: number | null;
  };
}

/**
 * V2 결과 제품 (옵션 포함)
 */
export interface V2ResultProductWithVariants extends V2ResultProduct {
  variants: ProductVariant[];
  optionCount: number;
  priceRange: {
    min: number | null;
    max: number | null;
  };
}

/**
 * 옵션 선택 시 가격 조회 응답
 */
export interface VariantPriceResponse {
  success: boolean;
  data?: {
    pcode: string;
    title: string;
    price: number | null;
    danawaPrice: DanawaPriceData | null;
  };
  error?: string;
}

// ===================================================
// 사용자 컨텍스트 타입 (추천 로직용)
// ===================================================

/**
 * 밸런스 게임 선택 정보
 */
export interface BalanceGameChoice {
  questionId: string;
  choice: string;           // 선택한 옵션의 target_rule_key
  description: string;      // 자연어 설명 (예: "세척 편리성 > 온도 정확성")
}

/**
 * 자연어 입력 정보
 */
export interface NaturalLanguageInput {
  stage: string;            // 어느 단계에서 입력했는지 ('experiential_tags', 'hard_filters', 'balance_game', etc.)
  timestamp: string;        // 입력 시각
  input: string;            // 사용자 입력 원문
}

/**
 * AI Helper에 전달되는 사용자의 이전 선택 정보
 */
export interface UserSelections {
  hardFilters?: Array<{ questionText: string; selectedLabels: string[] }>;
  balanceGames?: Array<{ title: string; selectedOption: string }>;
  naturalLanguageInputs?: NaturalLanguageInput[];
  // 초기 컨텍스트 입력 (Step -1)
  initialContext?: string;
}

/**
 * 사용자 컨텍스트 (추천 로직 및 결과 표시용 모든 정보)
 */
export interface UserContext {
  // 기본 정보
  categoryKey?: string;
  anchorProduct?: ProductItem;
  budget?: { min: number; max: number } | string;

  // 하드필터 답변 (기존)
  hardFilterAnswers?: Record<string, string[]>;

  // 하드필터 직접 입력 답변 (질문ID -> 입력값)
  hardFilterDirectInputs?: Record<string, string>;

  // 체감속성 태그 (첫 번째 질문, review_priorities 타입)
  experientialTags?: string[];

  // 밸런스 게임 선택
  balanceGameChoices?: BalanceGameChoice[];
  balanceSelections?: string[];

  // 단점 회피 태그
  negativeTagAvoidances?: string[];
  negativeSelections?: string[];

  // 자연어 입력 (모든 단계)
  naturalLanguageInputs?: NaturalLanguageInput[];

  // 표시용 레이블 매핑
  balanceLabels?: Record<string, string>;
  negativeLabels?: Record<string, string>;
  hardFilterLabels?: Record<string, string>;

  // 필터 정의 및 설정
  hardFilterDefinitions?: Record<string, Record<string, unknown>>;
  hardFilterConfig?: {
    questions: Array<{
      id: string;
      type: 'single' | 'multi' | 'review_priorities';
      question: string;
      options: Array<{ id: string; text: string; [key: string]: unknown }>;
    }>;
  };

  // 사용자가 처음 입력한 자연어 상황 설명
  initialContext?: string;
}

// ===================================================
// 분석 타임라인 관련 타입
// ===================================================

/**
 * 분석 타임라인 단계
 * AI 추천 과정의 각 단계를 상세히 표시하기 위한 타입
 */
export interface TimelineStep {
  id: string;
  title: string;
  icon: string;
  details: string[];  // 구체적인 분석 내용
  subDetails?: Array<{  // 중첩된 상세 정보 (선택)
    label: string;
    items: string[];
  }>;
  timestamp: number;  // Date.now()
  status: 'completed' | 'in_progress' | 'pending';
}

/**
 * 전체 분석 타임라인
 */
export interface AnalysisTimeline {
  steps: TimelineStep[];
  startTime: number;
  endTime: number;
}

// ===================================================
// 직접 입력 관련 타입
// ===================================================

/**
 * AI 분석 결과 (직접 입력용)
 * 사용자의 자연어 입력을 분석하여 키워드 추출 및 점수 영향도 결정
 */
export interface DirectInputAnalysis {
  keywords: string[];                 // 추출된 키워드 (title/리뷰 검색용)
  scoreImpact: number;                // 점수 영향 (+10 ~ +30)
  type: 'preference' | 'avoidance';   // 선호/회피
  reasoning?: string;                 // AI 분석 이유
}
