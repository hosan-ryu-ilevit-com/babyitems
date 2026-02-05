/**
 * Knowledge Agent V3 - 타입 정의
 *
 * 장기기억/단기기억 메모리 시스템을 위한 타입들
 */

// ============================================================================
// 장기기억 (Long-Term Memory) 타입
// ============================================================================

export interface LongTermMemoryData {
  categoryKey: string;
  categoryName: string;
  lastUpdated: string;
  productCount: number;
  reviewCount: number;

  trends: TrendData;
  products: ProductKnowledge[];
  buyingGuide: BuyingGuide;
  sources: Source[];
}

export interface TrendData {
  items: string[];        // 핵심 트렌드
  pros: string[];         // 구매자 만족 포인트
  cons: string[];         // 주의해야 할 단점
  priceInsight: string;   // 가격대 인사이트
}

export interface ProductKnowledge {
  rank: number;
  pcode: string;
  name: string;
  brand: string;
  price: number;
  rating: number;
  reviewCount: number;
  specs: Record<string, string>;   // 파싱된 스펙 (용량, 소비전력 등)
  specSummary: string;             // 원본 스펙 요약
  prosFromReviews: string[];       // 리뷰 기반 장점
  consFromReviews: string[];       // 리뷰 기반 단점
  recommendedFor: string;          // 추천 대상
  productUrl: string;
  thumbnail: string | null;
}

export interface BuyingGuide {
  byUserType: Record<string, string>;   // 사용자 유형별 추천
  byBudget: Record<string, string>;     // 예산별 가이드
  commonMistakes: string[];             // 흔한 구매 실수
}

export interface Source {
  title: string;
  url: string;
  accessedAt?: string;
}

// ============================================================================
// 단기기억 (Short-Term Memory) 타입
// ============================================================================

export interface ShortTermMemoryData {
  sessionId: string;
  startedAt: string;
  categoryKey: string;
  categoryName: string;

  webSearchInsights: WebSearchInsight[];
  collectedInfo: Record<string, string>;
  filteredCandidates: CandidateProduct[];
  filterHistory: FilterStep[];

  balanceQuestions: BalanceQuestion[];
  balanceSelections: BalanceSelection[];
  negativeOptions?: NegativeOption[];
  negativeSelections: string[];

  finalRecommendations: Recommendation[];

  // 메타데이터
  totalProducts: number;
  currentCandidateCount: number;
}

export interface WebSearchInsight {
  phase: 'init' | 'question' | 'followup';
  questionId?: string;
  question?: string;
  userAnswer?: string;
  query: string;
  insight: string;
  sources: Source[];
  timestamp: string;
}

export interface CandidateProduct {
  pcode: string;
  name: string;
  brand: string;
  price: number;
  rating: number;
  reviewCount: number;
  specs: Record<string, string>;
  score?: number;
  matchedRules?: string[];
}

export interface FilterStep {
  step: number;
  condition: string;
  remainingCount: number;
  timestamp: string;
}

export interface BalanceSelection {
  questionId: string;
  selected: 'A' | 'B';
  selectedLabel: string;
  selectedRuleKey?: string;
}

export interface Recommendation {
  rank: number;
  pcode: string;
  name: string;
  brand: string;
  price: number;
  score: number;
  reason: string;
}

// ============================================================================
// API 관련 타입
// ============================================================================

export interface QuestionTodo {
  id: string;
  question: string;
  reason: string;
  options: QuestionOption[];
  type: 'single' | 'multi';
  priority: number;
  dataSource: string;
  completed: boolean;
  answer?: string | string[];
}

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  filterSpec?: Record<string, unknown>;  // 스펙 필터 조건
  isPopular?: boolean;  // 인기 옵션 여부 (시장 데이터 기반)
}

export interface BalanceQuestion {
  id: string;
  type: string;
  title: string;
  option_A: {
    text: string;
    target_rule_key: string;
  };
  option_B: {
    text: string;
    target_rule_key: string;
  };
}

export interface NegativeOption {
  id: string;
  label: string;
  target_rule_key: string;
  exclude_mode: 'drop_if_has' | 'drop_if_lacks' | 'penalize';
}

// ============================================================================
// 점수 계산 관련 타입
// ============================================================================

export interface ScoreBreakdown {
  baseScore: number;           // 기본 점수 (리뷰 수, 평점 기반)
  balanceScore: number;        // 밸런스 선택 점수
  negativeScore: number;       // 단점 선택 감점
  budgetScore: number;         // 예산 점수
  totalScore: number;          // 최종 점수
  matchedRules: string[];      // 매칭된 규칙들
}

export interface ScoredProduct extends CandidateProduct {
  scoreBreakdown: ScoreBreakdown;
}

