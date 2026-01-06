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
  reason: string;                  // 추천 이유 (LLM 생성)
  highlights: string[];            // 핵심 장점
  concerns?: string[];             // 주의점 (있다면)
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
  error?: string;
}