// ============================================================================
// 병합 관련 타입
// ============================================================================

export interface MergeResult {
  success: boolean;
  updatedSections: string[];
  newInsightsCount: number;
  productUpdates: number;
  error?: string;
}

// ============================================================================
// 카테고리 매핑
// ============================================================================

export const CATEGORY_NAME_MAP: Record<string, string> = {
  airfryer: '에어프라이어',
  robotcleaner: '로봇청소기',
  humidifier: '가습기',
  airpurifier: '공기청정기',
  cordlessvacuum: '무선청소기',
  ricecooker: '전기밥솥',
};

export const CATEGORY_KEY_MAP: Record<string, string> = {
  '에어프라이어': 'airfryer',
  '로봇청소기': 'robotcleaner',
  '가습기': 'humidifier',
  '공기청정기': 'airpurifier',
  '무선청소기': 'cordlessvacuum',
  '전기밥솥': 'ricecooker',
};

export function getCategoryName(categoryKey: string): string {
  return CATEGORY_NAME_MAP[categoryKey] || categoryKey;
}

export function getCategoryKey(categoryName: string): string {
  return CATEGORY_KEY_MAP[categoryName] || categoryName;
}

// ============================================================================
// 하드컷팅 관련 타입
// ============================================================================

export interface HardCutProduct extends CandidateProduct {
  matchScore: number;              // 스펙 매칭 점수 (0-100)
  matchedConditions: string[];     // 매칭된 조건들
  specSummary?: string;            // 원본 스펙 요약
  thumbnail?: string | null;       // 썸네일 URL
  productUrl?: string;             // 상품 URL
}

export interface HardCutRule {
  questionId: string;              // 연결된 질문 ID
  specKey: string;                 // 매칭할 스펙 키 (예: "용량", "크기")
  matchType: 'exact' | 'range' | 'contains' | 'regex';
  matchValue: string | number | { min: number; max: number };
  weight: number;                  // 가중치 (0-1)
  mandatory: boolean;              // 필수 조건 여부
}

export interface HardCutResult {
  success: boolean;
  filteredProducts: HardCutProduct[];
  totalBefore: number;
  totalAfter: number;
  appliedRules: Array<{
    rule: string;
    matchedCount: number;
    filteredCount: number;
  }>;
}

// ============================================================================
// 리뷰 크롤링 관련 타입
// ============================================================================

export interface ReviewLite {
  reviewId: string;
  rating: number;
  content: string;
  author?: string;
  date?: string;
  mallName?: string;
}

export interface ReviewCrawlStatus {
  loading: boolean;
  phase: 'idle' | 'crawling' | 'complete' | 'error';
  progress: {
    current: number;
    total: number;
  };
  reviews: Record<string, ReviewLite[]>;
  error?: string;
}

// ============================================================================
// 최종 추천 관련 타입
// ============================================================================

export interface FinalRecommendation {
  rank: number;
  pcode: string;
  product: HardCutProduct;
  reason: string;                  // 추천 이유 (LLM 생성, 호환성 유지)
  oneLiner?: string;               // 제품 강점 (한줄 평) - PLP에서 사용
  personalReason?: string;         // 사용자 맞춤형 추천 이유
  reviewQuotes?: string[];         // 리뷰 인용
  bestFor?: string;                // 이런 분께 추천
}

export interface FinalRecommendationRequest {
  categoryKey: string;
  categoryName: string;
  candidates: HardCutProduct[];
  reviews: Record<string, ReviewLite[]>;
  collectedInfo: Record<string, string>;
  balanceSelections: BalanceSelection[];
  negativeSelections: string[];
}

export interface FinalRecommendationResponse {
  success: boolean;
  recommendations: FinalRecommendation[];
  summary?: string;                // 전체 추천 요약
  filterTags?: FilterTag[];        // 필터 태그
  error?: string;
}

// ============================================================================
// 필터 태그 및 충족도 관련 타입
// ============================================================================

export interface FilterTag {
  id: string;                      // 고유 ID (예: "tag_usage_remote")
  label: string;                   // UI 표시 라벨 (예: "원격근무/강의용")
  category: 'usage' | 'spec' | 'price' | 'feature' | 'avoid';
  keywords: string[];              // 검색용 키워드 (legacy, 하위호환)
  priority: number;                // 정렬 우선순위 (1이 높음)
  sourceQuestion?: string;         // 원본 질문
  sourceAnswer?: string;           // 원본 응답
  sourceType?: 'balance' | 'negative' | 'collected' | 'free_input';  // 조건 출처
  originalCondition?: string;      // 원본 조건 (product-analysis용)
}

/**
 * 태그 충족도 점수
 * - full: 잘 충족 (스펙/리뷰에서 명확히 확인됨)
 * - partial: 일부 충족 (부분적으로 해당되거나 조건부)
 * - null: 미충족 또는 해당 없음 (표시하지 않음)
 */
export type TagScore = 'full' | 'partial' | null;

/**
 * 제품별 태그 충족도 평가 결과
 */
export interface ProductTagScores {
  [tagId: string]: {
    score: TagScore;
    reason?: string;               // 충족/미충족 이유 (선택적)
    evidence?: string;             // 상세 근거 (PDP 재사용용)
    conditionType?: 'hardFilter' | 'balance' | 'negative';  // 조건 유형
  };
}

// ============================================================================
// 하이라이트 관련 타입 (Legacy - 하위호환용)
// ============================================================================

export interface HighlightRange {
  tagId: string;                   // 어떤 태그와 매칭되었는지
  start: number;                   // 시작 인덱스
  end: number;                     // 끝 인덱스
  text: string;                    // 매칭된 텍스트
}

export interface HighlightData {
  oneLinerHighlights: HighlightRange[];
  personalReasonHighlights: HighlightRange[];
  highlightsHighlights: HighlightRange[][];  // 각 highlight 항목별
  reviewHighlights: Record<string, HighlightRange[]>;  // reviewId -> ranges
}

// FinalRecommendation에 태그 충족도 및 하이라이트 데이터 포함된 버전
export interface EnrichedFinalRecommendation extends FinalRecommendation {
  highlightData?: HighlightData;   // Legacy
  tagScores?: ProductTagScores;    // 🆕 태그별 충족도
}

// ============================================================================
// Phase 타입 정의
// ============================================================================

export type Phase =
  | 'onboarding'          // 1단계: 구매 상황 파악
  | 'baby_info'           // 1.1단계: 아기 정보 (baby 카테고리만)
  | 'loading'             // 데이터 분석 + 질문 생성
  | 'report'              // 분석 보고서 (legacy)
  | 'questions'           // 맞춤질문 + 인라인 꼬리질문 + 브랜드/예산
  | 'condition_report'    // 조건 보고서 (인라인 카드)
  | 'hardcut_visual'      // 후보군 시각화
  | 'follow_up_questions' // 추가질문
  | 'balance'             // 밸런스 게임 (legacy)
  | 'final_input'         // 자유 입력
  | 'result'              // 결과
  | 'free_chat';          // 결과 후 채팅

// ============================================================================
// 온보딩 관련 타입
// ============================================================================

/**
 * 온보딩 데이터 - 구매 상황 및 불편사항 수집
 */
export interface OnboardingData {
  purchaseSituation: 'first' | 'replace' | 'gift';
  replaceReasons?: string[];      // 교체 시 불편사항 (복수선택)
  replaceOther?: string;          // 기타 자유입력
}

/**
 * 아기 정보 - baby 카테고리 전용
 * 로컬스토리지에 저장하여 재방문 시 재사용
 */
export interface BabyInfo {
  gender?: 'male' | 'female' | 'unknown';
  birthDate?: string;             // YYYY-MM-DD (태어난 경우)
  expectedDate?: string;          // YYYY-MM-DD (출산예정일)
  isBornYet: boolean;
  calculatedMonths?: number;      // 자동 계산된 개월 수
}

// ============================================================================
// 조건 보고서 관련 타입
// ============================================================================

/**
 * 조건 보고서 - 수집된 정보 요약 및 분석 결과
 */
export interface ConditionReport {
  userProfile: {
    situation: string;             // 구매 상황 요약
    keyNeeds: string[];            // 핵심 니즈
  };
  analysis: {
    recommendedSpecs: Array<{
      specName: string;
      value: string;
      reason: string;
    }>;
    importantFactors: string[];    // 중요 고려사항
    cautions: string[];            // 주의사항
  };
  directions: Array<{
    type: 'premium' | 'value' | 'balanced';
    description: string;
  }>;
  summary: {
    mustHave: string[];            // 필수 조건
    niceToHave: string[];          // 선호 조건
    avoid: string[];               // 회피 조건
  };
}

// ============================================================================
// 인라인 꼬리질문 관련 타입
// ============================================================================

/**
 * 인라인 꼬리질문 - 맞춤질문 답변 직후 즉시 생성
 */
export interface InlineFollowUp {
  question: string;
  type: 'deepdive' | 'contradiction' | 'clarify';
  options: Array<{
    value: string;
    label: string;
  }>;
}

/**
 * 인라인 꼬리질문 API 응답
 */
export interface InlineFollowUpResponse {
  hasFollowUp: boolean;
  followUp?: InlineFollowUp;
  skipReason?: string;
}
